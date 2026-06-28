import { createFileRoute } from "@tanstack/react-router";
import { EmptyKitchenScreen } from "@/components/fitfood/EmptyKitchen";

export const Route = createFileRoute("/empty-pantry")({
  head: () => ({
    meta: [
      { title: "Empty Pantry — FitFood" },
      {
        name: "description",
        content: "Your pantry is empty — add staples or scan a receipt to track them in FitFood.",
      },
    ],
  }),
  component: () => <EmptyKitchenScreen kind="pantry" />,
});
