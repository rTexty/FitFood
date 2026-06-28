import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { X, RefreshCw, ImageUp, Edit3 } from "lucide-react";
import { PhoneShell, StatusBar } from "@/components/fitfood/Shell";

export const Route = createFileRoute("/scan-error")({
  head: () => ({
    meta: [
      { title: "Scan Failed — FitFood" },
      { name: "description", content: "The receipt could not be recognized. Try scanning again." },
    ],
  }),
  component: ScanError,
});

function ScanError() {
  return (
    <PhoneShell>
      <StatusBar />
      <div className="flex flex-1 flex-col px-6 pb-8">
        <div className="flex flex-col items-center pt-16 text-center">
          <motion.span
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 14 }}
            className="grid h-24 w-24 place-items-center rounded-full bg-destructive-soft text-destructive"
          >
            <X className="h-12 w-12" strokeWidth={3} />
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-6 text-2xl font-extrabold"
          >
            Couldn't read receipt
          </motion.h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The QR code was blurry or unsupported. Make sure the whole code is visible and try
            again, or add the products manually.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">Tips for a clean scan</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li className="flex gap-2">
              <span className="text-primary">•</span> Flatten the receipt on a surface
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span> Avoid glare and shadows
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span> Keep the QR code fully in frame
            </li>
          </ul>
        </div>

        <div className="mt-auto space-y-3 pt-8">
          <Link
            to="/scan"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-float transition active:scale-[0.98]"
          >
            <RefreshCw className="h-5 w-5" />
            Try again
          </Link>
          <Link
            to="/scan"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-4 text-base font-semibold text-foreground"
          >
            <ImageUp className="h-5 w-5" />
            Upload an image instead
          </Link>
          <Link
            to="/dashboard"
            className="flex w-full items-center justify-center gap-2 py-1 text-sm font-medium text-muted-foreground"
          >
            <Edit3 className="h-4 w-4" />
            Add products manually
          </Link>
        </div>
      </div>
    </PhoneShell>
  );
}
