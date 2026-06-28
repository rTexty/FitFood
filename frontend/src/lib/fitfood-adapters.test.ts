import { describe, expect, it } from "vitest";
import { createFallbackApi, toProduct } from "./fitfood-adapters";

describe("fitfood fallback adapter", () => {
  it("uses seeded kitchen inventory and partitions it into fridge and pantry products", async () => {
    const api = createFallbackApi();
    const [fridge] = await api.getFridges();
    const items = await api.getInventoryItems(fridge.id);
    const products = items.map(toProduct);

    expect(products.length).toBeGreaterThan(0);
    expect(products.some((product) => product.location === "fridge")).toBe(true);
    expect(products.some((product) => product.location === "pantry")).toBe(true);
  });

  it("imports the demo receipt and persists the added products", async () => {
    const api = createFallbackApi();
    const [fridge] = await api.getFridges();
    const before = await api.getInventoryItems(fridge.id);

    const imported = await api.importReceiptDemo();
    const after = await api.getInventoryItems(fridge.id);

    expect(imported.items.length).toBeGreaterThan(0);
    expect(after).toHaveLength(before.length + imported.items.length);
  });

  it("does not invent receipt OCR items when running without a real OCR provider", async () => {
    const api = createFallbackApi();
    const preview = await api.ocrReceipt(
      new File(["receipt image"], "receipt.jpg", { type: "image/jpeg" }),
    );

    expect(preview.items).toEqual([]);
    expect(preview.summary.detected_count).toBe(0);
  });

  it("updates the active goal targets and filters recipe matches accordingly", async () => {
    const api = createFallbackApi();
    const [fridge] = await api.getFridges();

    await api.updateCurrentGoal({ goal: "gain" });

    const goal = await api.getCurrentGoal();
    const matches = await api.getRecipeMatches(fridge.id, { goal: "gain", maxMissing: 3 });

    expect(goal?.goal).toBe("gain");
    expect(matches.every((match) => match.recipe.goals.includes("gain"))).toBe(true);
  });

  it("lists the full recipe catalog independently from active goal matches", async () => {
    const api = createFallbackApi();
    const [fridge] = await api.getFridges();

    const catalog = await api.getRecipes();
    const gainMatches = await api.getRecipeMatches(fridge.id, { goal: "gain", maxMissing: 3 });

    expect(catalog.length).toBeGreaterThan(gainMatches.length);
    expect(catalog.some((recipe) => !recipe.goals.includes("gain"))).toBe(true);
  });
});
