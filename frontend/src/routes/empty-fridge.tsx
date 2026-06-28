import { createFileRoute } from "@tanstack/react-router";
import { EmptyKitchenScreen } from "@/components/fitfood/EmptyKitchen";

export const Route = createFileRoute("/empty-fridge")({
  head: () => ({
    meta: [
      { title: "Empty Fridge — FitFood" },
      {
        name: "description",
        content: "Your fridge is empty — scan a receipt to add fresh products to FitFood.",
      },
    ],
  }),
  component: () => <EmptyKitchenScreen kind="fridge" />,
});
