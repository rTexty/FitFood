from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1.deps import get_session
from app.api.v1.pagination import build_list_meta
from app.db.models import (
    Fridge,
    InventoryItem,
    Recipe,
    ShoppingList,
    ShoppingListItem,
)
from app.services.demo_user import get_or_create_demo_user


router = APIRouter()


class ShoppingListItemUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    checked: bool | None = None
    quantity: float | None = Field(default=None, gt=0)
    unit: str | None = Field(default=None, min_length=1, max_length=30)

    @model_validator(mode="after")
    def validate_at_least_one_field(self) -> "ShoppingListItemUpdateRequest":
        if self.checked is None and self.quantity is None and self.unit is None:
            raise ValueError("At least one field must be provided")
        return self


def serialize_shopping_list_item(item: ShoppingListItem) -> dict[str, object]:
    return {
        "id": item.id,
        "shopping_list_id": item.shopping_list_id,
        "display_name": item.display_name,
        "normalized_name": item.normalized_name,
        "quantity": item.quantity,
        "unit": item.unit,
        "source_recipe_id": item.source_recipe_id,
        "checked": item.checked,
    }


def _get_active_shopping_list(session: Session, user_id: str) -> ShoppingList | None:
    return session.scalar(
        select(ShoppingList)
        .options(selectinload(ShoppingList.items))
        .where(ShoppingList.user_id == user_id, ShoppingList.status == "active")
        .order_by(ShoppingList.id.asc())
    )


def _get_or_create_active_shopping_list(
    session: Session,
    *,
    user_id: str,
    fridge_id: int | None,
) -> ShoppingList:
    shopping_list = _get_active_shopping_list(session, user_id)
    if shopping_list is not None:
        return shopping_list

    shopping_list = ShoppingList(
        user_id=user_id,
        fridge_id=fridge_id,
        name="Active Shopping List",
        status="active",
    )
    session.add(shopping_list)
    session.commit()
    session.refresh(shopping_list)
    return shopping_list


def _get_recipe_or_404(session: Session, recipe_id: int) -> Recipe:
    recipe = session.scalar(
        select(Recipe)
        .options(selectinload(Recipe.ingredients))
        .where(Recipe.id == recipe_id, Recipe.is_active.is_(True))
    )
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    return recipe


def _get_shopping_list_item_or_404(
    session: Session,
    *,
    user_id: str,
    item_id: int,
) -> ShoppingListItem:
    item = session.scalar(
        select(ShoppingListItem)
        .join(ShoppingList, ShoppingList.id == ShoppingListItem.shopping_list_id)
        .where(
            ShoppingListItem.id == item_id,
            ShoppingList.user_id == user_id,
            ShoppingList.status == "active",
        )
    )
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shopping list item not found",
        )
    return item


@router.post(
    "/recipe-matches/{recipe_id}/shopping-list-items",
    status_code=status.HTTP_201_CREATED,
)
def add_missing_recipe_ingredients_to_shopping_list(
    recipe_id: int,
    fridge_id: int = Query(ge=1),
    session: Session = Depends(get_session),
) -> dict[str, dict[str, object]]:
    user = get_or_create_demo_user(session)
    fridge = session.get(Fridge, fridge_id)
    if fridge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fridge not found")

    recipe = _get_recipe_or_404(session, recipe_id)
    available_names = set(
        session.scalars(
            select(InventoryItem.normalized_name).where(InventoryItem.fridge_id == fridge_id)
        ).all()
    )
    missing_ingredients = [
        ingredient
        for ingredient in recipe.ingredients
        if ingredient.normalized_name not in available_names and not ingredient.optional
    ]

    shopping_list = _get_or_create_active_shopping_list(
        session,
        user_id=user.id,
        fridge_id=fridge_id,
    )
    existing_items = {
        item.normalized_name: item
        for item in session.scalars(
            select(ShoppingListItem).where(ShoppingListItem.shopping_list_id == shopping_list.id)
        ).all()
    }

    created_count = 0
    merged_count = 0
    touched_items: list[ShoppingListItem] = []
    for ingredient in missing_ingredients:
        existing_item = existing_items.get(ingredient.normalized_name)
        if existing_item is not None:
            existing_item.quantity += 1
            merged_count += 1
            touched_items.append(existing_item)
            continue

        shopping_list_item = ShoppingListItem(
            shopping_list_id=shopping_list.id,
            display_name=ingredient.display_name,
            normalized_name=ingredient.normalized_name,
            quantity=1,
            unit="item",
            source_recipe_id=recipe.id,
            checked=False,
        )
        session.add(shopping_list_item)
        session.flush()
        existing_items[shopping_list_item.normalized_name] = shopping_list_item
        touched_items.append(shopping_list_item)
        created_count += 1

    session.commit()

    return {
        "data": {
            "shopping_list_id": shopping_list.id,
            "created_count": created_count,
            "merged_count": merged_count,
            "items": [serialize_shopping_list_item(item) for item in touched_items],
        }
    }


@router.get("/shopping-list-items")
def list_active_shopping_list_items(
    session: Session = Depends(get_session),
) -> dict[str, object]:
    user = get_or_create_demo_user(session)
    shopping_list = _get_active_shopping_list(session, user.id)
    if shopping_list is None:
        return {"data": [], "meta": build_list_meta(0)}

    items = session.scalars(
        select(ShoppingListItem)
        .where(ShoppingListItem.shopping_list_id == shopping_list.id)
        .order_by(ShoppingListItem.id.asc())
    ).all()
    data = [serialize_shopping_list_item(item) for item in items]
    return {"data": data, "meta": build_list_meta(len(data))}


@router.patch("/shopping-list-items/{item_id}")
def update_shopping_list_item(
    item_id: int,
    payload: ShoppingListItemUpdateRequest,
    session: Session = Depends(get_session),
) -> dict[str, dict[str, object]]:
    user = get_or_create_demo_user(session)
    item = _get_shopping_list_item_or_404(session, user_id=user.id, item_id=item_id)

    if payload.checked is not None:
        item.checked = payload.checked
    if payload.quantity is not None:
        item.quantity = payload.quantity
    if payload.unit is not None:
        item.unit = payload.unit

    session.commit()
    session.refresh(item)
    return {"data": serialize_shopping_list_item(item)}


@router.delete("/shopping-list-items/{item_id}")
def delete_shopping_list_item(
    item_id: int,
    session: Session = Depends(get_session),
) -> dict[str, dict[str, object]]:
    user = get_or_create_demo_user(session)
    item = _get_shopping_list_item_or_404(session, user_id=user.id, item_id=item_id)
    deleted_id = item.id
    session.delete(item)
    session.commit()
    return {"data": {"id": deleted_id, "deleted": True}}
