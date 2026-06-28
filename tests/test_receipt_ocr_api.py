from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.db.models import AiArtifact
from app.services.cache.provider_cache import stable_hash
from app.services.product_intelligence import enrich_product_name
from app.services.llm.openrouter import OpenRouterChatService
from app.services.llm.artifacts import AiArtifactStore
from app.services.llm.minimax import MiniMaxJsonResult
from app.services.llm.receipt_ocr import PROMPT_VERSION, ReceiptOcrService
from app.services.provider_models import ProviderServiceError, ReceiptOcrPreview


JPEG_IMAGE = b"\xff\xd8fake receipt jpeg bytes"
PNG_IMAGE = b"\x89PNG\r\n\x1a\nfake receipt png bytes"


def enable_llm(client: TestClient, *, budget: int = 100) -> None:
    client.app.state.settings = replace(
        client.app.state.settings,
        llm_enabled=True,
        minimax_api_key="test-key",
        llm_daily_request_budget=budget,
    )


def enable_openrouter_llm(client: TestClient, *, budget: int = 100) -> None:
    client.app.state.settings = replace(
        client.app.state.settings,
        llm_provider="openrouter",
        llm_enabled=True,
        openrouter_api_key="test-openrouter-key",
        llm_daily_request_budget=budget,
    )


class FakeMiniMaxChatService:
    model = "MiniMax-M3"

    def __init__(self) -> None:
        self.calls = 0
        self.messages: list[dict[str, object]] = []

    def complete_json(
        self,
        *,
        messages: list[dict[str, object]],
        max_completion_tokens: int = 2000,
        temperature: float = 0.2,
        top_p: float = 0.95,
    ) -> MiniMaxJsonResult:
        self.calls += 1
        self.messages = messages
        assert messages
        assert max_completion_tokens == 2000
        return MiniMaxJsonResult(
            output_json={
                "merchant": "Green Market",
                "purchase_date": "2026-06-25",
                "items": [
                    {
                        "display_name": "Greek Yogurt",
                        "quantity": 2,
                        "unit": "cup",
                        "category": "Dairy",
                        "confidence": 0.93,
                    }
                ],
            },
            input_tokens=40,
            output_tokens=20,
            total_tokens=60,
            raw_content="{}",
        )


def test_receipt_ocr_service_caches_same_image(client: TestClient) -> None:
    fake_chat_service = FakeMiniMaxChatService()

    with client.app.state.session_factory() as session:
        service = ReceiptOcrService(
            chat_service=fake_chat_service,
            artifact_store=AiArtifactStore(session),
        )

        first_preview = service.preview_from_image(JPEG_IMAGE, "image/jpeg")
        second_preview = service.preview_from_image(JPEG_IMAGE, "image/jpeg")

    assert fake_chat_service.calls == 1
    assert first_preview.receipt_id == second_preview.receipt_id
    assert first_preview.items[0].display_name == "Greek Yogurt"
    assert first_preview.items[0].normalized_name == "greek yogurt"
    assert first_preview.summary["detected_count"] == 1


def test_receipt_ocr_prompt_uses_current_year_for_ambiguous_dates(
    client: TestClient,
) -> None:
    fake_chat_service = FakeMiniMaxChatService()
    with client.app.state.session_factory() as session:
        service = ReceiptOcrService(
            chat_service=fake_chat_service,
            artifact_store=AiArtifactStore(session),
        )

        service.preview_from_image(JPEG_IMAGE, "image/jpeg")

        artifact = session.query(AiArtifact).first()

    system_message = str(fake_chat_service.messages[0]["content"])
    user_text = str(fake_chat_service.messages[1]["content"][0]["text"])  # type: ignore[index]
    current_year = str(date.today().year)

    assert current_year in system_message
    assert f"infer {current_year}" in system_message
    assert "Never output stale years" in system_message
    assert "2023, 2024, or 2025" in system_message
    assert "prefer null over guessing an old year" in system_message
    assert date.today().isoformat() in user_text
    assert PROMPT_VERSION == "receipt-ocr-v2"
    assert artifact is not None
    assert artifact.prompt_hash == stable_hash(
        {"task_type": "receipt_ocr", "version": PROMPT_VERSION}
    )


