import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/goals")({
  loader: () => {
    throw redirect({ to: "/onboarding" });
  },
});
