# FitFood Product Roadmap

This roadmap outlines the strategic evolution of the FitFood application across key development milestones. It maps user stories and technical initiatives to specific product releases.

---

## 🎯 Executive Summary
FitFood is a smart nutrition and meal planning assistant designed to help users track their current fridge inventory, minimize food waste, and automatically generate personalized meal plans based on available products.

---

## 🚀 Phase 1: MVP v1 (Sprint 1) — Core Inventory & Receipt Scanning
**Focus:** Establishing the database architecture, core inventory tracking UI, and initial product ingestion mechanics.  
**Target Release:** `v1.0.0`

### 💻 Epics & User Stories Included:
*   **[Must Have]** `TECH-001` / `TECH-002` / `TECH-003`: Database schema setup (Product, Inventory, Recipes) and SQLAlchemy model implementations.
*   **[Must Have]** `US-001`: Add products manually to the digital inventory.
*   **[Must Have]** `US-002`: Scan receipt QR codes to auto-populate the fridge inventory.
*   **[Must Have]** `US-003`: Track product expiration dates.
*   **[Must Have]** `US-004`: Receive expiration notifications.
*   **[Must Have]** `US-006`: Core Recipe database integration.

### 🛡️ Status & Verification:
*   **Database & Core API:** Implemented and undergoing review.
*   **UI/UX Prototypes:** Completed in Lovable/Figma for inventory management and QR scanning flows.

---

## 📈 Phase 2: MVP v2 (Sprint 2) — AI-Driven Meal Recommendations & Core Analytics
**Focus:** Integrating the AI recipe generation engine based on available inventory and basic nutrition goals.  
**Target Release:** `v2.0.0` (Proposed)

### 🔮 Planned Features & User Stories:
*   **[Must Have]** `US-005`: Get dynamic recipe suggestions purely based on currently available products in the fridge.
*   **[Should Have]** `US-012`: Generate localized meal plans from current fridge inventory to minimize waste.
*   **[Should Have]** `US-008`: Set a personal nutrition/fitness goal within the user profile.
*   **[Should Have]** `US-009`: Weekly meal plan generation schedules.

---

## 💎 Phase 3: MVP v3 (Sprint 3 & Beyond) — Advanced Nutrition & Public API
**Focus:** Fine-grained macro/micro tracking, comprehensive historical data, and external developer ecosystem.  
**Target Release:** `v3.0.0` (Proposed)

### 🗺️ Future Horizon:
*   **[Should Have]** `US-010`: View detailed nutritional information for suggested recipes.
*   **[Should Have]** `US-011`: Track precise product quantity by weight or item count.
*   **[Should Have]** `US-013`: Detailed KBJU (КБЖУ) tracking per individual product and compiled meals.
*   **[Must Have]** `US-007`: Public API deployment for external integrations.

---

## ⚠️ Key Risks & Assumptions
1.  **Receipt API Dependency (`US-002`):** Assumes stable integration with external receipt/fiscal data providers. A manual fallback UI must be implemented in MVP v1.
2.  **LLM Ingestion & Processing (`US-005`):** Recipe suggestions rely on consistent parsing of text. Prompt engineering and fallback static recipes will be required during Sprint 2.