def test_receipt_ocr_service_canonicalizes_marketing_names_and_estimates_expiry(
    client: TestClient,
) -> None:
    class TomatoReceiptChatService(FakeMiniMaxChatService):
        def complete_json(self, **_kwargs: object) -> MiniMaxJsonResult:
            self.calls += 1
            return MiniMaxJsonResult(
                output_json={
                    "merchant": "Green Market",
                    "purchase_date": "2026-06-25",
                    "items": [
                        {
                            "display_name": "Кавказские помидоры",
                            "quantity": 1,
                            "unit": "kg",
                            "category": "Produce",
                            "confidence": 0.9,
                        }
                    ],
                },
                input_tokens=30,
                output_tokens=20,
                total_tokens=50,
                raw_content="{}",
            )

    with client.app.state.session_factory() as session:
        service = ReceiptOcrService(
            chat_service=TomatoReceiptChatService(),
            artifact_store=AiArtifactStore(session),
        )

        preview = service.preview_from_image(JPEG_IMAGE, "image/jpeg")

    item = preview.items[0]
    assert item.display_name == "Помидоры"
    assert item.normalized_name == "помидоры"
    assert item.category == "Produce"
    assert item.location == "fridge"
    assert item.purchase_date.isoformat() == "2026-06-25"
    assert item.expiration_date.isoformat() == "2026-06-30"
    assert item.expiration_date_source == "estimated"
    assert item.expiration_confidence == 0.78


