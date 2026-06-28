from __future__ import annotations

import httpx
from fastapi.testclient import TestClient

from app.services.cache.provider_cache import PersistentProviderCache
from app.services.provider_models import ProviderServiceError
from app.services.themealdb_catalog import import_themealdb_catalog
from app.services.themealdb import ThemealdbRecipeService


class FakeThemealdbRecipeService:
    def __init__(self) -> None:
        self.lookup_calls = 0
        self.search_calls = 0
        self.ingredient_filter_calls = 0

    def search_by_name(self, query: str, limit: int) -> list[dict[str, object]]:
        self.search_calls += 1
        return [self.lookup_recipe("52772")][:limit]

    def filter_by_ingredient(self, ingredient: str, limit: int) -> list[dict[str, object]]:
        self.ingredient_filter_calls += 1
        return [
            {
                "external_id": "52772",
                "name": "Arrabiata",
                "source_provider": "themealdb",
                "source_url": "https://www.themealdb.com/meal/52772",
                "image_url": "https://www.themealdb.com/images/media/meals/ustsqw1468250014.jpg",
                "category": "Vegetarian",
                "area": "Italian",
                "tags": ["Pasta"],
                "instructions": [],
                "ingredients": [],
                "provider": "themealdb",
            }
        ][:limit]

    def lookup_recipe(self, external_id: str) -> dict[str, object]:
        self.lookup_calls += 1
        return {
            "external_id": external_id,
            "name": "Arrabiata",
            "source_provider": "themealdb",
            "source_url": f"https://www.themealdb.com/meal/{external_id}",
            "image_url": "https://www.themealdb.com/images/media/meals/ustsqw1468250014.jpg",
            "category": "Vegetarian",
            "area": "Italian",
            "tags": ["Pasta"],
            "instructions": [
                "Bring water to a boil.",
                "Simmer the sauce and combine with pasta.",
            ],
            "ingredients": [
                {
                    "display_name": "Penne Rigate",
                    "normalized_name": "penne rigate",
                    "raw_name": "1 pound penne rigate",
                    "quantity": 1,
                    "unit": "pound",
                },
                {
                    "display_name": "Tomatoes",
                    "normalized_name": "tomatoes",
                    "raw_name": "3 cups tomatoes",
                    "quantity": 3,
                    "unit": "cups",
                },
            ],
            "provider": "themealdb",
        }

    def list_by_first_letter(self, first_letter: str, limit: int) -> list[dict[str, object]]:
        self.search_calls += 1
        return [
            self.lookup_recipe("52772"),
            {
                **self.lookup_recipe("52844"),
                "external_id": "52844",
                "name": "Lasagne",
                "category": "Pasta",
                "tags": ["Comfort"],
            },
        ][:limit]


