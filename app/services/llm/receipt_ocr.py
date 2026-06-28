from __future__ import annotations

import base64
import hashlib
from collections.abc import Callable
from datetime import date
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.services.cache.provider_cache import JsonContainer
from app.services.llm.artifacts import AiArtifactStore
from app.services.llm.minimax import MiniMaxJsonResult
from app.services.product_intelligence import enrich_product_name
from app.services.provider_models import (
    ProviderServiceError,
    ReceiptOcrItemSuggestion,
    ReceiptOcrPreview,
)


PROMPT_VERSION = "receipt-ocr-v2"
TASK_TYPE = "receipt_ocr"
SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


class ReceiptOcrChatService(Protocol):
    @property
    def model(self) -> str:
        raise NotImplementedError

    def complete_json(
        self,
        *,
        messages: list[dict[str, Any]],
        max_completion_tokens: int = 2000,
        temperature: float = 0.2,
        top_p: float = 0.95,
    ) -> MiniMaxJsonResult:
        raise NotImplementedError


class ReceiptOcrService:
    def __init__(
        self,
        *,
        chat_service: ReceiptOcrChatService,
        artifact_store: AiArtifactStore,
        product_lookup_session: Session | None = None,
        before_provider_call: Callable[[], None] | None = None,
    ) -> None:
        self._chat_service = chat_service
        self._artifact_store = artifact_store
        self._product_lookup_session = product_lookup_session
        self._before_provider_call = before_provider_call

    def preview_from_image(self, image_bytes: bytes, content_type: str) -> ReceiptOcrPreview:
        normalized_content_type = content_type.strip().lower()
        self._validate_image(image_bytes, normalized_content_type)

        image_hash = hashlib.sha256(image_bytes).hexdigest()
        receipt_id = f"receipt:{image_hash}"
        input_payload = {
            "byte_size": len(image_bytes),
            "content_type": normalized_content_type,
            "image_sha256": image_hash,
            "receipt_id": receipt_id,
        }

        cached_output = self._artifact_store.get_output(
            task_type=TASK_TYPE,
            model=self._chat_service.model,
            input_payload=input_payload,
            prompt_version=PROMPT_VERSION,
        )
        if cached_output is not None:
            try:
                return self._preview_from_output(cached_output, receipt_id)
            except ProviderServiceError:
                pass

        if self._before_provider_call is not None:
            self._before_provider_call()

        result = self._chat_service.complete_json(
            messages=self._build_messages(image_bytes, normalized_content_type),
            max_completion_tokens=2000,
            temperature=0.1,
            top_p=0.9,
        )
        preview = self._preview_from_output(result.output_json, receipt_id)
        stored_output = self._artifact_store.store_output(
            task_type=TASK_TYPE,
            model=self._chat_service.model,
            input_payload=input_payload,
            output_json=preview.model_dump(mode="json"),
            prompt_version=PROMPT_VERSION,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
        )
        return self._preview_from_output(stored_output, receipt_id)

    def _validate_image(self, image_bytes: bytes, content_type: str) -> None:
        if content_type not in SUPPORTED_IMAGE_TYPES:
            supported_types = ", ".join(sorted(SUPPORTED_IMAGE_TYPES))
            raise ProviderServiceError(
                f"Unsupported receipt image type. Supported types: {supported_types}"
            )
        if not image_bytes:
            raise ProviderServiceError("Receipt image is empty")
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise ProviderServiceError("Receipt image is larger than 5 MB")
        if not _content_matches_type(image_bytes, content_type):
            raise ProviderServiceError("Receipt image content does not match declared type")

    def _build_messages(
        self,
        image_bytes: bytes,
        content_type: str,
    ) -> list[dict[str, Any]]:
        encoded_image = base64.b64encode(image_bytes).decode("ascii")
        today = date.today()
        current_year = today.year
        return [
            {
                "role": "system",
                "content": (
                    "You extract grocery receipt data for an inventory app. "
                    f"Today is {today.isoformat()}; the current year is {current_year}. "
                    "Return strict JSON with merchant, purchase_date, and items. "
                    "Dates must be ISO 8601 calendar dates in YYYY-MM-DD format or null. "
                    f"If a receipt date shows day and month but no year, infer {current_year}. "
                    "Never output stale years from model memory such as 2023, 2024, or 2025 "
                    "unless that full year is clearly printed on the receipt. "
                    "If the year is unreadable or uncertain, prefer null over guessing an old year. "
                    "purchase_date is the receipt transaction date, not the model's training date. "
                    "Do not invent expiration_date; include it only when explicitly visible on the receipt "
                    "or product label in the image. "
                    "Each item must include display_name, quantity, unit, category, "
                    "and confidence from 0 to 1. Do not invent items."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Read this grocery receipt image and extract only food "
                            "or household inventory products. Normalize quantities "
                            "to numeric values when possible. Use the current date context "
                            f"({today.isoformat()}) when resolving any receipt date without a year."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{content_type};base64,{encoded_image}",
                        },
                    },
                ],
            },
        ]

    def _preview_from_output(
        self,
        output_json: JsonContainer,
        receipt_id: str,
    ) -> ReceiptOcrPreview:
        try:
            output = _as_object(output_json)
            purchase_date = _date_or_none(output.get("purchase_date"))
            items = _items_from_output(
                output,
                purchase_date=purchase_date,
                product_lookup_session=self._product_lookup_session,
            )
            return ReceiptOcrPreview(
                receipt_id=receipt_id,
                merchant=_string_or_none(output.get("merchant"), max_length=120),
                purchase_date=purchase_date.isoformat() if purchase_date else None,
                items=items,
                summary={
                    "detected_count": len(items),
                    "model": self._chat_service.model,
                    "receipt_id": receipt_id,
                    "source": "minimax_ocr",
                },
            )
        except (TypeError, ValueError) as exc:
            raise ProviderServiceError("MiniMax receipt OCR output was invalid") from exc


