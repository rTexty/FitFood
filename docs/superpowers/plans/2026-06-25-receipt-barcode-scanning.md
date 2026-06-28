# Receipt and Barcode Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real barcode fallback and receipt OCR preview/confirm so users can add scanned groceries to inventory without blindly trusting OCR.

**Architecture:** Reuse existing barcode endpoints and Open Food Facts integration. Add a small MiniMax-backed receipt OCR service that caches structured results in `ai_artifacts`, then add preview/confirm endpoints and wire them to the existing `/scan` phone-shell UI.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, httpx, MiniMax M3, React, TanStack Query, TanStack Router, framer-motion, Vitest, pytest.

---

## File Structure

- Create `app/services/llm/receipt_ocr.py`: image validation, SHA-256 receipt id, MiniMax prompt, `AiArtifactStore` cache, normalized OCR item output.
- Modify `app/api/v1/deps.py`: dependency provider for receipt OCR service, with `app.state.receipt_ocr_service` override for tests.
- Modify `app/api/v1/endpoints/imports.py`: add request/response models, `/imports/receipt/ocr`, and `/imports/receipt/confirm`.
- Modify `app/services/provider_models.py`: add `ReceiptOcrItemSuggestion` and `ReceiptOcrPreview`.
- Create `tests/test_receipt_ocr_api.py`: backend API, validation, cache, and confirm tests.
- Modify `frontend/src/lib/api/types.ts`: receipt OCR preview and confirm types.
- Modify `frontend/src/lib/api/client.ts`: multipart upload request and confirm request.
- Modify `frontend/src/lib/api/mutations.ts`: OCR and confirm mutations.
- Modify `frontend/src/lib/api/fallback.ts`: fallback OCR preview/confirm for dev mode.
- Modify `frontend/src/routes/scan.tsx`: two-mode barcode/receipt scanner UI.
- Modify `frontend/src/lib/api/client.test.ts`: API endpoint tests for OCR and confirm.

---

### Task 1: Backend Receipt OCR Service

**Files:**
- Create: `app/services/llm/receipt_ocr.py`
- Modify: `app/services/provider_models.py`
- Test: `tests/test_receipt_ocr_api.py`

- [ ] **Step 1: Write failing service/cache tests**

Add this to `tests/test_receipt_ocr_api.py`:

```python
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services.llm.receipt_ocr import ReceiptOcrService
from app.services.provider_models import ProviderServiceError


class FakeMiniMaxChatService:
    model = "MiniMax-M3"

    def __init__(self) -> None:
        self.calls = 0

    def complete_json(self, **_kwargs):
        self.calls += 1
        return type(
            "FakeResult",
            (),
            {
                "output_json": {
                    "items": [
                        {
                            "display_name": "Milk",
                            "quantity": 1,
                            "unit": "carton",
                            "location": "fridge",
                            "category": "Dairy",
                            "confidence": 0.86,
                        }
                    ]
                },
                "input_tokens": 100,
                "output_tokens": 40,
                "total_tokens": 140,
            },
        )()


def test_receipt_ocr_service_caches_same_image(client: TestClient) -> None:
    chat_service = FakeMiniMaxChatService()
    session_factory = client.app.state.session_factory
    image_bytes = b"fake-receipt-image"

    with session_factory() as session:
        service = ReceiptOcrService(chat_service=chat_service, session=session)
        first_preview = service.preview_from_image(
            image_bytes=image_bytes,
            content_type="image/jpeg",
        )
        second_preview = service.preview_from_image(
            image_bytes=image_bytes,
            content_type="image/jpeg",
        )

    assert first_preview == second_preview
    assert chat_service.calls == 1
    assert first_preview["receipt_id"].startswith("receipt:")
    assert first_preview["items"][0]["normalized_name"] == "milk"


def test_receipt_ocr_service_rejects_invalid_type(client: TestClient) -> None:
    session_factory = client.app.state.session_factory

    with session_factory() as session:
        service = ReceiptOcrService(chat_service=FakeMiniMaxChatService(), session=session)

        with pytest.raises(ProviderServiceError, match="Unsupported receipt image type"):
            service.preview_from_image(
                image_bytes=b"not an image",
                content_type="text/plain",
            )
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
python -m pytest -q tests/test_receipt_ocr_api.py::test_receipt_ocr_service_caches_same_image tests/test_receipt_ocr_api.py::test_receipt_ocr_service_rejects_invalid_type
```

