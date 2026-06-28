import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Refrigerator, Clock, ChefHat, CalendarDays, User } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Centered phone canvas used on every screen. */
export function PhoneShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-screen w-full justify-center bg-secondary py-0 sm:py-6">
      <div
        className={cn(
          "relative flex h-screen w-full max-w-[430px] flex-col overflow-hidden bg-background shadow-card sm:h-[900px] sm:rounded-[2.5rem] sm:border sm:border-border",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function StatusBar(_props: { dark?: boolean }) {
  return null;
}

export function TopBar({
  title,
  subtitle,
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 pb-3 pt-2">
      {back ? (
        <Link
          to={back}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition hover:bg-accent"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
      ) : (
        <div className="h-10 w-10" />
      )}
      <div className="min-w-0 text-center">
        <h1 className="truncate text-lg font-bold">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex h-10 w-10 items-center justify-end">{right}</div>
    </header>
  );
}

const navItems = [
  { to: "/dashboard", label: "Kitchen", icon: Refrigerator },
  { to: "/expiring", label: "Expiring", icon: Clock },
  { to: "/recipes", label: "Recipes", icon: ChefHat },
  { to: "/planner", label: "Planner", icon: CalendarDays },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="sticky bottom-0 z-20 mt-auto border-t border-border bg-card/95 px-2 pb-5 pt-2 backdrop-blur">
      <div className="flex items-stretch justify-between">
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-[10px] font-semibold transition",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-12 place-items-center rounded-2xl transition",
                  active ? "bg-primary-soft" : "bg-transparent",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Scrollable({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("no-scrollbar flex-1 overflow-y-auto", className)}>{children}</div>;
}
