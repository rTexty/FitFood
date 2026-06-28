# Customer Review Transcript — Week 4

**Date:** [28.06.2026]
**Meeting type:** Sprint Review with the customer
**Participants:** FitFood team (Arseniy, Kamil, Racha, Artem), Customer

---
Arseniy: Last week we received a task to start working on the recipe recognition and composition algorithm. Kamil, please show what we have now.

Kamil: I will show the full application — not completely finished, but roughly MVP v2. We start with the main menu. After pressing "Get started", the user enters their name, age, gender, weight, and height, then selects a goal: lose weight, maintain weight, or gain weight. After that, the user selects their activity level and number of workouts. The user can also specify dietary preferences and allergies, which will later influence the recipe recommendations.

Kamil: On the main screen, the user can add products manually — entering the product name, quantity, unit of measurement, category, storage location (fridge or shelf), and expiration date. There is also a barcode scanning feature: the camera scans the barcode on the packaging and retrieves the product information via an external third-party API.

Customer: What third-party service did you use, if that's not a secret?

Kamil: That is a secret for now — I need to check before answering.


Customer: You do know I will have access to your source code, right? We receive the source code at the end.


Kamil: Understood. I will clarify this later. Moving on — the barcode scanning is currently not working during this demo, but it was functional before. I will need to investigate the issue.


Kamil: Next, the receipt scanning feature. I uploaded a receipt image, and the system uses the Gemini model (Gemma 4B) to recognize the products. For example, bread, snacks, and a beverage were correctly identified from the receipt. Expiration dates are also estimated by the LLM based on the product type.


Customer: The expiration dates look the same for all products.

Kamil: Some differ slightly — for example, sausage has a shorter date than a beverage.

Customer: They are still roughly within the same range. The format is not highly reliable, I understand that.


Kamil: Yes, that can be improved. After adding products, they appear in the inventory. The expiring products section shows items that are close to their expiration date. For recipes, we loaded an open recipe database. Recipes are sorted by the number of missing ingredients — those with the fewest missing ingredients appear first. The calorie count is not yet calculated correctly because the open database does not include calorie data for all dishes.


Customer: If calorie data is missing, how does the meal plan generation work? The plan should be based on the calorie content of available products and recipes.


Kamil: Currently, the meal plan generation does not fully rely on calorie data. The plan takes the closest available recipes and passes them to the LLM, which generates the final plan.


Customer: So you are not building your own model — you are using an external LLM API like Gemini and passing all data to it?


Kamil: Correct. We pass the top recipes with the fewest missing ingredients to the LLM, approximately 20 at a time, and it generates the plan.


Customer: I see. I was expecting something slightly different. If you manage to finish this properly, it is acceptable. However, I was originally hoping you would build or fine-tune your own model with custom algorithms. Using an external LLM is a path of least resistance — the output is not always reliable. Let us at least focus on data accuracy.


Customer: I can share a resource where you can look up a product's expiration date by its unique identifier. Not all products are covered, but it is a good starting point. Also, please make sure non-food items from receipts — such as cleaning products or soap — are filtered out and not included in meal plans.


Kamil: Non-food items will not appear in recipe matching or meal plans.


Customer: What is your technology stack?


Kamil: We built both the backend and the frontend. Currently it is running locally on localhost — it is a mobile application.


Customer: I notice there are many placeholders. Can you show the receipt scanning again with a different receipt to verify?


Kamil: I am looking for another receipt now. The scanning works by passing the full photo to the LLM rather than using a QR scan. There is also an alternative approach — another team I work with used external tools for product identification, and I will share those resources with Arseniy.


Customer: My recommendation is: first, use the external services I shared to retrieve expiration dates based on product unique identifiers. If a product is not found in those services, fall back to the LLM estimate. Do not rely solely on LLM-generated dates for all products — the dates are too generic and not reliable enough.


Customer: You also need to add calorie data to the recipe database so that meal plan generation is based on accurate nutritional values. Additionally, increase the temperature parameter in your LLM calls to add variety to the generated plans and avoid repetitive suggestions when the same products are available repeatedly.


Customer: The design looks clean and pleasant. However, there are too many placeholders in the current demo. The two critical things remaining are: reliable data accuracy and the AI/ML component for recipe matching. You have approximately two to three weeks left — one week for the model work, one week for refinement and testing. That is enough time.


Customer: Focus on connecting the external service for product identification, then try to fine-tune a small model on your recipe database to improve matching against user goals and available ingredients. If that is not feasible, continue with the external LLM but ensure the output is validated. Are there any other questions?


Meeting ended.

---

*Transcript cleaned for readability. Filler words, false starts, waiting periods, and redundant repetitions were removed without altering meaning. Speaker names replaced with roles for privacy. No personally identifying information required redaction beyond role substitution.*