Expected: FAIL because `app.services.llm.receipt_ocr` does not exist.

- [ ] **Step 3: Add provider models**

Append to `app/services/provider_models.py`:

```python
class ReceiptOcrItemSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=120)
    normalized_name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(default=1, gt=0)
    unit: str = Field(default="item", min_length=1, max_length=30)
    location: str = Field(default="fridge", min_length=1, max_length=50)
    category: str = Field(default="Other", min_length=1, max_length=50)
    confidence: float = Field(default=0.5, ge=0, le=1)


class ReceiptOcrPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receipt_id: str = Field(min_length=1, max_length=90)
    items: list[ReceiptOcrItemSuggestion]
    summary: dict[str, object]
```

- [ ] **Step 4: Implement OCR service**

Create `app/services/llm/receipt_ocr.py`:

```python
from __future__ import annotations

import base64
import hashlib
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.services.cache.provider_cache import JsonContainer
from app.services.llm.artifacts import AiArtifactStore
from app.services.normalization import normalize_name
from app.services.provider_models import (
    ProviderServiceError,
    ReceiptOcrItemSuggestion,
    ReceiptOcrPreview,
)


SUPPORTED_RECEIPT_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024


class ReceiptChatService(Protocol):
    model: str

    def complete_json(self, **kwargs: Any):
        ...


class ReceiptOcrService:
    def __init__(
        self,
        *,
        chat_service: ReceiptChatService,
        session: Session,
        prompt_version: str = "receipt-ocr-v1",
    ) -> None:
        self._chat_service = chat_service
        self._artifact_store = AiArtifactStore(session)
        self._prompt_version = prompt_version

    def preview_from_image(
        self,
        *,
        image_bytes: bytes,
        content_type: str,
    ) -> dict[str, object]:
        self._validate_image(image_bytes=image_bytes, content_type=content_type)
        receipt_id = self._receipt_id(image_bytes)
        input_payload = {"receipt_id": receipt_id, "content_type": content_type}

        cached_output = self._artifact_store.get_output(
            task_type="receipt_ocr",
            model=self._chat_service.model,
            input_payload=input_payload,
            prompt_version=self._prompt_version,
        )
        if cached_output is None:
            result = self._chat_service.complete_json(
                messages=self._messages(image_bytes=image_bytes, content_type=content_type),
                max_completion_tokens=2000,
                temperature=0.1,
            )
            cached_output = self._artifact_store.store_output(
                task_type="receipt_ocr",
                model=self._chat_service.model,
                input_payload=input_payload,
                output_json=result.output_json,
                prompt_version=self._prompt_version,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
            )

        preview = ReceiptOcrPreview(
            receipt_id=receipt_id,
            items=self._items_from_output(cached_output),
            summary={
                "detected_count": len(self._items_from_output(cached_output)),
                "requires_review_count": 0,
                "source": "minimax_ocr",
            },
        )
        return preview.model_dump()

    def _validate_image(self, *, image_bytes: bytes, content_type: str) -> None:
        if content_type not in SUPPORTED_RECEIPT_IMAGE_TYPES:
            raise ProviderServiceError("Unsupported receipt image type")
        if not image_bytes:
            raise ProviderServiceError("Receipt image is empty")
        if len(image_bytes) > MAX_RECEIPT_IMAGE_BYTES:
            raise ProviderServiceError("Receipt image is too large")

    def _receipt_id(self, image_bytes: bytes) -> str:
        return f"receipt:{hashlib.sha256(image_bytes).hexdigest()}"

    def _items_from_output(self, output: JsonContainer) -> list[ReceiptOcrItemSuggestion]:
        if not isinstance(output, dict):
            return []
        raw_items = output.get("items")
        if not isinstance(raw_items, list):
            return []

        items: list[ReceiptOcrItemSuggestion] = []
        for raw_item in raw_items:
            if not isinstance(raw_item, dict):
                continue
            display_name = str(raw_item.get("display_name") or "").strip()
            if not display_name:
                continue
            item = ReceiptOcrItemSuggestion(
                display_name=display_name,
                normalized_name=normalize_name(display_name),
                quantity=self._as_float(raw_item.get("quantity"), 1),
                unit=str(raw_item.get("unit") or "item")[:30],
                location=self._location(raw_item.get("location")),
                category=str(raw_item.get("category") or "Other")[:50],
                confidence=self._as_float(raw_item.get("confidence"), 0.5),
            )
            items.append(item)
        return items

    def _messages(self, *, image_bytes: bytes, content_type: str) -> list[dict[str, Any]]:
        encoded_image = base64.b64encode(image_bytes).decode("ascii")
        return [
            {
                "role": "system",
                "content": (
                    "Extract grocery receipt line items. Return ONLY valid JSON with an items array. "
                    "Each item needs display_name, quantity, unit, location, category, confidence."
                ),
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Read this receipt and extract groceries."},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{content_type};base64,{encoded_image}"},
                    },
                ],
            },
        ]

    def _location(self, value: object) -> str:
        return "pantry" if str(value).lower() == "pantry" else "fridge"

    def _as_float(self, value: object, fallback: float) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return fallback
        return fallback
```

