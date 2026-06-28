from fastapi import APIRouter

from app.api.v1.endpoints import (
    fridges,
    health,
    imports,
    inventory,
    meal_plans,
    nutrition,
    recipes,
    shopping_list,
    users,
)


api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(fridges.router, tags=["fridges"])
api_router.include_router(inventory.router, tags=["inventory"])
api_router.include_router(recipes.router, tags=["recipes"])
api_router.include_router(shopping_list.router, tags=["shopping-list"])
api_router.include_router(meal_plans.router, tags=["meal-plans"])
api_router.include_router(imports.router, tags=["imports"])
api_router.include_router(nutrition.router, tags=["nutrition"])
api_router.include_router(users.router, tags=["users"])
