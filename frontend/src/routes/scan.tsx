import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Camera,
  Check,
  ImageUp,
  Info,
  Keyboard,
  Loader2,
  Plus,
  QrCode,
  ScanLine,
  Trash2,
  Upload,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { PhoneShell, StatusBar, TopBar } from "@/components/fitfood/Shell";
import { useConfirmReceiptImportMutation, useReceiptOcrMutation } from "@/lib/api/mutations";
import { ensureKitchenCore } from "@/lib/api/queries";
import type { Location, ReceiptOcrItem, ReceiptOcrPreview } from "@/lib/api/types";
import { useKitchen } from "@/lib/kitchen-store";

export const Route = createFileRoute("/scan")({
  loader: ({ context }) => ensureKitchenCore(context.queryClient),
  head: () => ({
    meta: [
      { title: "Scan — FitFood" },
      { name: "description", content: "Scan a barcode or receipt to add food to your kitchen." },
    ],
  }),
  component: Scan,
});

const DEMO_BARCODE = "5449000000996";
const RECEIPT_UNITS: ReceiptOcrItem["unit"][] = [
  "pcs",
  "count",
  "g",
  "kg",
  "ml",
  "L",
  "pack",
  "bag",
  "carton",
  "tub",
  "cup",
  "item",
];

