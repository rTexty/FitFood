from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserAccount(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    locale: Mapped[str] = mapped_column(String(20), nullable=False, default="en-US")
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="UTC")
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    primary_fridge_id: Mapped[int | None] = mapped_column(
        ForeignKey("fridges.id"),
        nullable=True,
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    current_goal: Mapped["UserGoal | None"] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )
    profile: Mapped["UserProfile | None"] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )
    fridges: Mapped[list["Fridge"]] = relationship(
        back_populates="user",
        foreign_keys="Fridge.user_id",
    )
    shopping_lists: Mapped[list["ShoppingList"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    meal_plans: Mapped[list["MealPlan"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    age_years: Mapped[int] = mapped_column(Integer, nullable=False)
    sex_for_calorie_estimate: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="not_specified",
    )
    height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    activity_level: Mapped[str] = mapped_column(String(30), nullable=False)
    dietary_preferences_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    allergies_json: Mapped[list[dict[str, str]]] = mapped_column(JSON, nullable=False, default=list)
    calorie_formula: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="mifflin_st_jeor",
    )
    calorie_estimate_json: Mapped[dict[str, object]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[UserAccount] = relationship(back_populates="profile")


class UserGoal(Base):
    __tablename__ = "user_goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    goal: Mapped[str] = mapped_column(String(20), nullable=False)
    calories_target: Mapped[int] = mapped_column(Integer, nullable=False)
    protein_target: Mapped[int] = mapped_column(Integer, nullable=False)
    carbs_target: Mapped[int] = mapped_column(Integer, nullable=False)
    fat_target: Mapped[int] = mapped_column(Integer, nullable=False)
    active_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    active_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimate_snapshot_json: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[UserAccount] = relationship(back_populates="current_goal")


class Fridge(Base):
    __tablename__ = "fridges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(50), default="fridge")
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[UserAccount | None] = relationship(
        back_populates="fridges",
        foreign_keys=[user_id],
    )
    inventory_items: Mapped[list["InventoryItem"]] = relationship(
        back_populates="fridge",
        cascade="all, delete-orphan",
    )
    meal_plans: Mapped[list["MealPlan"]] = relationship(back_populates="fridge")


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fridge_id: Mapped[int] = mapped_column(ForeignKey("fridges.id"), index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Float, default=1)
    unit: Mapped[str] = mapped_column(String(30), default="pcs")
    location: Mapped[str] = mapped_column(String(50), default="fridge")
    category: Mapped[str] = mapped_column(String(50), default="Other")
    source: Mapped[str] = mapped_column(String(50), default="manual")
    source_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiration_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiration_date_source: Mapped[str] = mapped_column(String(40), nullable=False, default="unknown")
    expiration_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    fridge: Mapped[Fridge] = relationship(back_populates="inventory_items")


class CanonicalProduct(Base):
    __tablename__ = "canonical_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="Other")
    default_location: Mapped[str] = mapped_column(String(50), nullable=False, default="fridge")
    shelf_life_days: Mapped[int] = mapped_column(Integer, nullable=False, default=14)
    expiration_confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.45)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    aliases: Mapped[list["ProductAlias"]] = relationship(
        back_populates="canonical_product",
        cascade="all, delete-orphan",
    )


class ProductAlias(Base):
    __tablename__ = "product_aliases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canonical_product_id: Mapped[int] = mapped_column(
        ForeignKey("canonical_products.id"),
        nullable=False,
        index=True,
    )
    alias: Mapped[str] = mapped_column(String(160), nullable=False)
    normalized_alias: Mapped[str] = mapped_column(String(160), nullable=False, unique=True, index=True)
    locale: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="seed")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.8)

    canonical_product: Mapped[CanonicalProduct] = relationship(back_populates="aliases")


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    goal: Mapped[str] = mapped_column(String(50), default="maintain")
    goals_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    hero_emoji: Mapped[str] = mapped_column(String(20), nullable=False, default="🍽️")
    tags_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    servings: Mapped[int] = mapped_column(Integer, default=1)
    minutes: Mapped[int] = mapped_column(Integer, default=15)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="local")
    source_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attribution_json: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    instructions_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    nutrition_snapshot_json: Mapped[dict[str, float] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id"), index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    raw_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    optional: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="local")

    recipe: Mapped[Recipe] = relationship(back_populates="ingredients")


class ProviderCache(Base):
    __tablename__ = "provider_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    cache_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    response_json: Mapped[dict[str, object] | list[object]] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AiArtifact(Base):
    __tablename__ = "ai_artifacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="minimax")
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    task_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    cache_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    request_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    output_json: Mapped[dict[str, object] | list[object]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="succeeded")
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ShoppingList(Base):
    __tablename__ = "shopping_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    fridge_id: Mapped[int | None] = mapped_column(ForeignKey("fridges.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="Active Shopping List")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")

    user: Mapped[UserAccount] = relationship(back_populates="shopping_lists")
    items: Mapped[list["ShoppingListItem"]] = relationship(
        back_populates="shopping_list",
        cascade="all, delete-orphan",
    )


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    shopping_list_id: Mapped[int] = mapped_column(ForeignKey("shopping_lists.id"), index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    unit: Mapped[str] = mapped_column(String(30), nullable=False, default="item")
    source_recipe_id: Mapped[int | None] = mapped_column(ForeignKey("recipes.id"), nullable=True)
    checked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    shopping_list: Mapped[ShoppingList] = relationship(back_populates="items")


class MealPlan(Base):
    __tablename__ = "meal_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    fridge_id: Mapped[int] = mapped_column(ForeignKey("fridges.id"), index=True)
    goal: Mapped[str | None] = mapped_column(String(20), nullable=True)
    span_days: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[UserAccount] = relationship(back_populates="meal_plans")
    fridge: Mapped[Fridge] = relationship(back_populates="meal_plans")
    entries: Mapped[list["MealPlanEntry"]] = relationship(
        back_populates="meal_plan",
        cascade="all, delete-orphan",
    )


class MealPlanEntry(Base):
    __tablename__ = "meal_plan_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meal_plan_id: Mapped[int] = mapped_column(ForeignKey("meal_plans.id"), index=True)
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)
    meal_type: Mapped[str] = mapped_column(String(30), nullable=False)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id"), nullable=False)
    servings: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    nutrition_snapshot_json: Mapped[dict[str, float]] = mapped_column(JSON, nullable=False)

    meal_plan: Mapped[MealPlan] = relationship(back_populates="entries")
    recipe: Mapped[Recipe] = relationship()
