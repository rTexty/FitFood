import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Trash2, ChefHat, CalendarClock, Package, MapPin, ScanLine, Pencil } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { PhoneShell, StatusBar, TopBar } from "@/components/fitfood/Shell";
import { ExpiryBadge } from "@/components/fitfood/widgets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUpdateInventoryItemMutation } from "@/lib/api/mutations";
import { ensureKitchenCore } from "@/lib/api/queries";
import { daysUntil, freshState, type Product } from "@/lib/fitfood-data";
import { useKitchen } from "@/lib/kitchen-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/product/$id")({
  loader: ({ context }) => ensureKitchenCore(context.queryClient),
  head: () => ({
    meta: [
      { title: "Product Details — FitFood" },
      {
        name: "description",
        content: "View product quantity, storage location, and estimated expiry date.",
      },
    ],
  }),
  component: ProductDetails,
});

const storageTips: Record<string, string> = {
  Dairy: "Keep refrigerated at 1–4°C. Reseal tightly after opening.",
  Vegetables: "Store in the crisper drawer. Keep dry to slow spoilage.",
  Fruit: "Ripen at room temperature, then refrigerate to extend freshness.",
  Meat: "Keep on the coldest shelf. Freeze if not used within 2 days.",
  Fish: "Use within 1–2 days. Store on ice for best freshness.",
  Grains: "Keep in an airtight container in a cool, dry pantry.",
  Oils: "Store away from heat and light to prevent rancidity.",
  Canned: "Cool, dry place. Refrigerate after opening.",
  Snacks: "Reseal to keep crisp and prevent moisture.",
};

const unitOptions = [
  "count",
  "pcs",
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
] as const;
const categoryOptions = [
  "Ready Meals",
  "Vegetables",
  "Fruit",
  "Dairy",
  "Meat",
  "Fish",
  "Grains",
  "Oils",
  "Canned",
  "Snacks",
  "Beverages",
  "Frozen",
  "Condiments",
  "Other",
] as const;
const locationOptions = ["fridge", "pantry"] as const;

function createEditForm(product: Product) {
  return {
    display_name: product.name,
    quantity: String(product.quantity),
    unit: product.unit,
    location: product.location,
    category: product.category,
    expiration_date: product.expiryDate?.slice(0, 10) ?? "",
  };
}

function formatLocation(location: Product["location"]) {
  if (location === "fridge") return "Fridge";
  if (location === "freezer") return "Freezer";
  return "Pantry";
}