type ScanMode = "barcode" | "receipt";
type ReceiptDraftItem = ReceiptOcrItem & {
  location: Location;
  purchase_date: string;
  expiration_date: string;
};
type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorInstance = {
  detect(image: ImageBitmapSource): Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function Scan() {
  const navigate = useNavigate();
  const { primaryFridgeId } = useKitchen();
  const barcodeFileInputRef = useRef<HTMLInputElement | null>(null);
  const receiptFileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ScanMode>("barcode");
  const [barcode, setBarcode] = useState(DEMO_BARCODE);
  const [barcodeMessage, setBarcodeMessage] = useState<string | null>(null);
  const [barcodeScanning, setBarcodeScanning] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<ReceiptOcrPreview | null>(null);
  const [receiptRows, setReceiptRows] = useState<ReceiptDraftItem[]>([]);
  const receiptOcrMutation = useReceiptOcrMutation();
  const confirmReceiptMutation = useConfirmReceiptImportMutation();

  useEffect(() => {
    if (!receiptFile) {
      setReceiptImageUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(receiptFile);
    setReceiptImageUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [receiptFile]);

  function importBarcode(nextBarcode: string) {
    const normalizedBarcode = nextBarcode.replace(/\D/g, "");
    if (!normalizedBarcode) {
      setBarcodeMessage("Enter a barcode number first.");
      return;
    }

    setBarcodeMessage(null);
    navigate({
      to: "/scan-success",
      search: { barcode: normalizedBarcode },
    });
  }

  function submitManualBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    importBarcode(barcode);
  }

  async function scanBarcodeFromImage(file: File) {
    const Detector = (
      globalThis as typeof globalThis & {
        BarcodeDetector?: BarcodeDetectorConstructor;
      }
    ).BarcodeDetector;

    if (!Detector || typeof createImageBitmap === "undefined") {
      setBarcodeMessage("Barcode camera scanning is not available in this browser.");
      return;
    }

    setBarcodeScanning(true);
    setBarcodeMessage(null);
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      const detector = new Detector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
      });
      const codes = await detector.detect(bitmap);
      const detectedValue = codes.find((code) => code.rawValue)?.rawValue;
      if (!detectedValue) {
        setBarcodeMessage("No readable barcode found.");
        return;
      }
      setBarcode(detectedValue);
      importBarcode(detectedValue);
    } catch (error) {
      setBarcodeMessage(error instanceof Error ? error.message : "Barcode scan failed.");
    } finally {
      bitmap?.close();
      setBarcodeScanning(false);
    }
  }

  function handleBarcodeImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      void scanBarcodeFromImage(file);
    }
  }

  function handleReceiptFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setReceiptFile(file);
    setReceiptPreview(null);
    setReceiptRows([]);
    receiptOcrMutation.reset();
    confirmReceiptMutation.reset();
  }

  function recognizeReceipt() {
    if (!receiptFile) {
      return;
    }

    receiptOcrMutation.mutate(receiptFile, {
      onSuccess: (preview) => {
        setReceiptPreview(preview);
        setReceiptRows(
          preview.items.map((item) => ({
            ...item,
            location: item.location ?? "fridge",
            purchase_date:
              item.purchase_date ?? preview.purchase_date ?? new Date().toISOString().slice(0, 10),
            expiration_date: item.expiration_date ?? "",
            expiration_date_source: item.expiration_date
              ? (item.expiration_date_source ?? "ocr")
              : "unknown",
            expiration_confidence: item.expiration_date
              ? (item.expiration_confidence ?? item.confidence)
              : null,
          })),
        );
      },
    });
  }

  function updateReceiptRow(index: number, patch: Partial<ReceiptDraftItem>) {
    setReceiptRows((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  function addReceiptRow() {
    setReceiptRows((rows) => [
      ...rows,
      {
        display_name: "",
        normalized_name: "",
        quantity: 1,
        unit: "pcs",
        location: "fridge",
        category: "Other",
        purchase_date: receiptPreview?.purchase_date ?? new Date().toISOString().slice(0, 10),
        expiration_date: "",
        expiration_date_source: "unknown",
        expiration_confidence: null,
        confidence: 1,
      },
    ]);
  }

  function removeReceiptRow(index: number) {
    setReceiptRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function confirmReceipt() {
    const items = receiptRows
      .map((row) => ({
        ...row,
        display_name: row.display_name.trim(),
        normalized_name: row.normalized_name.trim() || row.display_name.trim().toLowerCase(),
        category: row.category?.trim() || "Other",
        quantity: Number.isFinite(row.quantity) && row.quantity > 0 ? row.quantity : 1,
        expiration_date: row.expiration_date || null,
        expiration_date_source: row.expiration_date ? row.expiration_date_source : "unknown",
        expiration_confidence: row.expiration_date ? row.expiration_confidence : null,
      }))
      .filter((row) => row.display_name);

    if (!items.length) {
      return;
    }

    confirmReceiptMutation.mutate(
      {
        fridge_id: primaryFridgeId,
        receipt_id: receiptPreview?.receipt_id ?? `receipt:manual-${Date.now()}`,
        location: "fridge",
        purchase_date: receiptPreview?.purchase_date ?? null,
        items,
      },
      {
        onSuccess: () => navigate({ to: "/dashboard" }),
      },
    );
  }

  const receiptError =
    receiptOcrMutation.error instanceof Error
      ? receiptOcrMutation.error.message
      : confirmReceiptMutation.error instanceof Error
        ? confirmReceiptMutation.error.message
        : null;
  const hasConfirmableReceiptRows = receiptRows.some((row) => row.display_name.trim());

  return (
    <PhoneShell className="bg-foreground text-primary-foreground">
      <StatusBar dark />
      <TopBar
        title={mode === "barcode" ? "Scan barcode" : "Scan receipt"}
        subtitle={mode === "barcode" ? "Add one product" : "Add a shopping trip"}
        back="/dashboard"
      />
      <div className="flex flex-1 flex-col px-6 pb-8">
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-primary-foreground/10 p-1">
          {(["barcode", "receipt"] as const).map((nextMode) => (
            <button
              key={nextMode}
              type="button"
              onClick={() => setMode(nextMode)}
              className={`flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors active:scale-[0.96] ${
                mode === nextMode
                  ? "bg-primary text-primary-foreground shadow-float"
                  : "text-primary-foreground/70"
              }`}
            >
              {nextMode === "barcode" ? (
                <QrCode className="h-4 w-4" />
              ) : (
                <ImageUp className="h-4 w-4" />
              )}
              {nextMode === "barcode" ? "Barcode" : "Receipt"}
            </button>
          ))}
        </div>

        {mode === "barcode" ? (
          <div className="flex flex-1 flex-col">
            <div className="relative mt-5 aspect-square w-full max-w-[300px] self-center">
              <div className="absolute inset-0 grid place-items-center rounded-3xl bg-primary-foreground/10">
                <QrCode className="h-28 w-28 text-primary-foreground/30" />
              </div>
              {[
                "left-3 top-3 border-l-4 border-t-4",
                "right-3 top-3 border-r-4 border-t-4",
                "left-3 bottom-3 border-l-4 border-b-4",
                "right-3 bottom-3 border-r-4 border-b-4",
              ].map((className) => (
                <span
                  key={className}
                  className={`absolute h-10 w-10 rounded-md border-primary ${className}`}
                />
              ))}
              {barcodeScanning ? (
                <motion.span
                  initial={{ top: "8%" }}
                  animate={{ top: "88%" }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut",
                  }}
                  className="absolute left-3 right-3 h-1 rounded-full bg-primary shadow-[0_0_20px_4px] shadow-primary"
                />
              ) : null}
            </div>

            <input
              ref={barcodeFileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleBarcodeImageChange}
            />

            <form className="mt-6 space-y-3" onSubmit={submitManualBarcode}>
              <label className="block text-xs font-semibold uppercase tracking-wide text-primary-foreground/50">
                Barcode number
              </label>
              <div className="flex gap-2">
                <input
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  inputMode="numeric"
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 px-4 text-sm font-semibold text-primary-foreground outline-none transition-colors placeholder:text-primary-foreground/35 focus:border-primary"
                  placeholder="5449000000996"
                />
                <button
                  type="submit"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-float transition-transform active:scale-[0.96]"
                  aria-label="Import barcode"
                >
                  <Check className="h-5 w-5" />
                </button>
              </div>
            </form>

            {barcodeMessage ? (
              <p className="mt-3 flex items-center gap-2 rounded-2xl bg-primary-foreground/10 px-3 py-2 text-xs text-primary-foreground/70">
                <Info className="h-4 w-4 shrink-0" />
                {barcodeMessage}
              </p>
            ) : null}

            <div className="mt-auto space-y-3 pt-8">
              <button
                type="button"
                onClick={() => barcodeFileInputRef.current?.click()}
                disabled={barcodeScanning}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.96] disabled:opacity-60"
              >
                {barcodeScanning ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
                {barcodeScanning ? "Scanning..." : "Use camera"}
              </button>
              <button
                type="button"
                onClick={() => importBarcode(DEMO_BARCODE)}
                disabled={barcodeScanning}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-foreground/12 py-4 text-base font-semibold text-primary-foreground transition-transform active:scale-[0.96] disabled:opacity-60"
              >
                <ScanLine className="h-5 w-5" />
                Use demo barcode
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: "/scan-error" })}
                disabled={barcodeScanning}
                className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-medium text-primary-foreground/50"
              >
                <Info className="h-3.5 w-3.5" />
                Simulate unreadable barcode
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <input
              ref={receiptFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={handleReceiptFileChange}
            />

            <button
              type="button"
              onClick={() => receiptFileInputRef.current?.click()}
              className="mt-5 flex min-h-[160px] w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-primary-foreground/20 bg-primary-foreground/10 px-5 text-center transition-colors active:scale-[0.98]"
            >
              {receiptImageUrl ? (
                <img
                  src={receiptImageUrl}
                  alt=""
                  className="h-32 w-full rounded-2xl object-cover outline outline-1 outline-primary-foreground/20"
                />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-float">
                  <Upload className="h-6 w-6" />
                </span>
              )}
              <span className="text-sm font-semibold">
                {receiptFile ? receiptFile.name : "Choose receipt image"}
              </span>
            </button>

            <button
              type="button"
              onClick={recognizeReceipt}
              disabled={!receiptFile || receiptOcrMutation.isPending}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.96] disabled:opacity-50"
            >
              {receiptOcrMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ImageUp className="h-5 w-5" />
              )}
              {receiptOcrMutation.isPending ? "Reading receipt..." : "Recognize receipt"}
            </button>

            {receiptPreview ? (
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-primary-foreground/10 px-4 py-3 text-xs text-primary-foreground/65">
                <span className="truncate">
                  {receiptPreview.merchant ?? "Receipt"} · {receiptRows.length} items
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {Math.round(
                    (receiptRows.reduce((sum, item) => sum + item.confidence, 0) /
                      Math.max(receiptRows.length, 1)) *
                      100,
                  )}
                  %
                </span>
              </div>
            ) : null}

            {receiptError ? (
              <p className="mt-3 flex items-center gap-2 rounded-2xl bg-primary-foreground/10 px-3 py-2 text-xs text-primary-foreground/70">
                <Info className="h-4 w-4 shrink-0" />
                {receiptError}
              </p>
            ) : null}

            {receiptRows.length ? (
              <div className="mt-4 max-h-[310px] space-y-3 overflow-y-auto pr-1">
                {receiptRows.map((row, index) => (
                  <div
                    key={`${row.normalized_name}-${index}`}
                    className="rounded-2xl border border-primary-foreground/12 bg-primary-foreground/8 p-3"
                  >
                    <div className="flex gap-2">
                      <input
                        value={row.display_name}
                        onChange={(event) =>
                          updateReceiptRow(index, {
                            display_name: event.target.value,
                            normalized_name: event.target.value.trim().toLowerCase(),
                          })
                        }
                        className="h-10 min-w-0 flex-1 rounded-xl border border-primary-foreground/12 bg-foreground/40 px-3 text-sm font-semibold text-primary-foreground outline-none transition-colors focus:border-primary"
                        placeholder="Product"
                      />
                      <button
                        type="button"
                        onClick={() => removeReceiptRow(index)}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/10 text-primary-foreground/70 transition-transform active:scale-[0.96]"
                        aria-label="Remove receipt item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-[76px_92px_1fr] gap-2">
                      <input
                        value={row.quantity}
                        onChange={(event) =>
                          updateReceiptRow(index, {
                            quantity: Number(event.target.value),
                          })
                        }
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="h-10 rounded-xl border border-primary-foreground/12 bg-foreground/40 px-3 text-sm font-semibold tabular-nums text-primary-foreground outline-none transition-colors focus:border-primary"
                      />
                      <select
                        value={row.unit}
                        onChange={(event) =>
                          updateReceiptRow(index, {
                            unit: event.target.value as ReceiptOcrItem["unit"],
                          })
                        }
                        className="h-10 rounded-xl border border-primary-foreground/12 bg-foreground/40 px-2 text-sm font-semibold text-primary-foreground outline-none transition-colors focus:border-primary"
                      >
                        {RECEIPT_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      <input
                        value={row.category ?? ""}
                        onChange={(event) =>
                          updateReceiptRow(index, { category: event.target.value })
                        }
                        className="h-10 min-w-0 rounded-xl border border-primary-foreground/12 bg-foreground/40 px-3 text-sm font-semibold text-primary-foreground outline-none transition-colors focus:border-primary"
                        placeholder="Category"
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <select
                        value={row.location}
                        onChange={(event) =>
                          updateReceiptRow(index, {
                            location: event.target.value as Location,
                          })
                        }
                        className="h-10 rounded-xl border border-primary-foreground/12 bg-foreground/40 px-2 text-xs font-semibold capitalize text-primary-foreground outline-none transition-colors focus:border-primary"
                      >
                        {(["fridge", "pantry", "freezer"] as const).map((location) => (
                          <option key={location} value={location}>
                            {location}
                          </option>
                        ))}
                      </select>
                      <input
                        value={row.purchase_date}
                        onChange={(event) =>
                          updateReceiptRow(index, { purchase_date: event.target.value })
                        }
                        type="date"
                        className="h-10 min-w-0 rounded-xl border border-primary-foreground/12 bg-foreground/40 px-2 text-xs font-semibold tabular-nums text-primary-foreground outline-none transition-colors focus:border-primary"
                      />
                      <input
                        value={row.expiration_date}
                        onChange={(event) =>
                          updateReceiptRow(index, {
                            expiration_date: event.target.value,
                            expiration_date_source: event.target.value ? "user" : "unknown",
                            expiration_confidence: event.target.value ? 1 : null,
                          })
                        }
                        type="date"
                        className="h-10 min-w-0 rounded-xl border border-primary-foreground/12 bg-foreground/40 px-2 text-xs font-semibold tabular-nums text-primary-foreground outline-none transition-colors focus:border-primary"
                      />
                    </div>
                    {row.expiration_date ? (
                      <p className="mt-2 rounded-xl bg-primary-foreground/10 px-2.5 py-1 text-[11px] font-medium text-primary-foreground/65">
                        Expiry {row.expiration_date_source}
                        {row.expiration_confidence != null
                          ? ` · ${Math.round(row.expiration_confidence * 100)}% confidence`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-auto space-y-3 pt-5">
              <button
                type="button"
                onClick={addReceiptRow}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-foreground/12 py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.96]"
              >
                <Plus className="h-4 w-4" />
                Add row
              </button>
              <button
                type="button"
                onClick={confirmReceipt}
                disabled={!hasConfirmableReceiptRows || confirmReceiptMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.96] disabled:opacity-50"
              >
                {confirmReceiptMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Keyboard className="h-5 w-5" />
                )}
                {confirmReceiptMutation.isPending ? "Adding..." : "Add to fridge"}
              </button>
            </div>
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