- [ ] **Step 5: Run service tests**

Run:

```bash
python -m pytest -q tests/test_receipt_ocr_api.py::test_receipt_ocr_service_caches_same_image tests/test_receipt_ocr_api.py::test_receipt_ocr_service_rejects_invalid_type
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add app/services/provider_models.py app/services/llm/receipt_ocr.py tests/test_receipt_ocr_api.py
git commit -m "feat: add receipt ocr service"
```

---

### Task 2: Backend Receipt OCR and Confirm Endpoints

**Files:**
- Modify: `app/api/v1/deps.py`
- Modify: `app/api/v1/endpoints/imports.py`
- Test: `tests/test_receipt_ocr_api.py`

- [ ] **Step 1: Write failing endpoint tests**

Append to `tests/test_receipt_ocr_api.py`:

```python
class FakeReceiptOcrService:
    def __init__(self) -> None:
        self.calls = 0

    def preview_from_image(self, *, image_bytes: bytes, content_type: str) -> dict[str, object]:
        self.calls += 1
        assert image_bytes == b"receipt-image"
        assert content_type == "image/jpeg"
        return {
            "receipt_id": "receipt:test",
            "items": [
                {
                    "display_name": "Milk",
                    "normalized_name": "milk",
                    "quantity": 1,
                    "unit": "carton",
                    "location": "fridge",
                    "category": "Dairy",
                    "confidence": 0.86,
                }
            ],
            "summary": {
                "detected_count": 1,
                "requires_review_count": 0,
                "source": "minimax_ocr",
            },
        }


def test_receipt_ocr_endpoint_returns_preview(client: TestClient) -> None:
    fake_service = FakeReceiptOcrService()
    client.app.state.receipt_ocr_service = fake_service

    response = client.post(
        "/api/v1/imports/receipt/ocr",
        files={"file": ("receipt.jpg", b"receipt-image", "image/jpeg")},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["receipt_id"] == "receipt:test"
    assert payload["items"][0]["display_name"] == "Milk"
    assert fake_service.calls == 1


def test_receipt_confirm_creates_inventory_items(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.post(
        "/api/v1/imports/receipt/confirm",
        json={
            "fridge_id": fridge_id,
            "receipt_id": "receipt:test",
            "items": [
                {
                    "display_name": "Milk",
                    "quantity": 1,
                    "unit": "carton",
                    "location": "fridge",
                    "category": "Dairy",
                }
            ],
        },
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["summary"]["imported_count"] == 1
    assert payload["summary"]["source"] == "receipt_ocr"
    assert payload["items"][0]["display_name"] == "Milk"
    assert payload["items"][0]["source"] == "receipt_ocr"
```

- [ ] **Step 2: Run endpoint tests to verify failure**

Run:

```bash
python -m pytest -q tests/test_receipt_ocr_api.py::test_receipt_ocr_endpoint_returns_preview tests/test_receipt_ocr_api.py::test_receipt_confirm_creates_inventory_items
```

Expected: FAIL because endpoints do not exist.

- [ ] **Step 3: Add receipt OCR dependency**

Modify `app/api/v1/deps.py` imports:

```python
from app.services.llm.minimax import MiniMaxChatService
from app.services.llm.receipt_ocr import ReceiptOcrService
```

Append this function to `app/api/v1/deps.py`:

