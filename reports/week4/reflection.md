# Sprint Reflection — Week 4

## Learning points

- **LLM reliability is a product risk, not just a technical detail.** The customer pointed out that relying solely on an external LLM (Gemini) for expiration date estimation and meal plan generation produces results that are not reliable enough for a real product. We learned that LLM output must be validated against structured data sources — in our case, an external product database — before being shown to users.

- **Data completeness is a prerequisite for AI features.** The open recipe database we used does not include calorie data for all dishes, which blocked correct meal plan generation. We learned that integrating AI features without a complete and clean data layer leads to incomplete functionality regardless of how good the model is.

- **Fine-tuning a small local model is more appropriate than prompt engineering a large general model** for domain-specific tasks like matching ingredients to personalized meal plans. The customer suggested using a lightweight model trained on our own recipe database, which would give more controlled and consistent results.

- **Demo preparation requires a dedicated verification step.** The barcode scanning feature failed during the live demo despite working beforehand. A structured pre-demo smoke check would have caught this issue.

## Validated assumptions

- **Assumption confirmed:** The UI/UX design direction is acceptable to the customer — the interface was described as clean and pleasant.
- **Assumption rejected:** We assumed that using an external LLM for all AI tasks (expiration dates, meal planning) would be sufficient. The customer made clear that LLM-only output is not reliable enough and that structured external data sources must be used as the primary source, with LLM as a fallback.
- **Assumption rejected:** We assumed the open recipe database would be sufficient as-is. Missing calorie data means it cannot support the core meal planning feature without additional data work.

## Friction and gaps

- Calorie data is missing from the recipe database — this blocks accurate meal plan generation based on user fitness goals.
- Expiration date accuracy relies entirely on LLM estimation, which is not reliable for all product types.
- The CRPT Mobile API token shared by the customer is expired — a new token needs to be obtained before integration can begin.
- Barcode scanning was broken during the demo — root cause not yet identified.
- The daily meal planner screen is still a placeholder with no functional implementation.
- Fine-tuning a local model requires ML expertise that is currently limited within the team.

## Planned response

- **Next Sprint priority 1:** Integrate the external product expiration date API (CRPT or equivalent) as the primary data source, with LLM fallback — addresses customer feedback on data reliability.
- **Next Sprint priority 2:** Add calorie data to the recipe database to unblock meal plan generation aligned with user fitness goals.
- **Next Sprint priority 3:** Fix barcode scanning and run a pre-demo smoke check before the next customer review.
- **Longer term:** Investigate fine-tuning a lightweight open-source model on the team's recipe database to improve recipe-to-goal matching reliability.