def test_product_taxonomy_is_database_backed(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        enriched_product = enrich_product_name(
            "Кавказские помидоры",
            purchase_date=date(2026, 6, 25),
            session=session,
        )

        assert enriched_product.display_name == "Помидоры"
        assert enriched_product.normalized_name == "помидоры"
        assert enriched_product.taxonomy_source == "database"
        assert enriched_product.expiration_date.isoformat() == "2026-06-30"


def test_receipt_ocr_service_rejects_invalid_type(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        service = ReceiptOcrService(
            chat_service=FakeMiniMaxChatService(),
            artifact_store=AiArtifactStore(session),
        )

        with pytest.raises(ProviderServiceError, match="Unsupported receipt image type"):
            service.preview_from_image(b"plain text", "text/plain")


def test_receipt_ocr_service_rejects_spoofed_image_content(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        service = ReceiptOcrService(
            chat_service=FakeMiniMaxChatService(),
            artifact_store=AiArtifactStore(session),
        )

        with pytest.raises(ProviderServiceError, match="content does not match"):
            service.preview_from_image(b"not really png", "image/png")


def test_receipt_ocr_service_does_not_cache_invalid_llm_output(client: TestClient) -> None:
    class InvalidMiniMaxChatService(FakeMiniMaxChatService):
        def complete_json(self, **_kwargs: object) -> MiniMaxJsonResult:
            self.calls += 1
            return MiniMaxJsonResult(
                output_json="not a json container",  # type: ignore[arg-type]
                input_tokens=10,
                output_tokens=5,
                total_tokens=15,
                raw_content="not a json container",
            )

    fake_chat_service = InvalidMiniMaxChatService()
    with client.app.state.session_factory() as session:
        service = ReceiptOcrService(
            chat_service=fake_chat_service,
            artifact_store=AiArtifactStore(session),
        )

        with pytest.raises(ProviderServiceError, match="invalid"):
            service.preview_from_image(JPEG_IMAGE, "image/jpeg")

        assert fake_chat_service.calls == 1
        assert session.query(AiArtifact).count() == 0


class FakeReceiptOcrService:
    def __init__(self) -> None:
        self.calls = 0

    def preview_from_image(self, image_bytes: bytes, content_type: str) -> ReceiptOcrPreview:
        self.calls += 1
        assert image_bytes == b"receipt image"
        assert content_type == "image/png"
        return ReceiptOcrPreview.model_validate(
            {
                "receipt_id": "receipt:test",
                "merchant": "Green Market",
                "purchase_date": "2026-06-25",
                "items": [
                    {
                        "display_name": "Bananas",
                        "normalized_name": "bananas",
                        "quantity": 6,
                        "unit": "pcs",
                        "category": "Produce",
                        "confidence": 0.88,
                    }
                ],
                "summary": {
                    "detected_count": 1,
                    "source": "minimax_ocr",
                },
            }
        )


def test_receipt_ocr_endpoint_returns_preview(client: TestClient) -> None:
    enable_llm(client)
    fake_service = FakeReceiptOcrService()
    client.app.state.receipt_ocr_service = fake_service

    response = client.post(
        "/api/v1/imports/receipt/ocr",
        files={"file": ("receipt.png", b"receipt image", "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["receipt_id"] == "receipt:test"
    assert payload["merchant"] == "Green Market"
    assert payload["items"][0]["display_name"] == "Bananas"
    assert payload["items"][0]["normalized_name"] == "bananas"
    assert fake_service.calls == 1


def test_receipt_ocr_endpoint_returns_503_when_llm_disabled(client: TestClient) -> None:
    fake_service = FakeReceiptOcrService()
    client.app.state.receipt_ocr_service = fake_service

    response = client.post(
        "/api/v1/imports/receipt/ocr",
        files={"file": ("receipt.png", b"receipt image", "image/png")},
    )

    assert response.status_code == 503
    assert fake_service.calls == 0


def test_receipt_ocr_endpoint_returns_429_when_budget_exhausted(client: TestClient) -> None:
    enable_llm(client, budget=0)

    response = client.post(
        "/api/v1/imports/receipt/ocr",
        files={"file": ("receipt.png", PNG_IMAGE, "image/png")},
    )

    assert response.status_code == 429


def test_receipt_ocr_endpoint_uses_openrouter_provider(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_openrouter_llm(client)
    captured_models: list[str] = []

    def fake_complete_json(self: OpenRouterChatService, **_kwargs: object) -> MiniMaxJsonResult:
        captured_models.append(self.model)
        return MiniMaxJsonResult(
            output_json={
                "merchant": "OpenRouter Market",
                "purchase_date": "2026-06-24",
                "items": [
                    {
                        "display_name": "Oats",
                        "quantity": 1,
                        "unit": "pack",
                        "category": "Grains",
                        "confidence": 0.84,
                    }
                ],
            },
            input_tokens=12,
            output_tokens=9,
            total_tokens=21,
            raw_content="{}",
        )

    monkeypatch.setattr(OpenRouterChatService, "complete_json", fake_complete_json)

    response = client.post(
        "/api/v1/imports/receipt/ocr",
        files={"file": ("receipt.png", PNG_IMAGE, "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["merchant"] == "OpenRouter Market"
    assert payload["items"][0]["display_name"] == "Oats"
    assert captured_models == ["google/gemma-4-31b-it:free"]

    with client.app.state.session_factory() as session:
        artifact = session.query(AiArtifact).one()
        assert artifact.provider == "openrouter"
        assert artifact.model == "google/gemma-4-31b-it:free"
        assert artifact.prompt_hash == stable_hash(
            {"task_type": "receipt_ocr", "version": PROMPT_VERSION}
        )


def test_openrouter_budget_ignores_minimax_artifacts(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_openrouter_llm(client, budget=1)
    with client.app.state.session_factory() as session:
        AiArtifactStore(session, provider="minimax").store_output(
            task_type="receipt_ocr",
            model="MiniMax-M3",
            input_payload={"image_sha256": "already-used"},
            output_json={"items": []},
            prompt_version="receipt-ocr-v1",
        )

    def fake_complete_json(self: OpenRouterChatService, **_kwargs: object) -> MiniMaxJsonResult:
        return MiniMaxJsonResult(
            output_json={"merchant": "OpenRouter Market", "items": []},
            input_tokens=1,
            output_tokens=1,
            total_tokens=2,
            raw_content="{}",
        )

    monkeypatch.setattr(OpenRouterChatService, "complete_json", fake_complete_json)

    response = client.post(
        "/api/v1/imports/receipt/ocr",
        files={"file": ("receipt.png", PNG_IMAGE, "image/png")},
    )

    assert response.status_code == 200


def test_receipt_confirm_creates_inventory_items(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.post(
        "/api/v1/imports/receipt/confirm",
        json={
            "fridge_id": fridge_id,
            "receipt_id": "receipt:test",
            "purchase_date": "2026-06-20",
            "items": [
                {
                    "display_name": "Greek Yogurt",
                    "normalized_name": "wrong client value",
                    "quantity": 2,
                    "unit": "cup",
                    "location": "fridge",
                    "category": "Dairy",
                    "purchase_date": "2026-06-21",
                    "expiration_date": "2026-06-30",
                    "expiration_date_source": "user",
                    "expiration_confidence": 1,
                    "confidence": 0.9,
                },
                {
                    "display_name": "Bananas",
                    "normalized_name": "bananas",
                    "quantity": 6,
                    "unit": "pcs",
                    "location": "pantry",
                    "category": "Produce",
                    "confidence": 0.88,
                },
            ],
        },
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["summary"]["fridge_id"] == fridge_id
    assert payload["summary"]["imported_count"] == 2
    assert payload["summary"]["source"] == "receipt_ocr"
    assert payload["items"][0]["display_name"] == "Greek Yogurt"
    assert payload["items"][0]["normalized_name"] == "greek yogurt"
    assert payload["items"][0]["purchase_date"] == "2026-06-21"
    assert payload["items"][0]["expiration_date"] == "2026-06-30"
    assert payload["items"][0]["expiration_date_source"] == "user"
    assert payload["items"][0]["expiration_confidence"] == 1
    assert payload["items"][0]["confidence"] == 0.9
    assert payload["items"][0]["source"] == "receipt_ocr"
    assert payload["items"][1]["location"] == "pantry"
    assert payload["items"][1]["purchase_date"] == "2026-06-20"


def test_receipt_confirm_canonicalizes_names_and_estimates_expiration(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.post(
        "/api/v1/imports/receipt/confirm",
        json={
            "fridge_id": fridge_id,
            "receipt_id": "receipt:tomatoes",
            "purchase_date": "2026-06-25",
            "items": [
                {
                    "display_name": "Кавказские помидоры",
                    "normalized_name": "кавказские помидоры",
                    "quantity": 1,
                    "unit": "kg",
                    "category": "Produce",
                    "confidence": 0.9,
                },
            ],
        },
    )

    assert response.status_code == 201
    item = response.json()["data"]["items"][0]
    assert item["display_name"] == "Помидоры"
    assert item["normalized_name"] == "помидоры"
    assert item["location"] == "fridge"
    assert item["category"] == "Produce"
    assert item["purchase_date"] == "2026-06-25"
    assert item["expiration_date"] == "2026-06-30"
    assert item["expiration_date_source"] == "estimated"
    assert item["expiration_confidence"] == 0.78


def test_receipt_confirm_rejects_excessive_item_count(
    client: TestClient,
    fridge_id: int,
) -> None:
    items = [
        {
            "display_name": f"Item {index}",
            "normalized_name": f"item {index}",
            "quantity": 1,
            "unit": "pcs",
            "category": "Other",
            "confidence": 0.8,
        }
        for index in range(81)
    ]

    response = client.post(
        "/api/v1/imports/receipt/confirm",
        json={
            "fridge_id": fridge_id,
            "receipt_id": "receipt:too-large",
            "items": items,
        },
    )

    assert response.status_code == 422
