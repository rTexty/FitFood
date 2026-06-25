# Receipt and Barcode Scanning Design

Date: 2026-06-25
Status: Approved for planning

## Goal

FitFood should let users add products to the fridge from barcode scans and
receipt photos without blindly trusting OCR. Barcode scans add a single item
after successful product lookup. Receipt scans must show a preview first;
inventory is updated only after the user confirms.

## Selected Approach

Use the smallest architecture that fits the product:

- Barcode mode uses browser-native `BarcodeDetector` when available.
- Barcode fallback is manual barcode entry.
- Barcode product lookup and import reuse the existing Open Food Facts backend
  endpoints.
- Receipt mode uploads/captures an image, sends it to the backend, and uses
  MiniMax M3 OCR for structured item extraction.
- Receipt OCR results are cached in `ai_artifacts` by image/input hash.
- The user reviews extracted items and presses `Add all` before inventory writes.

Rejected for now:

- A barcode scanning dependency. Add only if native scanning plus manual fallback
  is not good enough on target devices.
- Fully automatic receipt import. It risks polluting inventory with OCR mistakes.
- Running all barcode work through MiniMax. Barcodes are cheaper and more reliable
  through native decode plus Open Food Facts lookup.

## Backend Design

Existing barcode endpoints stay the source of truth:

```text
GET  /api/v1/imports/barcode/{barcode}
POST /api/v1/imports/barcode/{barcode}
```

Receipt OCR adds two endpoints:

```text
POST /api/v1/imports/receipt/ocr
POST /api/v1/imports/receipt/confirm
```

`POST /imports/receipt/ocr` accepts a multipart image upload under the `file`
field, validates the size/type, computes a stable SHA-256 image hash, checks
`ai_artifacts`, and calls MiniMax only on cache miss. It returns a preview
payload and does not create inventory rows.

`POST /imports/receipt/confirm` accepts the preview items selected by the user
and creates `InventoryItem` rows for one fridge.

## Data Contracts

OCR preview response:

```json
{
  "data": {
    "receipt_id": "receipt:sha256-image-hash",
    "items": [
      {
        "display_name": "Milk",
        "normalized_name": "milk",
        "quantity": 1,
        "unit": "carton",
        "location": "fridge",
        "category": "Dairy",
        "confidence": 0.86
      }
    ],
    "summary": {
      "detected_count": 1,
      "requires_review_count": 0,
      "source": "minimax_ocr"
    }
  }
}
```

Confirm request:

```json
{
  "fridge_id": 1,
  "receipt_id": "receipt:sha256-image-hash",
  "items": [
    {
      "display_name": "Milk",
      "quantity": 1,
      "unit": "carton",
      "location": "fridge",
      "category": "Dairy"
    }
  ]
}
```

Confirm response mirrors existing import shapes:

```json
{
  "data": {
    "items": [
      {
        "id": 1,
        "display_name": "Milk",
        "quantity": 1,
        "unit": "carton",
        "location": "fridge",
        "category": "Dairy"
      }
    ],
    "summary": {
      "fridge_id": 1,
      "imported_count": 1,
      "source": "receipt_ocr"
    }
  }
}
```

## Frontend Design

The existing `/scan` route becomes a two-mode scanner:

```text
[ Barcode ] [ Receipt ]
```

Barcode mode:

- Show the current scanner frame.
- Use native `BarcodeDetector` when available.
- If unavailable or failed, show manual barcode input.
- On decoded barcode, route to the existing barcode import flow.

Receipt mode:

- Show `Take photo` and `Upload receipt`.
- Show a receipt image preview.
- `Recognize receipt` triggers OCR.
- OCR preview shows editable rows.
- User can remove rows or adjust quantity/unit/category.
- `Add all to fridge` confirms import.

## UI Polish Rules

Apply the existing FitFood phone-shell style. Keep controls compact and
task-focused rather than adding a new onboarding screen.

| Principle | Decision |
| --- | --- |
| Concentric radius | Nested preview panels use outer radius = inner radius + padding. |
| Press feedback | Primary and secondary buttons use `active:scale-[0.96]` with transform-only transition. |
| Hit area | Mode tabs, remove row buttons, and upload controls stay at least 40px tall/wide. |
| Image outline | Receipt preview uses `outline-black/10 dark:outline-white/10`. |
| Tabular numbers | Quantity and confidence values use tabular numerals. |
| Motion | Mode icon changes use opacity/scale/blur with bounce `0`; OCR result rows enter staggered. |
| Performance | Avoid `transition-all`; transition only transform, opacity, filter, or box-shadow. |

## Error Handling

Barcode:

- Browser barcode API unavailable: show manual input.
- Barcode decode failed: keep user on `/scan` with retry/manual input.
- Open Food Facts 404: show product-not-found and allow manual add.
- Open Food Facts 502/network: show retry.

Receipt:

- Unsupported image type or too large: validation error before MiniMax.
- MiniMax key missing: show OCR unavailable, keep demo/manual options.
- MiniMax bad JSON: one backend retry, then show OCR failed.
- OCR low confidence: item remains editable in preview.
- Confirm import partial failure: return created items plus a clear error summary.

## Testing

Backend tests:

- Barcode endpoints continue to pass existing tests.
- Receipt OCR cache test: same image hash calls MiniMax once.
- Receipt OCR validation test: invalid file rejected.
- Receipt confirm test: selected preview items create inventory rows.
- MiniMax bad JSON test: backend returns a controlled error.

Frontend tests:

- Scan mode switch renders barcode and receipt states.
- Barcode fallback submits manual barcode to existing import flow.
- Receipt OCR preview renders editable items.
- Removing a row excludes it from confirm import.
- `Add all` invalidates inventory and recipe match queries.

## Notes

This is intentionally not a full scanner platform. The first implementation
should prove the product loop: scan, preview, confirm, inventory updated. Add a
barcode library only if native scanning is measurably poor on target devices.
