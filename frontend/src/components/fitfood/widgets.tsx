import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysUntil, freshState, type Product } from "@/lib/fitfood-data";

export function ExpiryBadge({
  expiryDate,
  className,
}: {
  expiryDate: string | null;
  className?: string;
}) {
  const state = freshState(expiryDate);
  const d = daysUntil(expiryDate);
  const map = {
    expired: { cls: "bg-destructive-soft text-destructive", label: "Expired", icon: AlertTriangle },
    expiring: {
      cls: "bg-warning-soft text-warning-foreground",
      label: d === 0 ? "Today" : `${d}d left`,
      icon: Clock,
    },
    fresh: { cls: "bg-success-soft text-success", label: `${d}d left`, icon: Check },
    unknown: { cls: "bg-secondary text-muted-foreground", label: "Needs date", icon: Clock },
  } as const;
  const { cls, label, icon: Icon } = map[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        cls,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export function ProductCard({
  product,
  onRemove,
}: {
  product: Product;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <Link
        to="/product/$id"
        params={{ id: product.id }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition-transform hover:bg-secondary/60 active:scale-[0.96]"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-secondary text-2xl">
          {product.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{product.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {product.quantity}
            {product.unit === "count"
              ? ""
              : product.unit === "pack"
                ? " pack"
                : ` ${product.unit}`}{" "}
            · {product.category}
          </p>
        </div>
        <ExpiryBadge expiryDate={product.expiryDate} />
      </Link>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${product.name}`}
          onClick={() => onRemove(product.id)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive-soft text-destructive transition-transform active:scale-[0.96]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones = {
    default: "bg-card border-border",
    success: "bg-success-soft border-transparent",
    warning: "bg-warning-soft border-transparent",
    danger: "bg-destructive-soft border-transparent",
  } as const;
  return (
    <div className={cn("rounded-2xl border p-3.5", tones[tone])}>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-xs font-medium text-foreground">{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
