from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.v1.deps import get_usda_service
from app.api.v1.pagination import build_list_meta
from app.services.provider_models import NutritionSearchSuggestion, ProviderServiceError
from app.services.usda import UsdaNutritionService


router = APIRouter()


@router.get("/nutrition/search")
def search_nutrition(
    q: str = Query(min_length=2, max_length=120),
    limit: int = Query(default=10, ge=1, le=25),
    usda_service: UsdaNutritionService = Depends(get_usda_service),
) -> dict[str, object]:
    try:
        suggestions = [
            NutritionSearchSuggestion.model_validate(item).model_dump()
            for item in usda_service.search(q, limit)
        ]
    except ProviderServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return {"data": suggestions, "meta": build_list_meta(len(suggestions))}