```python
def get_receipt_ocr_service(
    request: Request,
    session: Session = Depends(get_session),
) -> Generator[ReceiptOcrService, None, None]:
    override_service = getattr(request.app.state, "receipt_ocr_service", None)
    if override_service is not None:
        yield override_service
        return

    settings = get_settings(request)
    client = httpx.Client(base_url=settings.minimax_base_url)
    try:
        chat_service = MiniMaxChatService(
            http_client=client,
            base_url=settings.minimax_base_url,
            api_key=settings.minimax_api_key,
            model=settings.minimax_model,
        )
        yield ReceiptOcrService(chat_service=chat_service, session=session)
    finally:
        client.close()
```

- [ ] **Step 4: Add endpoint models and imports**

Modify `app/api/v1/endpoints/imports.py` imports:

```python
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from app.api.v1.deps import get_open_food_facts_service, get_receipt_ocr_service, get_session
from app.services.llm.receipt_ocr import ReceiptOcrService
from app.services.provider_models import (
    BarcodeProductSuggestion,
    ProviderLookupError,
    ProviderServiceError,
    ReceiptOcrItemSuggestion,
)
```

Append these models after `BarcodeImportRequest`:

```python
class ReceiptConfirmItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(default=1, gt=0)
    unit: str = Field(default="item", min_length=1, max_length=30)
    location: str = Field(default="fridge", min_length=1, max_length=50)
    category: str = Field(default="Other", min_length=1, max_length=50)


class ReceiptConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fridge_id: int
    receipt_id: str = Field(min_length=1, max_length=90)
    items: list[ReceiptConfirmItem] = Field(min_length=1, max_length=100)
```

- [ ] **Step 5: Add endpoints**

Append to `app/api/v1/endpoints/imports.py`:

```python
@router.post("/imports/receipt/ocr")
async def preview_receipt_ocr(
    file: UploadFile = File(...),
    receipt_ocr_service: ReceiptOcrService = Depends(get_receipt_ocr_service),
) -> dict[str, dict[str, object]]:
    try:
        image_bytes = await file.read()
        preview = receipt_ocr_service.preview_from_image(
            image_bytes=image_bytes,
            content_type=file.content_type or "",
        )
    except ProviderServiceError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return {"data": preview}


@router.post("/imports/receipt/confirm", status_code=status.HTTP_201_CREATED)
def confirm_receipt_import(
    payload: ReceiptConfirmRequest,
    session: Session = Depends(get_session),
) -> dict[str, dict[str, object]]:
    fridge = session.get(Fridge, payload.fridge_id)
    if fridge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fridge not found")

    imported_items: list[InventoryItem] = []
    for item in payload.items:
        inventory_item = InventoryItem(
            fridge_id=payload.fridge_id,
            display_name=item.display_name,
            normalized_name=normalize_name(item.display_name),
            quantity=item.quantity,
            unit=item.unit,
            location=item.location,
            category=item.category,
            source="receipt_ocr",
            purchase_date=date.today(),
            expiration_date=None,
        )
        session.add(inventory_item)
        imported_items.append(inventory_item)

    session.commit()
    for item in imported_items:
        session.refresh(item)

    return {
        "data": {
            "items": [serialize_inventory_item(item) for item in imported_items],
            "summary": {
                "fridge_id": payload.fridge_id,
                "receipt_id": payload.receipt_id,
                "imported_count": len(imported_items),
                "source": "receipt_ocr",
            },
        }
    }
```

- [ ] **Step 6: Run endpoint tests**

Run:

```bash
python -m pytest -q tests/test_receipt_ocr_api.py
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add app/api/v1/deps.py app/api/v1/endpoints/imports.py tests/test_receipt_ocr_api.py
git commit -m "feat: add receipt ocr import endpoints"
```

---

### Task 3: Frontend API Client for Receipt OCR

**Files:**
- Modify: `frontend/src/lib/api/types.ts`
- Modify: `frontend/src/lib/api/client.ts`
- Modify: `frontend/src/lib/api/mutations.ts`
- Modify: `frontend/src/lib/api/fallback.ts`
- Test: `frontend/src/lib/api/client.test.ts`

- [ ] **Step 1: Write failing frontend API tests**

Append to `frontend/src/lib/api/client.test.ts`:

