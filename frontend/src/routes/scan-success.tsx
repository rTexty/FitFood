import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  Loader2,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PhoneShell, StatusBar } from "@/components/fitfood/Shell";
import { ExpiryBadge } from "@/components/fitfood/widgets";
import { useImportBarcodeMutation } from "@/lib/api/mutations";
import { barcodePreviewQueryOptions, ensureKitchenCore } from "@/lib/api/queries";
import type { BarcodeImportInput, Location, Unit } from "@/lib/api/types";
import { useKitchen } from "@/lib/kitchen-store";

export const Route = createFileRoute("/scan-success")({
  loader: ({ context }) => ensureKitchenCore(context.queryClient),
  validateSearch: (search) => ({
    barcode:
      typeof search.barcode === "string" && search.barcode ? search.barcode : "5449000000996",
  }),
  head: () => ({
    meta: [
      { title: "Review Barcode — FitFood" },
      {
        name: "description",
        content: "Review a scanned barcode before adding it to your kitchen.",
      },
    ],
  }),
  component: ScanSuccess,
});

type BarcodeDraft = {
  display_name: string;
  quantity: string;
  unit: Unit;
  location: Location;
  category: string;
  purchase_date: string;
  expiration_date: string;
};

const LOCATION_OPTIONS: Location[] = ["fridge", "pantry", "freezer"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function ScanSuccess() {
  const { barcode } = Route.useSearch();
  const { primaryFridgeId } = useKitchen();
  const previewQuery = useQuery({
    ...barcodePreviewQueryOptions(barcode),
    retry: false,
  });
  const importBarcodeMutation = useImportBarcodeMutation();
  const [draft, setDraft] = useState<BarcodeDraft>({
    display_name: "",
    quantity: "1",
    unit: "count",
    location: "pantry",
    category: "Other",
    purchase_date: todayIso(),
    expiration_date: "",
  });

  useEffect(() => {
    const preview = previewQuery.data;
    if (!preview) return;

    setDraft({
      display_name: preview.display_name ?? preview.product_name,
      quantity: String(preview.quantity ?? 1),
      unit: preview.unit ?? "count",
      location: preview.location ?? "pantry",
      category: preview.category ?? "Other",
      purchase_date: todayIso(),
      expiration_date: "",
    });
  }, [previewQuery.data]);

  const importedItem = importBarcodeMutation.data?.item;
  const description = previewQuery.data?.brand
    ? `${previewQuery.data.brand} · ${barcode}`
    : `Barcode ${barcode}`;
  const quantity = useMemo(() => {
    const parsed = Number(draft.quantity);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [draft.quantity]);

  const errorMessage =
    (importBarcodeMutation.error instanceof Error && importBarcodeMutation.error.message) ||
    (previewQuery.error instanceof Error && previewQuery.error.message) ||
    "We couldn't prepare this barcode right now.";
  const hasError = (previewQuery.isError || importBarcodeMutation.isError) && !importedItem;
  const isConfirmDisabled =
    !draft.display_name.trim() || previewQuery.isPending || importBarcodeMutation.isPending;

  function updateDraft(patch: Partial<BarcodeDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function confirmBarcode() {
    const expirationDate = draft.expiration_date || null;
    const input: BarcodeImportInput = {
      fridge_id: primaryFridgeId,
      display_name: draft.display_name.trim(),
      quantity,
      unit: draft.unit,
      location: draft.location,
      category: draft.category.trim() || "Other",
      purchase_date: draft.purchase_date || null,
      expiration_date: expirationDate,
      expiration_date_source: expirationDate ? "user" : "unknown",
      expiration_confidence: expirationDate ? 1 : null,
    };

    importBarcodeMutation.mutate({ barcode, input });
  }

  return (
    <PhoneShell>
      <StatusBar />
      <div className="flex flex-1 flex-col px-6 pb-8">
        <div className="flex flex-col items-center pt-10 text-center">
          <motion.span
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className={`grid h-20 w-20 place-items-center rounded-full shadow-float ${
              hasError
                ? "bg-warning-soft text-warning-foreground"
                : importedItem
                  ? "bg-success text-success-foreground"
                  : "bg-primary text-primary-foreground"
            }`}
          >
            {hasError ? (
              <AlertTriangle className="h-10 w-10" strokeWidth={2.5} />
            ) : importedItem ? (
              <Check className="h-10 w-10" strokeWidth={3} />
            ) : (
              <PackageCheck className="h-10 w-10" strokeWidth={2.5} />
            )}
          </motion.span>
          <h1 className="mt-5 text-2xl font-extrabold text-balance">
            {hasError
              ? "Barcode needs another try"
              : importedItem
                ? "Product imported!"
                : "Review product"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            {hasError
              ? errorMessage
              : importedItem
                ? `${importedItem.display_name} is now in your kitchen.`
                : description}
          </p>
        </div>

        <div className="mt-7 space-y-3">
          {previewQuery.isPending ? (
            <div className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-bold">
                ...
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Looking up product</p>
                <p className="truncate text-xs text-muted-foreground">
                  Checking barcode details...
                </p>
              </div>
            </div>
          ) : null}

          {importedItem ? (
            <motion.div
              key={importedItem.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              className="flex items-center gap-3 rounded-2xl bg-success-soft p-3 shadow-soft"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-card text-2xl">
                {importedItem.location === "fridge"
                  ? "🥛"
                  : importedItem.location === "freezer"
                    ? "🧊"
                    : "🥫"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{importedItem.display_name}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">
                  <span className="tabular-nums">{importedItem.quantity}</span> {importedItem.unit}{" "}
                  · {importedItem.location}
                </p>
              </div>
              <ExpiryBadge expiryDate={importedItem.expiration_date} />
            </motion.div>
          ) : null}

          {!importedItem && !hasError && !previewQuery.isPending ? (
            <div className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Product
              </label>
              <input
                value={draft.display_name}
                onChange={(event) => updateDraft({ display_name: event.target.value })}
                className="h-12 w-full rounded-xl bg-secondary px-4 text-sm font-semibold outline-none transition-colors focus:bg-muted"
                placeholder="Product name"
              />

              <div className="grid grid-cols-[1fr_104px] gap-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Quantity
                  </label>
                  <input
                    value={draft.quantity}
                    onChange={(event) => updateDraft({ quantity: event.target.value })}
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="mt-1 h-11 w-full rounded-xl bg-secondary px-3 text-sm font-semibold tabular-nums outline-none transition-colors focus:bg-muted"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Unit
                  </label>
                  <input
                    value={draft.unit}
                    onChange={(event) => updateDraft({ unit: event.target.value as Unit })}
                    className="mt-1 h-11 w-full rounded-xl bg-secondary px-3 text-sm font-semibold outline-none transition-colors focus:bg-muted"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Place
                </label>
                <div className="mt-1 grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
                  {LOCATION_OPTIONS.map((location) => (
                    <button
                      key={location}
                      type="button"
                      onClick={() => updateDraft({ location })}
                      className={`min-h-10 rounded-lg text-xs font-bold capitalize transition-colors active:scale-[0.96] ${
                        draft.location === location
                          ? "bg-card shadow-soft"
                          : "text-muted-foreground"
                      }`}
                    >
                      {location}
                    </button>
                  ))}
                </div>
              </div>

              <input
                value={draft.category}
                onChange={(event) => updateDraft({ category: event.target.value })}
                className="h-11 w-full rounded-xl bg-secondary px-3 text-sm font-semibold outline-none transition-colors focus:bg-muted"
                placeholder="Category"
              />

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Bought
                  </span>
                  <input
                    value={draft.purchase_date}
                    onChange={(event) => updateDraft({ purchase_date: event.target.value })}
                    type="date"
                    className="mt-1 h-11 w-full rounded-xl bg-secondary px-3 text-xs font-semibold tabular-nums outline-none transition-colors focus:bg-muted"
                  />
                </label>
                <label className="block">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Expires
                  </span>
                  <input
                    value={draft.expiration_date}
                    onChange={(event) => updateDraft({ expiration_date: event.target.value })}
                    type="date"
                    className="mt-1 h-11 w-full rounded-xl bg-secondary px-3 text-xs font-semibold tabular-nums outline-none transition-colors focus:bg-muted"
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-auto space-y-3 pt-8">
          {hasError ? (
            <button
              onClick={() => {
                importBarcodeMutation.reset();
                void previewQuery.refetch();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.96]"
            >
              <RefreshCw className="h-5 w-5" />
              Try again
            </button>
          ) : null}

          {!importedItem && !hasError ? (
            <button
              type="button"
              onClick={confirmBarcode}
              disabled={isConfirmDisabled}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.96] disabled:opacity-50"
            >
              {importBarcodeMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Check className="h-5 w-5" />
              )}
              {importBarcodeMutation.isPending ? "Adding..." : "Add to fridge"}
            </button>
          ) : null}

          {importedItem ? (
            <Link
              to="/dashboard"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.96]"
            >
              View my kitchen
              <ArrowRight className="h-5 w-5" />
            </Link>
          ) : null}

          <Link
            to="/scan"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-4 text-base font-semibold text-foreground transition-transform active:scale-[0.96]"
          >
            Scan another product
          </Link>
        </div>
      </div>
    </PhoneShell>
  );
}
