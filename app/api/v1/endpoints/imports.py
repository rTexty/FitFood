from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator
from fastapi import APIRouter, Depends, File, HTTPException, Path, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.deps import (
    get_open_food_facts_service,
    get_receipt_ocr_service,
    get_session,
    get_settings,
)
from app.api.v1.endpoints.inventory import (
    EXPIRATION_DATE_SOURCES,
    serialize_inventory_item,
)
from app.core.config import Settings
from app.db.models import Fridge, InventoryItem
from app.db.seed import import_demo_receipt_items
from app.services.llm.receipt_ocr import MAX_IMAGE_BYTES, ReceiptOcrService
from app.services.normalization import normalize_name
from app.services.open_food_facts import OpenFoodFactsService
from app.services.product_intelligence import enrich_product_name
from app.services.provider_models import (
    BarcodeProductSuggestion,
    ProviderBudgetExceededError,
    ProviderLookupError,
    ProviderServiceError,
    ProviderUnavailableError,
)


router = APIRouter()


class DemoReceiptImportRequest(BaseModel):
    fridge_id: int | None = None


class BarcodeImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fridge_id: int
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    quantity: float = Field(default=1, gt=0)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    location: str = Field(default="fridge", min_length=1, max_length=50)
    category: str | None = Field(default=None, max_length=50)
    purchase_date: date | None = None
    expiration_date: date | None = None
    expiration_date_source: str | None = Field(default=None, min_length=1, max_length=40)
    expiration_confidence: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def validate_dates(self) -> "BarcodeImportRequest":
        self.display_name = self.display_name.strip() if self.display_name else None
        self.unit = self.unit.strip() if self.unit else None
        self.location = self.location.strip()
        self.category = self.category.strip() if self.category else None
        if not self.location or self.display_name == "" or self.unit == "" or self.category == "":
            raise ValueError("text fields cannot be empty")
        self.expiration_date_source = _normalize_expiration_date_source(
            self.expiration_date_source,
        )
        if (
            self.purchase_date is not None
            and self.expiration_date is not None
            and self.expiration_date < self.purchase_date
        ):
            raise ValueError("expiration_date must be on or after purchase_date")
        return self


class ReceiptImportItemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=120)
    normalized_name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(default=1, gt=0)
    unit: str = Field(default="pcs", min_length=1, max_length=30)
    location: str | None = Field(default=None, min_length=1, max_length=50)
    category: str | None = Field(default="Other", max_length=50)
    purchase_date: date | None = None
    expiration_date: date | None = None
    expiration_date_source: str | None = Field(default=None, min_length=1, max_length=40)
    expiration_confidence: float | None = Field(default=None, ge=0, le=1)
    confidence: float = Field(default=0.5, ge=0, le=1)

    @model_validator(mode="after")
    def validate_reviewed_item(self) -> "ReceiptImportItemRequest":
        self.display_name = self.display_name.strip()
        self.normalized_name = self.normalized_name.strip()
        self.unit = self.unit.strip()
        self.location = self.location.strip() if self.location else None
        self.category = self.category.strip() if self.category else None
        if (
            not self.display_name
            or not self.normalized_name
            or not self.unit
            or self.location == ""
            or self.category == ""
        ):
            raise ValueError("text fields cannot be empty")
        self.expiration_date_source = _normalize_expiration_date_source(
            self.expiration_date_source,
        )
        if (
            self.purchase_date is not None
            and self.expiration_date is not None
            and self.expiration_date < self.purchase_date
        ):
            raise ValueError("expiration_date must be on or after purchase_date")
        return self


class ReceiptOcrConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fridge_id: int
    receipt_id: str = Field(min_length=1, max_length=90)
    location: str = Field(default="fridge", min_length=1, max_length=50)
    purchase_date: date | None = None
    items: list[ReceiptImportItemRequest] = Field(min_length=1, max_length=80)

    @model_validator(mode="after")
    def validate_confirm_request(self) -> "ReceiptOcrConfirmRequest":
        self.location = self.location.strip()
        return self