```ts
  it("targets receipt OCR and confirm endpoints", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });

      if (url.endsWith("/imports/receipt/ocr")) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeInstanceOf(FormData);
        return new Response(
          JSON.stringify({
            data: {
              receipt_id: "receipt:test",
              items: [
                {
                  display_name: "Milk",
                  normalized_name: "milk",
                  quantity: 1,
                  unit: "carton",
                  location: "fridge",
                  category: "Dairy",
                  confidence: 0.86,
                },
              ],
              summary: {
                detected_count: 1,
                requires_review_count: 0,
                source: "minimax_ocr",
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/imports/receipt/confirm")) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(
          JSON.stringify({
            fridge_id: "fridge-home",
            receipt_id: "receipt:test",
            items: [
              {
                display_name: "Milk",
                quantity: 1,
                unit: "carton",
                location: "fridge",
                category: "Dairy",
              },
            ],
          }),
        );
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  id: "item-receipt",
                  fridge_id: "fridge-home",
                  display_name: "Milk",
                  normalized_name: "milk",
                  quantity: 1,
                  unit: "carton",
                  location: "fridge",
                  category: "Dairy",
                  purchase_date: "2026-06-25",
                  expiration_date: null,
                  source: "receipt_ocr",
                },
              ],
              summary: {
                fridge_id: "fridge-home",
                receipt_id: "receipt:test",
                imported_count: 1,
                source: "receipt_ocr",
              },
            },
          }),
          { status: 201 },
        );
      }

      return new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 });
    });

    const api = createFitFoodApi({
      baseUrl: "https://api.fitfood.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { VITE_API_BASE_URL: "https://api.fitfood.test" },
    });

    const preview = await api.ocrReceipt(new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }));
    expect(preview.receipt_id).toBe("receipt:test");
    expect(preview.items[0].display_name).toBe("Milk");

    const confirmed = await api.confirmReceiptImport({
      fridge_id: "fridge-home",
      receipt_id: "receipt:test",
      items: [
        {
          display_name: "Milk",
          quantity: 1,
          unit: "carton",
          location: "fridge",
          category: "Dairy",
        },
      ],
    });
    expect(confirmed.summary.imported_count).toBe(1);
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.fitfood.test/api/v1/imports/receipt/ocr",
      "https://api.fitfood.test/api/v1/imports/receipt/confirm",
    ]);
  });
```

- [ ] **Step 2: Run frontend API test to verify failure**

Run:

```bash
cd frontend && npm run test -- src/lib/api/client.test.ts
```

Expected: FAIL because `ocrReceipt` and `confirmReceiptImport` are not on `FitFoodApi`.

- [ ] **Step 3: Add frontend types**

In `frontend/src/lib/api/types.ts`, replace `ReceiptImportResult` with:

```ts
export interface ReceiptOcrItem {
  display_name: string;
  normalized_name?: string;
  quantity: number;
  unit: Unit;
  location: Location;
  category: string;
  confidence?: number | null;
}

export interface ReceiptOcrPreview {
  receipt_id: string;
  items: ReceiptOcrItem[];
  summary: {
    detected_count: number;
    requires_review_count: number;
    source: "minimax_ocr";
  };
}

export interface ReceiptConfirmInput {
  fridge_id: string;
  receipt_id: string;
  items: Array<{
    display_name: string;
    quantity: number;
    unit: Unit;
    location: Location;
    category: string;
  }>;
}

export interface ReceiptImportResult {
  items: InventoryItem[];
  summary: {
    fridge_id?: string;
    receipt_id?: string;
    imported_count: number;
    source: "demo" | "receipt_ocr";
  };
}
```

Add methods to `FitFoodApi`:

```ts
  ocrReceipt(file: File): Promise<ReceiptOcrPreview>;
  confirmReceiptImport(input: ReceiptConfirmInput): Promise<ReceiptImportResult>;
```

- [ ] **Step 4: Add normalizers and client methods**

In `frontend/src/lib/api/client.ts`, import `ReceiptConfirmInput`, `ReceiptOcrItem`, and `ReceiptOcrPreview`.

Add:

```ts
function normalizeReceiptOcrItem(value: unknown): ReceiptOcrItem {
  const record = asRecord(value);
  const displayName = asString(record.display_name, "Product");
  return {
    display_name: displayName,
    normalized_name: asString(record.normalized_name, displayName.toLowerCase()),
    quantity: asNumber(record.quantity, 1),
    unit: normalizeUnit(record.unit, "item"),
    location: normalizeLocation(record.location),
    category: asString(record.category, "Other"),
    confidence:
      typeof record.confidence === "number" && Number.isFinite(record.confidence)
        ? record.confidence
        : null,
  };
}

function normalizeReceiptOcrPreview(value: unknown): ReceiptOcrPreview {
  const record = asRecord(value);
  const summary = asRecord(record.summary);
  const items = Array.isArray(record.items) ? record.items.map(normalizeReceiptOcrItem) : [];
  return {
    receipt_id: asString(record.receipt_id, "receipt:unknown"),
    items,
    summary: {
      detected_count: asNumber(summary.detected_count, items.length),
      requires_review_count: asNumber(summary.requires_review_count, 0),
      source: "minimax_ocr",
    },
  };
}
```

