# User Acceptance Testing (UAT) Scenario Registry

This document maintains the active, end-user-facing validation scenarios for the FitFood platform. These scenarios are designed to be executed manually by stakeholders or customers during Sprint Review sessions to verify that business requirements meet production quality expectations.

---

## 📋 UAT-001: Manual Product Logging & Catalog Inventory Check

* **Characteristic:** Functional Suitability (Appropriateness)
* **Description:** Verify that an end-user can successfully log a new food item manually with its expiration metrics and observe it in their central inventory dashboard.
* **Pre-conditions:** The user is logged into the application sandbox environment. The product catalog database is online.

### Execution Steps:
| # | Step Action | Expected System Response | Status (Week 4) |
|---|---|---|---|
| 1 | Navigate to the main dashboard and click the **"Add Product"** action control. | The manual product input form modal is displayed with clear, accessible fields. | **Passed** |
| 2 | Enter product details: Name (`Greek Yogurt 5%`), Expiration Date (set to 5 days from today), and Category (`Dairy`). Click **"Save"**. | The modal dismisses without errors. A dynamic success alert confirms the persistence layer operation. | **Passed** |
| 3 | Return to the primary product inventory catalog view. | The newly logged product `Greek Yogurt 5%` appears at the top of the inventory array, displaying correct metadata. | **Passed** |

* **Traceability:** Maps directly to User Story `US-001-Inventory` and Database Infrastructure tracking logic.

---

## 📋 UAT-002: Dynamic Multi-Criteria Inventory Filtration

* **Characteristic:** Functional Suitability (Completeness)
* **Description:** Verify that the system correctly isolates and filters stored inventory products based on dynamic text patterns and category criteria (directly addressing historical customer critique).
* **Pre-conditions:** The database has been pre-populated with at least 5 baseline mock records across distinct categories (e.g., `Dairy`, `Bakery`, `Meat`).

### Execution Steps:
| # | Step Action | Expected System Response | Status (Week 4) |
|---|---|---|---|
| 1 | Navigate to the primary inventory view board layout. | The complete list of 5+ items is displayed under the default unsorted grid hierarchy. | **Passed** |
| 2 | Click on the **"Category Filter"** dropdown menu selector and choose `Dairy`. | The view dynamically refreshes, masking all non-dairy objects. Only `Dairy` products remain inspectable. | **Passed** |
| 3 | In the dynamic search input box, type the search string token: `Greek`. | The catalog updates instantaneously, isolating the single `Greek Yogurt 5%` record. Empty state parameters do not trigger. | **Passed** |

* **Traceability:** Maps directly to customer feedback point #23 (`FEAT-002: Advanced Filtration Controls`).

---

## 📋 UAT-003: Core AI Recipe Recommendation Execution Loop

* **Characteristic:** Functional Suitability (Functional Correctness)
* **Description:** Validate that the system safely pipes localized inventory records (specifically items approaching their expiration thresholds) into the external LLM orchestration layer to generate a coherent, tailored recipe recommendation layout.
* **Pre-conditions:** Active sandbox API connection boundaries are established. The inventory contains items tagged as expiring soon.

### Execution Steps:
| # | Step Action | Expected System Response | Status (Week 4) |
|---|---|---|---|
| 1 | Open the specialized **"Smart Recipes"** generation panel workflow. | The system scans local inventory contexts and displays a summary layout of items requiring immediate consumption. | **Passed** |
| 2 | Click the primary interactive prompt control: **"Generate AI Recipe"**. | A clean processing loading state animation triggers, indicating safe background thread execution. | **Passed** |
| 3 | Await response delivery from the core processing infrastructure. | The component displays a structured, fully readable recipe output box (Title, Ingredients utilized, and Step-by-Step cooking instructions). No system timeout errors are produced. | **Passed** |

* **Traceability:** Maps directly to high-priority Sprint 2 requirement `US-005-AI` (Recipe Generation Module).

---

## 🪵 Historic Execution Logs (Sprint 2 / Week 4)

* **Date of Testing Session:** June 28, 2026
* **Tester/Evaluator:** Target Customer (Evaluated during the combined Sprint Review and UAT recorded session)
* **Summary Record:** All 3 active end-user acceptance criteria scenarios were manually executed and evaluated. The application successfully satisfied structural expectations without triggering fatal stack exceptions or empty localized state returns.
