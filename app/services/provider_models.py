from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class ProviderLookupError(Exception):
    """Raised when an upstream provider does not have a requested entity."""


class ProviderServiceError(Exception):
    """Raised when an upstream provider request fails."""


class ProviderUnavailableError(Exception):
    """Raised when a configured provider is intentionally unavailable."""


class ProviderBudgetExceededError(Exception):
    """Raised when a provider budget or rate guardrail is exceeded."""


class NutritionPer100g(BaseModel):
    model_config = ConfigDict(extra="forbid")

    calories: float | None = None
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None


class BarcodeProductSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    barcode: str
    display_name: str = Field(min_length=1, max_length=120)
    normalized_name: str = Field(min_length=1, max_length=120)
    brand: str | None = None
    category: str | None = None
    unit: str = Field(default="pcs", min_length=1, max_length=30)
    image_url: str | None = None
    provider: str = "open_food_facts"
    nutrition_per_100g: NutritionPer100g = Field(default_factory=NutritionPer100g)


class ReceiptOcrItemSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=120)
    normalized_name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(default=1, gt=0)
    unit: str = Field(default="pcs", min_length=1, max_length=30)
    location: str | None = Field(default=None, max_length=50)
    category: str | None = Field(default="Other", max_length=50)
    purchase_date: date | None = None
    expiration_date: date | None = None
    expiration_date_source: str | None = Field(default=None, max_length=40)
    expiration_confidence: float | None = Field(default=None, ge=0, le=1)
    confidence: float = Field(default=0.5, ge=0, le=1)


class ReceiptOcrPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receipt_id: str = Field(min_length=1, max_length=90)
    merchant: str | None = Field(default=None, max_length=120)
    purchase_date: str | None = Field(default=None, max_length=20)
    items: list[ReceiptOcrItemSuggestion] = Field(default_factory=list)
    summary: dict[str, object] = Field(default_factory=dict)


class NutritionSearchSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str
    display_name: str = Field(min_length=1, max_length=160)
    normalized_name: str = Field(min_length=1, max_length=160)
    brand: str | None = None
    description: str | None = None
    provider: str = "usda"
    nutrition_per_100g: NutritionPer100g = Field(default_factory=NutritionPer100g)


class ExternalRecipeIngredientSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=120)
    normalized_name: str = Field(min_length=1, max_length=120)
    raw_name: str | None = Field(default=None, max_length=255)
    quantity: float | None = None
    unit: str | None = Field(default=None, max_length=30)


class ExternalRecipeSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str
    name: str = Field(min_length=1, max_length=120)
    source_provider: str = "themealdb"
    source_url: str | None = None
    image_url: str | None = None
    category: str | None = None
    area: str | None = None
    tags: list[str] = Field(default_factory=list)
    instructions: list[str] = Field(default_factory=list)
    ingredients: list[ExternalRecipeIngredientSuggestion] = Field(default_factory=list)
    provider: str = "themealdb"