Add methods to `HttpFitFoodApi`:

```ts
  ocrReceipt(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return this.request<unknown>(
      "/imports/receipt/ocr",
      { method: "POST", body: formData, headers: {} },
      () => this.fallbackApi.ocrReceipt(file),
    ).then(normalizeReceiptOcrPreview);
  }

  confirmReceiptImport(input: ReceiptConfirmInput) {
    return this.request<ReceiptImportResult>(
      "/imports/receipt/confirm",
      { method: "POST", body: JSON.stringify(input) },
      () => this.fallbackApi.confirmReceiptImport(input),
    ).then((result) => ({
      ...result,
      items: result.items.map(normalizeInventoryItem),
    }));
  }
```

- [ ] **Step 5: Fix multipart headers**

Modify `createHeaders` in `frontend/src/lib/api/client.ts`:

```ts
function createHeaders(init: RequestInit) {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  return {
    Accept: "application/json",
    ...(init.body != null && !isFormData ? { "Content-Type": "application/json" } : {}),
    ...init.headers,
  };
}
```

- [ ] **Step 6: Add mutations**

Append to `frontend/src/lib/api/mutations.ts`:

```ts
export function useReceiptOcrMutation() {
  return useMutation({
    mutationFn: (file: File) => fitfoodApi.ocrReceipt(file),
  });
}

export function useConfirmReceiptImportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReceiptConfirmInput) => fitfoodApi.confirmReceiptImport(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fitfood", "inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["fitfood", "recipes"] }),
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.mealPlans }),
      ]);
    },
  });
}
```

Also import `ReceiptConfirmInput`.

- [ ] **Step 7: Add fallback methods**

In `frontend/src/lib/api/fallback.ts`, add `ocrReceipt` and `confirmReceiptImport` to returned API:

```ts
    async ocrReceipt(): Promise<ReceiptOcrPreview> {
      return {
        receipt_id: "receipt:fallback",
        items: receiptProducts.slice(0, 3).map((product) => ({
          display_name: product.name,
          normalized_name: normalizeName(product.name),
          quantity: product.quantity,
          unit: product.unit,
          location: product.location,
          category: product.category,
          confidence: 0.82,
        })),
        summary: {
          detected_count: 3,
          requires_review_count: 0,
          source: "minimax_ocr",
        },
      };
    },

    async confirmReceiptImport(input: ReceiptConfirmInput): Promise<ReceiptImportResult> {
      const importedItems = input.items.map((item) =>
        addInventoryItem({
          id: createId("receipt"),
          display_name: item.display_name,
          normalized_name: normalizeName(item.display_name),
          quantity: item.quantity,
          unit: item.unit,
          location: item.location,
          category: item.category,
          purchase_date: todayIso(),
          expiration_date: null,
          source: "receipt",
        }),
      );
      return {
        items: importedItems,
        summary: {
          fridge_id: input.fridge_id,
          receipt_id: input.receipt_id,
          imported_count: importedItems.length,
          source: "receipt_ocr",
        },
      };
    },
```

- [ ] **Step 8: Run frontend API tests**

Run:

```bash
cd frontend && npm run test -- src/lib/api/client.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add frontend/src/lib/api/types.ts frontend/src/lib/api/client.ts frontend/src/lib/api/mutations.ts frontend/src/lib/api/fallback.ts frontend/src/lib/api/client.test.ts
git commit -m "feat: add receipt ocr api client"
```

---

### Task 4: Scan Screen UX

**Files:**
- Modify: `frontend/src/routes/scan.tsx`
- Test: `frontend/src/lib/api/client.test.ts`

- [ ] **Step 1: Replace demo-only state with scanner modes**

In `frontend/src/routes/scan.tsx`, add:

```ts
type ScanMode = "barcode" | "receipt";
type ReceiptItemDraft = ReceiptOcrItem & { id: string };

function draftId(item: ReceiptOcrItem, index: number) {
  return `${item.display_name}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