function ProductDetails() {
  const { id } = useParams({ from: "/product/$id" });
  const { products, removeProduct } = useKitchen();
  const navigate = useNavigate();
  const product = products.find((p) => p.id === id);
  const updateInventoryMutation = useUpdateInventoryItemMutation();
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(() => (product ? createEditForm(product) : null));

  useEffect(() => {
    if (product && editOpen) {
      setEditForm(createEditForm(product));
      setEditError(null);
    }
  }, [editOpen, product]);

  if (!product) {
    return (
      <PhoneShell>
        <StatusBar />
        <TopBar title="Product" back="/dashboard" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="text-4xl">🔍</span>
          <p className="mt-3 text-sm text-muted-foreground">
            This product is no longer in your kitchen.
          </p>
          <Link
            to="/dashboard"
            className="mt-5 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Back to kitchen
          </Link>
        </div>
      </PhoneShell>
    );
  }

  const d = daysUntil(product.expiryDate);
  const state = freshState(product.expiryDate);
  const categoryChoices =
    editForm && categoryOptions.includes(editForm.category as (typeof categoryOptions)[number])
      ? categoryOptions
      : ([...categoryOptions, editForm?.category].filter(Boolean) as string[]);

  function handleRemove() {
    removeProduct(product!.id);
    navigate({ to: "/dashboard" });
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || !editForm) return;

    setEditError(null);
    const quantity = Number(editForm.quantity);
    if (!editForm.display_name.trim()) {
      setEditError("Enter a product name.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setEditError("Quantity must be greater than zero.");
      return;
    }

    updateInventoryMutation.mutate(
      {
        itemId: product.id,
        input: {
          display_name: editForm.display_name.trim(),
          quantity,
          unit: editForm.unit,
          location: editForm.location,
          category: editForm.category.trim(),
          expiration_date: editForm.expiration_date || null,
        },
      },
      {
        onSuccess: () => {
          setEditOpen(false);
        },
        onError: (error) => {
          setEditError(error instanceof Error ? error.message : "Could not update this product.");
        },
      },
    );
  }

  return (
    <PhoneShell>
      <StatusBar />
      <TopBar
        title="Product Details"
        back="/dashboard"
        right={
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full bg-secondary transition-transform active:scale-[0.96]"
            aria-label="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
        }
      />
      <div className="flex flex-1 flex-col px-6 pb-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center pt-2 text-center"
        >
          <span className="grid h-28 w-28 place-items-center rounded-3xl bg-primary-soft text-6xl">
            {product.emoji}
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">{product.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{product.category}</p>
          <div className="mt-3">
            <ExpiryBadge expiryDate={product.expiryDate} />
          </div>
        </motion.div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <DetailTile
            icon={Package}
            label="Quantity"
            value={`${product.quantity}${product.unit === "count" ? " pcs" : product.unit === "pack" ? " pack" : ` ${product.unit}`}`}
          />
          <DetailTile icon={MapPin} label="Location" value={formatLocation(product.location)} />
          <DetailTile
            icon={CalendarClock}
            label="Expires"
            value={
              state === "unknown"
                ? "Needs date"
                : state === "expired"
                  ? `${Math.abs(d)}d ago`
                  : d === 0
                    ? "Today"
                    : `In ${d} days`
            }
          />
          <DetailTile
            icon={product.source === "manual" ? Pencil : ScanLine}
            label="Added via"
            value={
              product.source === "manual"
                ? "Manual"
                : product.source === "barcode"
                  ? "Barcode scan"
                  : "Receipt scan"
            }
          />
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">Estimated expiry</p>
          <p className="mt-1 text-sm">
            {state === "unknown"
              ? "No expiry date is stored yet. Add the label date or estimate it from storage guidance."
              : "AI estimated the best-before date from the product category and typical shelf life."}
          </p>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">Storage tip</p>
          <p className="mt-1 text-sm">
            {storageTips[product.category] ?? "Store appropriately to maximize freshness."}
          </p>
        </div>

        <div className="mt-auto space-y-3 pt-6">
          <Link
            to="/recipes"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-float transition-transform active:scale-[0.96]"
          >
            <ChefHat className="h-5 w-5" />
            Use in a recipe
          </Link>
          <button
            onClick={handleRemove}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-destructive-soft py-4 text-base font-semibold text-destructive transition-transform active:scale-[0.96]"
          >
            <Trash2 className="h-5 w-5" />
            Remove from kitchen
          </button>
        </div>
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[360px] rounded-3xl border-0 p-5 shadow-float">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
            <DialogDescription>Update the item details stored in your kitchen.</DialogDescription>
          </DialogHeader>

          {editForm ? (
            <form className="space-y-3" onSubmit={handleEditSubmit}>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Product name</label>
                <Input
                  value={editForm.display_name}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, display_name: event.target.value } : current,
                    )
                  }
                />
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Quantity</label>
                  <Input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={editForm.quantity}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, quantity: event.target.value } : current,
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Unit</label>
                  <select
                    value={editForm.unit}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, unit: event.target.value as Product["unit"] }
                          : current,
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <select
                  value={editForm.category}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, category: event.target.value } : current,
                    )
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {categoryChoices.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Store in</label>
                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-secondary p-1">
                  {locationOptions.map((location) => (
                    <button
                      key={location}
                      type="button"
                      onClick={() =>
                        setEditForm((current) => (current ? { ...current, location } : current))
                      }
                      className={cn(
                        "min-h-10 rounded-xl text-xs font-semibold capitalize transition-[background-color,color,box-shadow,transform] active:scale-[0.96]",
                        editForm.location === location
                          ? "bg-card text-foreground shadow-soft"
                          : "text-muted-foreground",
                      )}
                    >
                      {location}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Best-before date</label>
                <Input
                  type="date"
                  value={editForm.expiration_date}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, expiration_date: event.target.value } : current,
                    )
                  }
                />
              </div>

              {editError ? <p className="text-sm text-destructive">{editError}</p> : null}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-10 flex-1 rounded-2xl transition-transform active:scale-[0.96]"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="min-h-10 flex-1 rounded-2xl transition-transform active:scale-[0.96]"
                  disabled={updateInventoryMutation.isPending}
                >
                  {updateInventoryMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </PhoneShell>
  );
}

function DetailTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