def _normalize_expiration_date_source(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip().lower()
    if normalized_value not in EXPIRATION_DATE_SOURCES:
        raise ValueError("expiration_date_source is invalid")
    return normalized_value


def _resolve_expiration_date_source(expiration_date: date | None, source: str | None) -> str:
    if source is not None:
        return source
    return "user" if expiration_date is not None else "unknown"


@router.post("/imports/receipt/demo", status_code=status.HTTP_201_CREATED)
def import_demo_receipt(
    request: Request,
    payload: DemoReceiptImportRequest | None = None,
    session: Session = Depends(get_session),
) -> dict[str, dict[str, object]]:
    fridge_id = payload.fridge_id if payload and payload.fridge_id is not None else None
    if fridge_id is None:
        first_fridge = session.scalar(select(Fridge).order_by(Fridge.id.asc()))
        if first_fridge is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fridge not found")
        fridge_id = first_fridge.id

    imported_items = import_demo_receipt_items(request.app.state.session_factory, fridge_id)
    if not imported_items:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fridge not found")

    return {
        "data": {
            "items": [serialize_inventory_item(item) for item in imported_items],
            "summary": {
                "fridge_id": fridge_id,
                "imported_count": len(imported_items),
                "source": "demo",
            },
        }
    }


@router.post("/imports/receipt/ocr")
def preview_receipt_ocr_import(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    receipt_ocr_service: ReceiptOcrService = Depends(get_receipt_ocr_service),
) -> dict[str, dict[str, object]]:
    try:
        if not settings.llm_enabled:
            raise ProviderUnavailableError("Receipt OCR is disabled")
        image_bytes = file.file.read(MAX_IMAGE_BYTES + 1)
        preview = receipt_ocr_service.preview_from_image(
            image_bytes,
            file.content_type or "",
        )
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except ProviderBudgetExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except ProviderServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    return {"data": preview.model_dump(mode="json")}


@router.post("/imports/receipt/confirm", status_code=status.HTTP_201_CREATED)
def confirm_receipt_ocr_import(
    payload: ReceiptOcrConfirmRequest,
    session: Session = Depends(get_session),
) -> dict[str, dict[str, object]]:
    fridge = session.get(Fridge, payload.fridge_id)
    if fridge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fridge not found")

    imported_items: list[InventoryItem] = []
    for item in payload.items:
        purchase_date = item.purchase_date or payload.purchase_date or date.today()
        enriched_product = enrich_product_name(
            item.display_name,
            purchase_date=purchase_date,
            category=item.category,
            location=item.location or payload.location,
            session=session,
        )
        expiration_date = item.expiration_date or enriched_product.expiration_date
        expiration_date_source = (
            _resolve_expiration_date_source(item.expiration_date, item.expiration_date_source)
            if item.expiration_date is not None
            else enriched_product.expiration_date_source
        )
        expiration_confidence = (
            item.expiration_confidence
            if item.expiration_confidence is not None
            else enriched_product.expiration_confidence
        )
        imported_items.append(
            InventoryItem(
                fridge_id=payload.fridge_id,
                display_name=enriched_product.display_name,
                normalized_name=enriched_product.normalized_name,
                quantity=item.quantity,
                unit=item.unit,
                location=enriched_product.location,
                category=enriched_product.category,
                source="receipt_ocr",
                source_provider=None,
                purchase_date=purchase_date,
                expiration_date=expiration_date,
                expiration_date_source=expiration_date_source,
                expiration_confidence=expiration_confidence,
                confidence=item.confidence,
            )
        )

    session.add_all(imported_items)
    session.commit()
    for item in imported_items:
        session.refresh(item)

    return {
        "data": {
            "items": [serialize_inventory_item(item) for item in imported_items],
            "summary": {
                "fridge_id": payload.fridge_id,
                "imported_count": len(imported_items),
                "receipt_id": payload.receipt_id,
                "source": "receipt_ocr",
            },
        }
    }


@router.get("/imports/barcode/{barcode}")
def get_barcode_product_suggestion(
    barcode: Annotated[str, Path(pattern=r"^\d{8,14}$")],
    open_food_facts_service: OpenFoodFactsService = Depends(get_open_food_facts_service),
) -> dict[str, dict[str, object]]:
    try:
        suggestion = BarcodeProductSuggestion.model_validate(
            open_food_facts_service.lookup_barcode(barcode)
        )
    except ProviderLookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProviderServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return {"data": suggestion.model_dump()}


@router.post("/imports/barcode/{barcode}", status_code=status.HTTP_201_CREATED)
def import_barcode_product_to_inventory(
    barcode: Annotated[str, Path(pattern=r"^\d{8,14}$")],
    payload: BarcodeImportRequest,
    session: Session = Depends(get_session),
    open_food_facts_service: OpenFoodFactsService = Depends(get_open_food_facts_service),
) -> dict[str, dict[str, object]]:
    fridge = session.get(Fridge, payload.fridge_id)
    if fridge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fridge not found")

    try:
        suggestion = BarcodeProductSuggestion.model_validate(
            open_food_facts_service.lookup_barcode(barcode)
        )
    except ProviderLookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProviderServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    display_name = payload.display_name or suggestion.display_name
    inventory_item = InventoryItem(
        fridge_id=payload.fridge_id,
        display_name=display_name,
        normalized_name=normalize_name(display_name),
        quantity=payload.quantity,
        unit=payload.unit or suggestion.unit,
        location=payload.location,
        category=payload.category or suggestion.category or "Other",
        source="barcode",
        source_provider=suggestion.provider,
        purchase_date=payload.purchase_date or date.today(),
        expiration_date=payload.expiration_date,
        expiration_date_source=_resolve_expiration_date_source(
            payload.expiration_date,
            payload.expiration_date_source,
        ),
        expiration_confidence=payload.expiration_confidence,
        confidence=0.9,
    )
    session.add(inventory_item)
    session.commit()
    session.refresh(inventory_item)

    return {"data": serialize_inventory_item(inventory_item)}
