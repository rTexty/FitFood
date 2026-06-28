import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { PhoneShell, Scrollable, StatusBar, TopBar } from "./Shell";
import { Skeleton } from "@/components/ui/skeleton";

export function RoutePendingScreen({
  title,
  subtitle,
  back,
}: {
  title: string;
  subtitle?: string;
  back?: string;
}) {
  return (
    <PhoneShell>
      <StatusBar />
      <TopBar title={title} subtitle={subtitle} back={back} />
      <Scrollable className="px-5">
        <div className="grid grid-cols-3 gap-2.5">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <Skeleton className="mt-4 h-24 rounded-2xl" />
        <div className="mt-4 space-y-3 pb-6">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      </Scrollable>
    </PhoneShell>
  );
}

export function RouteErrorScreen({
  title,
  message,
  back = "/dashboard",
}: {
  title: string;
  message: string;
  back?: string;
}) {
  return (
    <PhoneShell>
      <StatusBar />
      <TopBar title={title} back={back} />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-warning-soft text-warning-foreground">
          <AlertTriangle className="h-8 w-8" />
        </span>
        <h2 className="mt-5 text-xl font-bold">Couldn&apos;t load this screen</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Link
          to={back}
          className="mt-6 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          Back to kitchen
        </Link>
      </div>
    </PhoneShell>
  );
}
