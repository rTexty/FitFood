from __future__ import annotations

from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
from fastapi import Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import AiArtifact, UserAccount
from app.services.demo_user import get_or_create_demo_user
from app.services.cache.provider_cache import PersistentProviderCache
from app.services.llm import MiniMaxMealPlanner
from app.services.llm.artifacts import AiArtifactStore
from app.services.llm.minimax import MiniMaxChatService
from app.services.llm.openrouter import OpenRouterChatService
from app.services.llm.receipt_ocr import ReceiptOcrService
from app.services.open_food_facts import OpenFoodFactsService
from app.services.provider_models import ProviderBudgetExceededError
from app.services.themealdb import ThemealdbRecipeService
from app.services.usda import UsdaNutritionService

SESSION_COOKIE_NAME = "fitfood_user_id"


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_session(request: Request) -> Generator[Session, None, None]:
    session_factory = request.app.state.session_factory
    with session_factory() as session:
        yield session


def get_current_user_account(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> UserAccount:
    settings = get_settings(request)
    if settings.demo_user_enabled:
        return get_or_create_demo_user(session)

    cookie_user_id = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_user_id:
        existing_user = session.get(UserAccount, cookie_user_id)
        if existing_user is not None:
            return existing_user

    user_id = f"user-{uuid4().hex}"
    now = datetime.now(timezone.utc).replace(microsecond=0)
    user = UserAccount(
        id=user_id,
        email=f"{user_id}@anonymous.fitfood.local",
        display_name="New User",
        locale="en-US",
        timezone="Europe/Moscow",
        created_at=now,
        updated_at=now,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        user_id,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        max_age=60 * 60 * 24 * 365,
    )
    return user


def get_open_food_facts_service(
    request: Request,
) -> Generator[OpenFoodFactsService, None, None]:
    override_service = getattr(request.app.state, "open_food_facts_service", None)
    if override_service is not None:
        yield override_service
        return

    settings = get_settings(request)
    client = httpx.Client(base_url=settings.open_food_facts_base_url)
    try:
        yield OpenFoodFactsService(
            http_client=client,
            base_url=settings.open_food_facts_base_url,
            user_agent=settings.open_food_facts_user_agent,
        )
    finally:
        client.close()


def get_usda_service(request: Request) -> Generator[UsdaNutritionService, None, None]:
    override_service = getattr(request.app.state, "usda_service", None)
    if override_service is not None:
        yield override_service
        return

    settings = get_settings(request)
    client = httpx.Client(base_url=settings.usda_base_url)
    try:
        yield UsdaNutritionService(
            http_client=client,
            base_url=settings.usda_base_url,
            api_key=settings.usda_api_key,
        )
    finally:
        client.close()


def get_themealdb_service(
    request: Request,
    session: Session = Depends(get_session),
) -> Generator[ThemealdbRecipeService, None, None]:
    override_service = getattr(request.app.state, "themealdb_service", None)
    if override_service is not None:
        yield override_service
        return

    settings = get_settings(request)
    client = httpx.Client(base_url=settings.themealdb_base_url)
    try:
        yield ThemealdbRecipeService(
            http_client=client,
            base_url=settings.themealdb_base_url,
            api_key=settings.themealdb_api_key,
            cache=PersistentProviderCache(session),
        )
    finally:
        client.close()


def get_receipt_ocr_service(
    request: Request,
    session: Session = Depends(get_session),
) -> Generator[ReceiptOcrService, None, None]:
    override_service = getattr(request.app.state, "receipt_ocr_service", None)
    if override_service is not None:
        yield override_service
        return

    settings = get_settings(request)
    base_url = (
        settings.openrouter_base_url
        if settings.llm_provider == "openrouter"
        else settings.minimax_base_url
    )
    client = httpx.Client(base_url=base_url)
    try:
        chat_service = (
            OpenRouterChatService(
                http_client=client,
                base_url=settings.openrouter_base_url,
                api_key=settings.openrouter_api_key,
                model=settings.openrouter_model,
                http_referer=settings.openrouter_http_referer,
                app_title=settings.openrouter_app_title,
            )
            if settings.llm_provider == "openrouter"
            else MiniMaxChatService(
                http_client=client,
                base_url=settings.minimax_base_url,
                api_key=settings.minimax_api_key,
                model=settings.minimax_model,
            )
        )
        yield ReceiptOcrService(
            chat_service=chat_service,
            artifact_store=AiArtifactStore(session, provider=settings.llm_provider),
            product_lookup_session=session,
            before_provider_call=lambda: enforce_llm_daily_budget(session, settings),
        )
    finally:
        client.close()


def get_meal_planner(
    request: Request,
    session: Session = Depends(get_session),
) -> Generator[MiniMaxMealPlanner | None, None, None]:
    override_service = getattr(request.app.state, "meal_planner", None)
    if override_service is not None:
        yield override_service
        return

    settings = get_settings(request)
    api_key = (
        settings.openrouter_api_key
        if settings.llm_provider == "openrouter"
        else settings.minimax_api_key
    )
    if not api_key:
        yield None
        return

    base_url = (
        settings.openrouter_base_url
        if settings.llm_provider == "openrouter"
        else settings.minimax_base_url
    )
    client = httpx.Client(base_url=base_url)
    try:
        chat_service = (
            OpenRouterChatService(
                http_client=client,
                base_url=settings.openrouter_base_url,
                api_key=settings.openrouter_api_key,
                model=settings.openrouter_model,
                http_referer=settings.openrouter_http_referer,
                app_title=settings.openrouter_app_title,
            )
            if settings.llm_provider == "openrouter"
            else MiniMaxChatService(
                http_client=client,
                base_url=settings.minimax_base_url,
                api_key=settings.minimax_api_key,
                model=settings.minimax_model,
            )
        )
        yield MiniMaxMealPlanner(chat_service=chat_service, session=session)
    finally:
        client.close()


def enforce_llm_daily_budget(session: Session, settings: Settings) -> None:
    budget = settings.llm_daily_request_budget
    if budget <= 0:
        raise ProviderBudgetExceededError("Daily LLM request budget exceeded")

    start_of_day = datetime.now(timezone.utc).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
        tzinfo=None,
    )
    end_of_day = start_of_day + timedelta(days=1)
    used_requests = session.scalar(
        select(func.count())
        .select_from(AiArtifact)
        .where(
            AiArtifact.provider == settings.llm_provider,
            AiArtifact.status == "succeeded",
            AiArtifact.created_at >= start_of_day,
            AiArtifact.created_at < end_of_day,
        )
    )
    if (used_requests or 0) >= budget:
        raise ProviderBudgetExceededError("Daily LLM request budget exceeded")
