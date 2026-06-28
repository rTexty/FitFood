from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="test",
        database_url=f"sqlite:///{tmp_path / 'fitfood-test.db'}",
        seed_demo_data=True,
    )


@pytest.fixture
def client(settings: Settings) -> TestClient:
    app = create_app(settings)

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def fridge_id(client: TestClient) -> int:
    response = client.get("/api/v1/fridges")
    assert response.status_code == 200

    payload = response.json()
    assert payload["data"]

    return payload["data"][0]["id"]
