from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.deps import get_session
from app.api.v1.pagination import build_list_meta
from app.db.models import Fridge, InventoryItem
from app.services.normalization import normalize_name


router = APIRouter()


EXPIRATION_DATE_SOURCES = {"unknown", "user", "ocr", "provider", "estimated"}


class InventoryItemCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(gt=0)
    unit: str = Field(default="pcs", min_length=1, max_length=30)
    location: str = Field(default="fridge", min_length=1, max_length=50)
    category: str = Field(default="Other", min_length=1, max_length=50)
    purchase_date: date | None = None
    expiration_date: date | None = None
    expiration_date_source: str | None = Field(default=None, min_length=1, max_length=40)
    expiration_confidence: float | None = Field(default=None, ge=0, le=1)
    confidence: float | None = Field(default=None, ge=0, le=1)

    @field_validator("display_name", "unit", "location", "category")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        stripped_value = value.strip()
        if not stripped_value:
            raise ValueError("value cannot be empty")
        return stripped_value

    @field_validator("expiration_date_source")
    @classmethod
    def validate_expiration_date_source(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip().lower()
        if normalized_value not in EXPIRATION_DATE_SOURCES:
            raise ValueError("expiration_date_source is invalid")
        return normalized_value

    @model_validator(mode="after")
    def validate_dates(self) -> "InventoryItemCreateRequest":
        if (
            self.purchase_date is not None
            and self.expiration_date is not None
            and self.expiration_date < self.purchase_date
        ):
            raise ValueError("expiration_date must be on or after purchase_date")
        return self


class InventoryItemUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    quantity: float | None = Field(default=None, gt=0)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    location: str | None = Field(default=None, min_length=1, max_length=50)
    category: str | None = Field(default=None, min_length=1, max_length=50)
    purchase_date: date | None = None
    expiration_date: date | None = None
    expiration_date_source: str | None = Field(default=None, min_length=1, max_length=40)
    expiration_confidence: float | None = Field(default=None, ge=0, le=1)
    confidence: float | None = Field(default=None, ge=0, le=1)

    @field_validator("display_name", "unit", "location", "category")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped_value = value.strip()
        if not stripped_value:
            raise ValueError("value cannot be empty")
        return stripped_value

    @field_validator("expiration_date_source")
    @classmethod
    def validate_expiration_date_source(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip().lower()
        if normalized_value not in EXPIRATION_DATE_SOURCES:
            raise ValueError("expiration_date_source is invalid")
        return normalized_value

    @model_validator(mode="after")
    def validate_dates(self) -> "InventoryItemUpdateRequest":
        if (
            self.purchase_date is not None
            and self.expiration_date is not None
            and self.expiration_date < self.purchase_date
        ):
            raise ValueError("expiration_date must be on or after purchase_date")
        return self


def serialize_inventory_item(item: InventoryItem) -> dict[str, object]:
    return {
        "id": item.id,
        "fridge_id": item.fridge_id,
        "display_name": item.display_name,
        "normalized_name": item.normalized_name,
        "quantity": item.quantity,
        "unit": item.unit,
        "location": item.location,
        "category": item.category,
        "source": item.source,
        "source_provider": item.source_provider,
        "purchase_date": item.purchase_date.isoformat(),
        "expiration_date": item.expiration_date.isoformat() if item.expiration_date else None,
        "expiration_date_source": item.expiration_date_source,
        "expiration_confidence": item.expiration_confidence,
        "confidence": item.confidence,
    }


def _get_fridge_or_404(session: Session, fridge_id: int) -> Fridge:
    fridge = session.get(Fridge, fridge_id)
    if fridge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fridge not found")
    return fridge


@router.get("/fridges/{fridge_id}/inventory-items")
def list_inventory_items(
    fridge_id: int,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    _get_fridge_or_404(session, fridge_id)
    items = session.scalars(
        select(InventoryItem)
        .where(InventoryItem.fridge_id == fridge_id)
        .order_by(InventoryItem.id.asc())
    ).all()
    data = [serialize_inventory_item(item) for item in items]
    return {"data": data, "meta": build_list_meta(len(data))}


@router.post(
    "/fridges/{fridge_id}/inventory-items",
    status_code=status.HTTP_201_CREATED,
)
def create_inventory_item(
    fridge_id: int,
    payload: InventoryItemCreateRequest,
    session: Session = Depends(get_session),
) -> dict[str, dict[str, object]]:
    _get_fridge_or_404(session, fridge_id)

    purchase_date = payload.purchase_date or date.today()
    inventory_item = InventoryItem(
        fridge_id=fridge_id,
        display_name=payload.display_name,
        normalized_name=normalize_name(payload.display_name),
        quantity=payload.quantity,
        unit=payload.unit,
        location=payload.location,
        category=payload.category,
        source="manual",
        source_provider=None,
        purchase_date=purchase_date,
        expiration_date=payload.expiration_date,
        expiration_date_source=(
            payload.expiration_date_source
            or ("user" if payload.expiration_date is not None else "unknown")
        ),
        expiration_confidence=payload.expiration_confidence,
        confidence=payload.confidence if payload.confidence is not None else 1,
    )
    session.add(inventory_item)
    session.commit()
    session.refresh(inventory_item)

    return {"data": serialize_inventory_item(inventory_item)}


@router.patch("/inventory-items/{item_id}")
def update_inventory_item(
    item_id: int,
    payload: InventoryItemUpdateRequest,
    session: Session = Depends(get_session),
) -> dict[str, dict[str, object]]:
    item = session.get(InventoryItem, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    next_purchase_date = payload.purchase_date or item.purchase_date
    next_expiration_date = payload.expiration_date
    if "expiration_date" not in payload.model_fields_set:
        next_expiration_date = item.expiration_date
    if next_expiration_date is not None and next_expiration_date < next_purchase_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="expiration_date must be on or after purchase_date",
        )

    if payload.display_name is not None:
        item.display_name = payload.display_name
        item.normalized_name = normalize_name(payload.display_name)
    if payload.quantity is not None:
        item.quantity = payload.quantity
    if payload.unit is not None:
        item.unit = payload.unit
    if payload.location is not None:
        item.location = payload.location
    if payload.category is not None:
        item.category = payload.category
    if payload.purchase_date is not None:
        item.purchase_date = payload.purchase_date
    if "expiration_date" in payload.model_fields_set:
        item.expiration_date = payload.expiration_date
        item.expiration_date_source = (
            payload.expiration_date_source
            or ("user" if payload.expiration_date is not None else "unknown")
        )
    elif payload.expiration_date_source is not None:
        item.expiration_date_source = payload.expiration_date_source
    if "expiration_confidence" in payload.model_fields_set:
        item.expiration_confidence = payload.expiration_confidence
    if "confidence" in payload.model_fields_set:
        item.confidence = payload.confidence

    session.commit()
    session.refresh(item)

    return {"data": serialize_inventory_item(item)}


@router.get("/fridges/{fridge_id}/inventory-items/expiring")
def list_expiring_inventory_items(
    fridge_id: int,
    days: int = Query(default=3, ge=0, le=365),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    _get_fridge_or_404(session, fridge_id)
    latest_date = date.today() + timedelta(days=days)
    items = session.scalars(
        select(InventoryItem)
        .where(InventoryItem.fridge_id == fridge_id)
        .where(InventoryItem.expiration_date.is_not(None))
        .where(InventoryItem.expiration_date <= latest_date)
        .order_by(InventoryItem.expiration_date.asc(), InventoryItem.id.asc())
    ).all()
    data = [serialize_inventory_item(item) for item in items]
    return {
        "data": data,
        "meta": {
            **build_list_meta(len(data)),
            "days": days,
        },
    }


@router.delete("/inventory-items/{item_id}")
def delete_inventory_item(
    item_id: int,
    session: Session = Depends(get_session),
) -> dict[str, dict[str, object]]:
    item = session.get(InventoryItem, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    item_id_value = item.id
    session.delete(item)
    session.commit()

    return {"data": {"id": item_id_value, "deleted": True}}