```

State inside `Scan`:

```ts
const [mode, setMode] = useState<ScanMode>("barcode");
const [barcodeInput, setBarcodeInput] = useState(DEMO_BARCODE);
const [receiptFile, setReceiptFile] = useState<File | null>(null);
const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
const [receiptId, setReceiptId] = useState<string | null>(null);
const [receiptItems, setReceiptItems] = useState<ReceiptItemDraft[]>([]);
```

- [ ] **Step 2: Add mode tabs**

Use two 44px-tall buttons near the top:

```tsx
<div className="grid h-11 grid-cols-2 rounded-2xl bg-secondary/15 p-1">
  {(["barcode", "receipt"] as const).map((nextMode) => (
    <button
      key={nextMode}
      onClick={() => setMode(nextMode)}
      className={`rounded-xl text-sm font-semibold transition-[background-color,color,scale] active:scale-[0.96] ${
        mode === nextMode ? "bg-primary text-primary-foreground" : "text-primary-foreground/70"
      }`}
    >
      {nextMode === "barcode" ? "Barcode" : "Receipt"}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Add barcode fallback form**

In barcode mode, keep the scanner frame and add:

```tsx
<form
  onSubmit={(event) => {
    event.preventDefault();
    const barcode = barcodeInput.trim();
    if (!barcode) return;
    navigate({ to: "/scan-success", search: { barcode } });
  }}
  className="mt-5 space-y-3"
>
  <input
    value={barcodeInput}
    onChange={(event) => setBarcodeInput(event.target.value)}
    inputMode="numeric"
    className="h-12 w-full rounded-2xl bg-secondary/15 px-4 text-center text-base font-semibold tabular-nums text-primary-foreground outline-none"
    placeholder="Enter barcode"
  />
  <button
    type="submit"
    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.96]"
  >
    Import barcode
  </button>
</form>
```

Do not add a barcode scanning dependency in this task.

- [ ] **Step 4: Add receipt upload and preview controls**

In receipt mode:

```tsx
<input
  id="receipt-file"
  type="file"
  accept="image/jpeg,image/png,image/webp"
  capture="environment"
  className="sr-only"
  onChange={(event) => {
    const file = event.target.files?.[0] ?? null;
    setReceiptFile(file);
    setReceiptItems([]);
    setReceiptId(null);
    setReceiptImageUrl(file ? URL.createObjectURL(file) : null);
  }}
/>
<label
  htmlFor="receipt-file"
  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.96]"
>
  Upload receipt
</label>
```

If `receiptImageUrl` is set:

```tsx
<img
  src={receiptImageUrl}
  alt="Receipt preview"
  className="mt-4 aspect-[3/4] w-full rounded-2xl object-cover outline outline-1 -outline-offset-1 outline-white/10"
/>
```

- [ ] **Step 5: Wire OCR mutation**

Import:

```ts
import { useConfirmReceiptImportMutation, useReceiptOcrMutation } from "@/lib/api/mutations";
import type { ReceiptOcrItem } from "@/lib/api/types";
```

Create mutations:

```ts
const receiptOcrMutation = useReceiptOcrMutation();
const confirmReceiptImportMutation = useConfirmReceiptImportMutation();
```

Add `Recognize receipt` button:

```tsx
<button
  type="button"
  disabled={!receiptFile || receiptOcrMutation.isPending}
  onClick={() => {
    if (!receiptFile) return;
    receiptOcrMutation.mutate(receiptFile, {
      onSuccess: (preview) => {
        setReceiptId(preview.receipt_id);
        setReceiptItems(preview.items.map((item, index) => ({ ...item, id: draftId(item, index) })));
      },
    });
  }}
  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary/15 text-base font-semibold text-primary-foreground transition-transform active:scale-[0.96] disabled:opacity-60"
>
  {receiptOcrMutation.isPending ? "Recognizing..." : "Recognize receipt"}
</button>
```

- [ ] **Step 6: Add editable receipt rows**

Render `receiptItems`:

```tsx
{receiptItems.map((item) => (
  <motion.div
    key={item.id}
    initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
    className="rounded-2xl bg-card/95 p-3 text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
  >
    <div className="flex items-start gap-3">
      <input
        value={item.display_name}
        onChange={(event) =>
          setReceiptItems((items) =>
            items.map((current) =>
              current.id === item.id ? { ...current, display_name: event.target.value } : current,
            ),
          )
        }
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
      />
      <button
        type="button"
        onClick={() => setReceiptItems((items) => items.filter((current) => current.id !== item.id))}
        className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-muted-foreground transition-transform active:scale-[0.96]"
      >
        ×
      </button>
    </div>
    <div className="mt-2 grid grid-cols-3 gap-2">
      <input
        value={item.quantity}
        type="number"
        min="0.1"
        step="0.1"
        onChange={(event) =>
          setReceiptItems((items) =>
            items.map((current) =>
              current.id === item.id ? { ...current, quantity: Number(event.target.value) || 1 } : current,
            ),
          )
        }
        className="h-10 rounded-xl bg-secondary px-3 text-sm tabular-nums outline-none"
      />
      <input
        value={item.unit}
        onChange={(event) =>
          setReceiptItems((items) =>
            items.map((current) =>
              current.id === item.id ? { ...current, unit: event.target.value as ReceiptOcrItem["unit"] } : current,
            ),
          )
        }
        className="h-10 rounded-xl bg-secondary px-3 text-sm outline-none"
      />
      <input
        value={item.category}
        onChange={(event) =>
          setReceiptItems((items) =>
            items.map((current) =>
              current.id === item.id ? { ...current, category: event.target.value } : current,
            ),
          )
        }
        className="h-10 rounded-xl bg-secondary px-3 text-sm outline-none"
      />
    </div>
  </motion.div>
))}
```

- [ ] **Step 7: Add confirm import button**

```tsx
<button
  type="button"
  disabled={!receiptId || receiptItems.length === 0 || confirmReceiptImportMutation.isPending}
  onClick={() => {
    if (!receiptId) return;
    confirmReceiptImportMutation.mutate(
      {
        fridge_id: primaryFridgeId,
        receipt_id: receiptId,
        items: receiptItems.map(({ id: _id, confidence: _confidence, normalized_name: _normalized, ...item }) => item),
      },
      {
        onSuccess: () => navigate({ to: "/dashboard" }),
      },
    );
  }}
  className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.96] disabled:opacity-60"
>
  {confirmReceiptImportMutation.isPending ? "Adding..." : "Add all to fridge"}
</button>
```

- [ ] **Step 8: Run frontend tests/build**

Run:

```bash
cd frontend && npm run test
cd frontend && npm run build
```

Expected: both PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add frontend/src/routes/scan.tsx
git commit -m "feat: add receipt scanner preview flow"
```

---

### Task 5: Full Verification

**Files:**
- Modify only if verification finds a bug.

- [ ] **Step 1: Run backend tests**

Run:

```bash
python -m pytest -q tests
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
cd frontend && npm run test
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 4: Smoke backend endpoints**

Run:

```bash
curl -s -o /tmp/fitfood-health.txt -w '%{http_code}' http://127.0.0.1:8000/api/v1/health
```

Expected: `200`.

Run:

```bash
curl -s -o /tmp/fitfood-receipt-confirm.txt -w '%{http_code}' \
  -X POST http://127.0.0.1:8000/api/v1/imports/receipt/confirm \
  -H 'Content-Type: application/json' \
  -d '{"fridge_id":1,"receipt_id":"receipt:smoke","items":[{"display_name":"Milk","quantity":1,"unit":"carton","location":"fridge","category":"Dairy"}]}'
```

Expected: `201` if a fridge with id `1` exists in the local DB.

- [ ] **Step 5: Security and cost sanity**

Run:

```bash
rg -n "MINIMAX_API_KEY=.*\\S|Bearer [A-Za-z0-9_.-]{12,}|sk-[A-Za-z0-9]" app frontend tests .env.example README.md
```

Expected: no real secrets. Test-only strings are allowed.

- [ ] **Step 6: Handle verification fixes**

If no fixes were needed, do not commit. If fixes were needed, rerun the
specific task that owns the broken file, then use that task's exact commit
command.

---

## Self-Review

- Spec coverage: backend OCR, confirm import, barcode reuse, frontend two-mode scan UI, preview-first receipt flow, cache via `ai_artifacts`, and tests are covered.
- Scope check: this is one implementation slice. It does not add a barcode dependency or a full camera streaming scanner.
- Ponytail cuts: use native file input and existing barcode routes; add a barcode library only if native/manual fallback fails on target devices.
