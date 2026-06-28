# Customer Review Summary — Week 4

**Date:** [28.06.2026]

**Participants:**
- Arseniy (Project Manager)
- Kamil (Backend Engineer)
- Nurmuhammet (QA / Reporter)
- Racha (UI/UX Designer) 
- Artem (Backend Engineer)
- Customer

**Sprint Goal reviewed:** Deliver MVP v2 increment with receipt scanning, inventory management, recipe suggestions, and initial meal plan generation.

---

## Artifacts demonstrated

- Full application walkthrough (mobile app, localhost)
- User onboarding flow (goal setting, parameters, preferences, allergies)
- Manual product addition and barcode scanning feature
- Receipt scanning via Gemini (Gemma 4B) LLM
- Inventory view with expiration tracking
- Recipe database with missing-ingredient sorting
- Meal plan generation (placeholder/stub state)

---

## Feedback received

1. **Expiration date accuracy** — The customer noted that LLM-generated expiration dates are too generic and unreliable. Recommended using an external service (CRPT Mobile API) to retrieve expiration dates by product unique identifier first, and falling back to LLM estimation only when the product is not found in the external service.

2. **Calorie data missing** — The open recipe database does not include calorie information for all dishes. The customer requested that calorie data be added so that meal plan generation can be based on accurate nutritional values aligned with the user's fitness goal.

3. **Meal plan generation** — The current meal plan generation relies entirely on the external LLM (Gemini). The customer recommended increasing the LLM temperature parameter to add variety to generated plans and avoid repetitive suggestions. Ideally, the team should fine-tune a small local model on the recipe database for more reliable and controlled results.

4. **Too many placeholders** — The customer observed that several screens in the demo were stubs or placeholders, including the daily meal planner. Requested that the team replace placeholders with functional implementations before the next review.

5. **Barcode scanning** — The barcode scanning feature was not functioning during the demo. The customer acknowledged it worked previously but expects it to be restored and reliable.

6. **Non-food item filtering** — The customer asked whether non-food items (cleaning products, soap, etc.) scanned from receipts are filtered out before being added to the inventory or recipe matching. The team confirmed they are excluded.

7. **Recipe matching algorithm** — The customer suggested fine-tuning a small model (e.g., a lightweight open-source LLM) on the team's recipe database to improve matching between available ingredients, user goals, and recipe recommendations. The customer acknowledged that using an external LLM is acceptable if the output is validated and reliable.

---

## Status

- [ ] Approved
- [x] Changes required

**Requested changes for next Sprint:**
- Integrate CRPT Mobile API (or equivalent) for product expiration date lookup by unique identifier; use LLM fallback only when the product is not found.
- Add calorie data to the recipe database to enable accurate nutritional meal plan generation.
- Increase LLM temperature parameter to improve variety in generated meal plans.
- Replace remaining placeholder screens with functional implementations.
- Restore barcode scanning functionality.
- Investigate and optionally implement fine-tuning of a small local model on the recipe database.

---

## Action points

| Action | Owner | Priority |
|---|---|---|
| Integrate external expiration date API (CRPT) | Kamil / Artem | High |
| Add calorie data to recipe database | Kamil / Artem | High |
| Fix barcode scanning | Kamil | High |
| Increase LLM temperature for meal plan variety | Kamil | Medium |
| Replace meal planner placeholder with functional screen | Kamil / Artem | Medium |
| Investigate fine-tuning small local model | Team | Low |