def test_external_recipe_import_persists_recipe_and_reuses_saved_copy(
    client: TestClient,
) -> None:
    fake_service = FakeThemealdbRecipeService()
    client.app.state.themealdb_service = fake_service

    first_response = client.post(
        "/api/v1/recipes/import",
        json={"provider": "themealdb", "external_id": "52772", "goal": "maintain"},
    )
    second_response = client.post(
        "/api/v1/recipes/import",
        json={"provider": "themealdb", "external_id": "52772", "goal": "maintain"},
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 200
    assert fake_service.lookup_calls == 1

    first_recipe = first_response.json()["data"]
    second_recipe = second_response.json()["data"]
    assert first_recipe["id"] == second_recipe["id"]
    assert first_recipe["source_provider"] == "themealdb"
    assert first_recipe["external_id"] == "52772"
    assert first_recipe["instructions"] == [
        "Bring water to a boil.",
        "Simmer the sauce and combine with pasta.",
    ]
    assert first_recipe["ingredients"][0]["raw_name"] == "1 pound penne rigate"


def test_recipe_search_persists_provider_results_and_reuses_database(
    client: TestClient,
) -> None:
    fake_service = FakeThemealdbRecipeService()
    client.app.state.themealdb_service = fake_service

    first_response = client.get("/api/v1/recipes/search", params={"q": "Arrabiata", "limit": 5})
    second_response = client.get("/api/v1/recipes/search", params={"q": "Arrabiata", "limit": 5})
    catalog_response = client.get("/api/v1/recipes")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert catalog_response.status_code == 200
    assert fake_service.search_calls == 1

    first_recipe = first_response.json()["data"][0]
    second_recipe = second_response.json()["data"][0]
    catalog_names = {recipe["name"] for recipe in catalog_response.json()["data"]}

    assert first_recipe["id"] == second_recipe["id"]
    assert first_recipe["name"] == "Arrabiata"
    assert first_recipe["ingredients"][0]["raw_name"] == "1 pound penne rigate"
    assert "Arrabiata" in catalog_names


def test_ingredient_recipe_search_persists_full_lookup_before_reuse(
    client: TestClient,
) -> None:
    fake_service = FakeThemealdbRecipeService()
    client.app.state.themealdb_service = fake_service

    first_response = client.get(
        "/api/v1/recipes/search",
        params={"ingredient": "tomatoes", "limit": 5},
    )
    second_response = client.get(
        "/api/v1/recipes/search",
        params={"ingredient": "tomatoes", "limit": 5},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert fake_service.ingredient_filter_calls == 1
    assert fake_service.lookup_calls == 1

    first_recipe = first_response.json()["data"][0]
    second_recipe = second_response.json()["data"][0]
    assert first_recipe["id"] == second_recipe["id"]
    assert first_recipe["instructions"] == [
        "Bring water to a boil.",
        "Simmer the sauce and combine with pasta.",
    ]


def test_themealdb_recipe_service_caches_search_results(client: TestClient) -> None:
    calls = 0
    session_factory = client.app.state.session_factory

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.url.path == "/api/json/v1/1/search.php"
        assert request.url.params["s"] == "Arrabiata"
        return httpx.Response(
            200,
            json={
                "meals": [
                    {
                        "idMeal": "52772",
                        "strMeal": "Arrabiata",
                        "strDrinkAlternate": None,
                        "strCategory": "Vegetarian",
                        "strArea": "Italian",
                        "strInstructions": (
                            "Bring water to a boil.\r\n"
                            "Simmer the sauce and combine with pasta."
                        ),
                        "strMealThumb": (
                            "https://www.themealdb.com/images/media/meals/"
                            "ustsqw1468250014.jpg"
                        ),
                        "strTags": "Pasta,Curry",
                        "strYoutube": "",
                        "strIngredient1": "penne rigate",
                        "strIngredient2": "tomatoes",
                        "strIngredient3": "",
                        "strMeasure1": "1 pound",
                        "strMeasure2": "3 cups",
                        "strMeasure3": "",
                        "strSource": "https://example.com/arrabiata",
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    with session_factory() as session, httpx.Client(transport=transport) as http_client:
        service = ThemealdbRecipeService(
            http_client=http_client,
            base_url="https://www.themealdb.com/api/json/v1",
            api_key="1",
            cache=PersistentProviderCache(session),
        )

        first_result = service.search_by_name("Arrabiata", limit=5)
        second_result = service.search_by_name("Arrabiata", limit=5)

    assert calls == 1
    assert first_result == second_result
    assert first_result[0]["external_id"] == "52772"
    assert first_result[0]["instructions"] == [
        "Bring water to a boil.",
        "Simmer the sauce and combine with pasta.",
    ]
    assert first_result[0]["ingredients"][0]["display_name"] == "Penne Rigate"


def test_themealdb_recipe_service_caches_first_letter_catalog_results(
    client: TestClient,
) -> None:
    calls = 0
    session_factory = client.app.state.session_factory

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.url.path == "/api/json/v1/1/search.php"
        assert request.url.params["f"] == "a"
        return httpx.Response(
            200,
            json={
                "meals": [
                    {
                        "idMeal": "52772",
                        "strMeal": "Arrabiata",
                        "strCategory": "Vegetarian",
                        "strArea": "Italian",
                        "strInstructions": "Bring water to a boil.",
                        "strMealThumb": "https://www.themealdb.com/images/media/meals/x.jpg",
                        "strTags": "Pasta",
                        "strIngredient1": "penne rigate",
                        "strMeasure1": "1 pound",
                        "strSource": "https://example.com/arrabiata",
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    with session_factory() as session, httpx.Client(transport=transport) as http_client:
        service = ThemealdbRecipeService(
            http_client=http_client,
            base_url="https://www.themealdb.com/api/json/v1",
            api_key="1",
            cache=PersistentProviderCache(session),
        )

        first_result = service.list_by_first_letter("a", limit=5)
        second_result = service.list_by_first_letter("a", limit=5)

    assert calls == 1
    assert first_result == second_result
    assert first_result[0]["name"] == "Arrabiata"


def test_themealdb_recipe_service_rejects_invalid_json_as_provider_error(
    client: TestClient,
) -> None:
    session_factory = client.app.state.session_factory

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"{not-json")

    transport = httpx.MockTransport(handler)
    with session_factory() as session, httpx.Client(transport=transport) as http_client:
        service = ThemealdbRecipeService(
            http_client=http_client,
            base_url="https://www.themealdb.com/api/json/v1",
            api_key="1",
            cache=PersistentProviderCache(session),
        )

        try:
            service.search_by_name("Arrabiata", limit=5)
        except ProviderServiceError as exc:
            assert "invalid JSON" in str(exc)
        else:  # pragma: no cover - assertion branch
            raise AssertionError("Expected ProviderServiceError")


def test_themealdb_catalog_bootstrap_imports_once_into_saved_recipes(
    client: TestClient,
) -> None:
    fake_service = FakeThemealdbRecipeService()
    session_factory = client.app.state.session_factory

    with session_factory() as session:
        first_import_count = import_themealdb_catalog(
            session,
            fake_service,
            target_count=2,
            first_letters=("a",),
        )
        session.commit()

    catalog_response = client.get("/api/v1/recipes")

    with session_factory() as session:
        second_import_count = import_themealdb_catalog(
            session,
            fake_service,
            target_count=2,
            first_letters=("a",),
        )
        session.commit()

    assert catalog_response.status_code == 200
    catalog_names = {recipe["name"] for recipe in catalog_response.json()["data"]}
    assert first_import_count == 2
    assert second_import_count == 0
    assert fake_service.search_calls == 1
    assert {"Arrabiata", "Lasagne"}.issubset(catalog_names)


def test_themealdb_catalog_bootstrap_rolls_back_with_caller_transaction(
    client: TestClient,
) -> None:
    fake_service = FakeThemealdbRecipeService()
    session_factory = client.app.state.session_factory

    try:
        with session_factory() as session:
            import_themealdb_catalog(
                session,
                fake_service,
                target_count=2,
                first_letters=("a",),
            )
            raise RuntimeError("abort")
    except RuntimeError:
        pass

    catalog_response = client.get("/api/v1/recipes")

    assert catalog_response.status_code == 200
    catalog_names = {recipe["name"] for recipe in catalog_response.json()["data"]}
    assert "Arrabiata" not in catalog_names
    assert "Lasagne" not in catalog_names
