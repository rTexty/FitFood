from __future__ import annotations

import os
from dataclasses import dataclass, field


LOCAL_VITE_ORIGINS = (
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
)


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _default_database_url() -> str:
    return os.getenv("FITFOOD_DATABASE_URL", "sqlite:///./fitfood.db")


def _normalize_environment(value: str) -> str:
    normalized_value = value.strip().lower()
    return normalized_value or "development"


def _parse_cors_origins(raw_value: str | None) -> tuple[str, ...]:
    if raw_value is None:
        return ()

    origins = tuple(origin.strip() for origin in raw_value.split(",") if origin.strip())
    return origins


def _parse_letter_list(raw_value: str | None) -> tuple[str, ...]:
    if raw_value is None:
        return ()

    letters: list[str] = []
    seen: set[str] = set()
    for item in raw_value.split(","):
        letter = item.strip().lower()[:1]
        if not letter or letter in seen:
            continue
        seen.add(letter)
        letters.append(letter)
    return tuple(letters)


def _env_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        return int(raw_value)
    except ValueError:
        return default


def _default_llm_provider() -> str:
    configured_provider = os.getenv("FITFOOD_LLM_PROVIDER")
    if configured_provider:
        return configured_provider
    if os.getenv("FITFOOD_OPENROUTER_API_KEY") and not os.getenv("FITFOOD_MINIMAX_API_KEY"):
        return "openrouter"
    return "minimax"


def _normalize_llm_provider(value: str) -> str:
    normalized_value = value.strip().lower()
    return normalized_value if normalized_value in {"minimax", "openrouter"} else "minimax"


@dataclass(frozen=True, slots=True)
class Settings:
    environment: str = field(default_factory=lambda: os.getenv("FITFOOD_ENV", "development"))
    database_url: str = field(default_factory=_default_database_url)
    seed_demo_data: bool | None = None
    demo_user_enabled: bool | None = None
    cors_origins: tuple[str, ...] | None = None
    open_food_facts_base_url: str = field(
        default_factory=lambda: os.getenv(
            "FITFOOD_OPEN_FOOD_FACTS_BASE_URL",
            "https://world.openfoodfacts.org",
        )
    )
    open_food_facts_user_agent: str = field(
        default_factory=lambda: os.getenv(
            "FITFOOD_OFF_USER_AGENT",
            "FitFood/0.1 (support@fitfood.app)",
        )
    )
    usda_base_url: str = field(
        default_factory=lambda: os.getenv(
            "FITFOOD_USDA_BASE_URL",
            "https://api.nal.usda.gov",
        )
    )
    usda_api_key: str = field(
        default_factory=lambda: os.getenv("FITFOOD_USDA_API_KEY", "DEMO_KEY")
    )
    themealdb_base_url: str = field(
        default_factory=lambda: os.getenv(
            "FITFOOD_THEMEALDB_BASE_URL",
            "https://www.themealdb.com/api/json/v1",
        )
    )
    themealdb_api_key: str = field(
        default_factory=lambda: os.getenv("FITFOOD_THEMEALDB_API_KEY", "1")
    )
    themealdb_catalog_sync_enabled: bool | None = None
    themealdb_catalog_sync_limit: int = field(
        default_factory=lambda: _env_int("FITFOOD_THEMEALDB_CATALOG_SYNC_LIMIT", 1000)
    )
    themealdb_catalog_sync_letters: tuple[str, ...] | None = None
    minimax_base_url: str = field(
        default_factory=lambda: os.getenv(
            "FITFOOD_MINIMAX_BASE_URL",
            "https://api.minimax.io",
        )
    )
    minimax_api_key: str = field(default_factory=lambda: os.getenv("FITFOOD_MINIMAX_API_KEY", ""))
    minimax_model: str = field(
        default_factory=lambda: os.getenv("FITFOOD_MINIMAX_MODEL", "MiniMax-M3")
    )
    openrouter_base_url: str = field(
        default_factory=lambda: os.getenv(
            "FITFOOD_OPENROUTER_BASE_URL",
            "https://openrouter.ai/api/v1",
        )
    )
    openrouter_api_key: str = field(
        default_factory=lambda: os.getenv("FITFOOD_OPENROUTER_API_KEY", "")
    )
    openrouter_model: str = field(
        default_factory=lambda: os.getenv(
            "FITFOOD_OPENROUTER_MODEL",
            "google/gemma-4-31b-it:free",
        )
    )
    openrouter_http_referer: str = field(
        default_factory=lambda: os.getenv("FITFOOD_OPENROUTER_HTTP_REFERER", "")
    )
    openrouter_app_title: str = field(
        default_factory=lambda: os.getenv("FITFOOD_OPENROUTER_APP_TITLE", "FitFood")
    )
    llm_provider: str = field(default_factory=_default_llm_provider)
    llm_enabled: bool | None = None
    llm_daily_request_budget: int = field(
        default_factory=lambda: int(os.getenv("FITFOOD_LLM_DAILY_REQUEST_BUDGET", "100"))
    )

    def __post_init__(self) -> None:
        normalized_environment = _normalize_environment(self.environment)
        object.__setattr__(self, "environment", normalized_environment)
        object.__setattr__(self, "llm_provider", _normalize_llm_provider(self.llm_provider))

        if self.seed_demo_data is None:
            default_seed_demo_data = normalized_environment != "production"
            object.__setattr__(
                self,
                "seed_demo_data",
                _env_flag("FITFOOD_SEED_DEMO_DATA", default_seed_demo_data),
            )

        if self.demo_user_enabled is None:
            default_demo_user_enabled = normalized_environment != "production"
            object.__setattr__(
                self,
                "demo_user_enabled",
                _env_flag("FITFOOD_DEMO_USER_ENABLED", default_demo_user_enabled),
            )

        if self.cors_origins is None:
            configured_origins = _parse_cors_origins(os.getenv("FITFOOD_CORS_ORIGINS"))
            if configured_origins:
                object.__setattr__(self, "cors_origins", configured_origins)
            elif normalized_environment in {"development", "test"}:
                object.__setattr__(self, "cors_origins", LOCAL_VITE_ORIGINS)
            else:
                object.__setattr__(self, "cors_origins", ())

        if self.themealdb_catalog_sync_enabled is None:
            object.__setattr__(
                self,
                "themealdb_catalog_sync_enabled",
                _env_flag("FITFOOD_THEMEALDB_CATALOG_SYNC_ENABLED", False),
            )

        if self.themealdb_catalog_sync_letters is None:
            configured_letters = _parse_letter_list(
                os.getenv("FITFOOD_THEMEALDB_CATALOG_SYNC_LETTERS")
            )
            object.__setattr__(
                self,
                "themealdb_catalog_sync_letters",
                configured_letters or tuple("abcdefghijklmnopqrstuvwxyz"),
            )

        if self.llm_enabled is None:
            selected_api_key = (
                self.openrouter_api_key
                if self.llm_provider == "openrouter"
                else self.minimax_api_key
            )
            object.__setattr__(
                self,
                "llm_enabled",
                _env_flag("FITFOOD_LLM_ENABLED", bool(selected_api_key)),
            )
