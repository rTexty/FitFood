from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import Engine

from app.api.v1.router import api_router
from app.core.config import Settings
from app.db.base import Base
from app.db.migrations import ensure_runtime_schema
from app.db.session import create_engine_for_url, create_session_factory
from app.db import models  # noqa: F401
from app.db.seed import seed_core_catalogs, seed_demo_data, sync_themealdb_recipe_catalog

try:
    import fcntl
except ImportError:  # pragma: no cover - Windows fallback
    fcntl = None


@contextmanager
def _sqlite_lock(engine: Engine, suffix: str, *, blocking: bool = True) -> Iterator[bool]:
    if engine.dialect.name != "sqlite" or fcntl is None:
        yield True
        return

    database_path = engine.url.database
    if not database_path or database_path == ":memory:":
        yield True
        return

    lock_path = Path(database_path).with_suffix(f"{Path(database_path).suffix}.{suffix}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("w") as lock_file:
        lock_mode = fcntl.LOCK_EX if blocking else fcntl.LOCK_EX | fcntl.LOCK_NB
        try:
            fcntl.flock(lock_file.fileno(), lock_mode)
        except BlockingIOError:
            yield False
            return

        try:
            yield True
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def _sqlite_schema_lock(engine: Engine) -> Iterator[bool]:
    return _sqlite_lock(engine, "schema", blocking=True)


def _sqlite_catalog_sync_lock(engine: Engine) -> Iterator[bool]:
    return _sqlite_lock(engine, "catalog-sync", blocking=False)


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings()
    engine = create_engine_for_url(resolved_settings.database_url)
    session_factory = create_session_factory(engine)
    with _sqlite_schema_lock(engine):
        Base.metadata.create_all(bind=engine)
        ensure_runtime_schema(engine)
        seed_core_catalogs(session_factory)
        if resolved_settings.seed_demo_data:
            seed_demo_data(session_factory)
    with _sqlite_catalog_sync_lock(engine) as should_sync_catalog:
        if should_sync_catalog:
            sync_themealdb_recipe_catalog(session_factory, resolved_settings)

    app = FastAPI(title="FitFood API", version="0.1.0")
    app.state.settings = resolved_settings
    app.state.engine = engine
    app.state.session_factory = session_factory

    if resolved_settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(resolved_settings.cors_origins),
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Accept", "Authorization", "Content-Type"],
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": "http_error",
                    "message": str(exc.detail),
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        validation_details = jsonable_encoder(
            exc.errors(),
            custom_encoder={ValueError: str},
        )
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Request validation failed",
                    "details": validation_details,
                }
            },
        )

    app.include_router(api_router)
    return app


app = create_app()