def _as_object(output_json: JsonContainer) -> dict[str, Any]:
    if isinstance(output_json, dict):
        return output_json
    if isinstance(output_json, list):
        return {"items": output_json}
    raise ProviderServiceError("MiniMax receipt OCR output was invalid")


def _items_from_output(
    output: dict[str, Any],
    *,
    purchase_date: date | None,
    product_lookup_session: Session | None,
) -> list[ReceiptOcrItemSuggestion]:
    raw_items = output.get("items")
    if not isinstance(raw_items, list):
        return []

    items: list[ReceiptOcrItemSuggestion] = []
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue

        display_name = _first_string(
            raw_item,
            ("display_name", "name", "item_name", "product_name"),
        )
        if display_name is None:
            continue

        item_purchase_date = (
            _date_or_none(raw_item.get("purchase_date"))
            or purchase_date
            or date.today()
        )
        raw_expiration_date = _date_or_none(raw_item.get("expiration_date"))
        raw_expiration_source = _string_or_none(
            raw_item.get("expiration_date_source"),
            max_length=40,
        )
        enriched_product = enrich_product_name(
            display_name,
            purchase_date=item_purchase_date,
            category=_string_or_none(raw_item.get("category"), max_length=50),
            location=_string_or_none(raw_item.get("location"), max_length=50),
            session=product_lookup_session,
        )
        items.append(
            ReceiptOcrItemSuggestion(
                display_name=enriched_product.display_name,
                normalized_name=enriched_product.normalized_name,
                quantity=_positive_float(raw_item.get("quantity"), default=1),
                unit=_string_or_none(raw_item.get("unit"), max_length=30) or "pcs",
                location=enriched_product.location,
                category=enriched_product.category,
                purchase_date=item_purchase_date,
                expiration_date=raw_expiration_date or enriched_product.expiration_date,
                expiration_date_source=raw_expiration_source
                or (
                    "ocr"
                    if raw_expiration_date is not None
                    else enriched_product.expiration_date_source
                ),
                expiration_confidence=_confidence(raw_item.get("expiration_confidence"))
                if raw_item.get("expiration_confidence") is not None
                else (
                    0.65
                    if raw_expiration_date is not None
                    else enriched_product.expiration_confidence
                ),
                confidence=_confidence(raw_item.get("confidence")),
            )
        )
    return items


def _first_string(raw_item: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = _string_or_none(raw_item.get(key), max_length=120)
        if value is not None:
            return value
    return None


def _string_or_none(value: object, *, max_length: int | None = None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized_value = " ".join(value.strip().split())
    if max_length is not None:
        normalized_value = normalized_value[:max_length]
    return normalized_value or None


def _date_string_or_none(value: object) -> str | None:
    parsed_date = _date_or_none(value)
    return parsed_date.isoformat() if parsed_date else None


def _date_or_none(value: object) -> date | None:
    value_string = _string_or_none(value)
    if value_string is None:
        return None
    try:
        return date.fromisoformat(value_string)
    except ValueError:
        return None


def _positive_float(value: object, *, default: float) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)) and value > 0:
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value.replace(",", "."))
        except ValueError:
            return default
        return parsed if parsed > 0 else default
    return default


def _confidence(value: object) -> float:
    confidence = _positive_float(value, default=0.5)
    return min(confidence, 1.0)


def _content_matches_type(image_bytes: bytes, content_type: str) -> bool:
    if content_type == "image/jpeg":
        return image_bytes.startswith(b"\xff\xd8")
    if content_type == "image/png":
        return image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        return (
            len(image_bytes) >= 12
            and image_bytes[:4] == b"RIFF"
            and image_bytes[8:12] == b"WEBP"
        )
    return False
