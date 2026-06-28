from __future__ import annotations

from datetime import date, timedelta
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.db.models import Fridge, InventoryItem
from app.services.cache.provider_cache import PersistentProviderCache
from app.services.normalization import normalize_name
from app.services.product_intelligence import seed_product_taxonomy
from app.services.recipe_catalog import seed_recipe_catalog
from app.services.provider_models import ProviderLookupError, ProviderServiceError
from app.services.themealdb import ThemealdbRecipeService
from app.services.themealdb_catalog import import_themealdb_catalog

logger = logging.getLogger(__name__)


def seed_core_catalogs(session_factory: sessionmaker) -> None:
    with session_factory() as session:
        seed_product_taxonomy(session)
        seed_recipe_catalog(session)
        session.commit()


def sync_themealdb_recipe_catalog(
    session_factory: sessionmaker,
    settings: Settings,
) -> int:
    if not settings.themealdb_catalog_sync_enabled:
        return 0

    target_count = max(0, settings.themealdb_catalog_sync_limit)
    if target_count == 0:
        return 0

    try:
        with (
            session_factory() as session,
            httpx.Client(base_url=settings.themealdb_base_url) as http_client,
        ):
            service = ThemealdbRecipeService(
                http_client=http_client,
                base_url=settings.themealdb_base_url,
                api_key=settings.themealdb_api_key,
                cache=PersistentProviderCache(session),
            )
            imported_count = import_themealdb_catalog(
                session,
                service,
                target_count=target_count,
                first_letters=settings.themealdb_catalog_sync_letters or (),
            )
            session.commit()
            return imported_count
    except (ProviderLookupError, ProviderServiceError, httpx.HTTPError, ValueError) as exc:
        logger.warning("TheMealDB catalog sync skipped: %s", exc)
        return 0


def seed_demo_data(session_factory: sessionmaker) -> None:
    with session_factory() as session:
        existing_fridge = session.scalar(select(Fridge.id).limit(1))
        if existing_fridge is not None:
            return

        today = date.today()
        fridge = Fridge(
            name="Starter Kitchen",
            kind="fridge",
            description="Seeded demo fridge for the first backend slice.",
        )

        fridge.inventory_items = [
            InventoryItem(
                display_name="Greek Yogurt",
                normalized_name=normalize_name("Greek Yogurt"),
                quantity=500,
                unit="g",
                location="fridge",
                category="Dairy",
                source="seed",
                purchase_date=today - timedelta(days=1),
                expiration_date=today + timedelta(days=1),
            ),
            InventoryItem(
                display_name="Baby Spinach",
                normalized_name=normalize_name("Baby Spinach"),
                quantity=1,
                unit="bag",
                location="fridge",
                category="Produce",
                source="seed",
                purchase_date=today - timedelta(days=1),
                expiration_date=today + timedelta(days=2),
            ),
            InventoryItem(
                display_name="Avocado",
                normalized_name=normalize_name("Avocado"),
                quantity=2,
                unit="pcs",
                location="fridge",
                category="Produce",
                source="seed",
                purchase_date=today - timedelta(days=2),
                expiration_date=today + timedelta(days=3),
            ),
            InventoryItem(
                display_name="Chicken Breast",
                normalized_name=normalize_name("Chicken Breast"),
                quantity=2,
                unit="pcs",
                location="fridge",
                category="Protein",
                source="seed",
                purchase_date=today,
                expiration_date=today + timedelta(days=4),
            ),
            InventoryItem(
                display_name="Eggs",
                normalized_name=normalize_name("Eggs"),
                quantity=6,
                unit="pcs",
                location="fridge",
                category="Protein",
                source="seed",
                purchase_date=today - timedelta(days=2),
                expiration_date=today + timedelta(days=10),
            ),
            InventoryItem(
                display_name="Olive Oil",
                normalized_name=normalize_name("Olive Oil"),
                quantity=750,
                unit="ml",
                location="pantry",
                category="Pantry",
                source="seed",
                purchase_date=today - timedelta(days=30),
                expiration_date=today + timedelta(days=180),
            ),
        ]

        session.add(fridge)
        session.commit()


def import_demo_receipt_items(session_factory: sessionmaker, fridge_id: int) -> list[InventoryItem]:
    today = date.today()
    demo_items = [
        InventoryItem(
            fridge_id=fridge_id,
            display_name="Bananas",
            normalized_name=normalize_name("Bananas"),
            quantity=5,
            unit="pcs",
            location="fridge",
            category="Produce",
            source="receipt_demo",
            purchase_date=today,
            expiration_date=today + timedelta(days=5),
        ),
        InventoryItem(
            fridge_id=fridge_id,
            display_name="Rolled Oats",
            normalized_name=normalize_name("Rolled Oats"),
            quantity=1,
            unit="bag",
            location="pantry",
            category="Pantry",
            source="receipt_demo",
            purchase_date=today,
            expiration_date=today + timedelta(days=180),
        ),
        InventoryItem(
            fridge_id=fridge_id,
            display_name="Milk",
            normalized_name=normalize_name("Milk"),
            quantity=1,
            unit="carton",
            location="fridge",
            category="Dairy",
            source="receipt_demo",
            purchase_date=today,
            expiration_date=today + timedelta(days=6),
        ),
    ]

    with session_factory() as session:
        fridge = session.get(Fridge, fridge_id)
        if fridge is None:
            return []

        session.add_all(demo_items)
        session.commit()

    return demo_items
