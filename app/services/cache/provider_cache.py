from __future__ import annotations

import copy
import hashlib
import json
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any, TypeAlias

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ProviderCache


JsonValue: TypeAlias = dict[str, Any] | list[Any] | str | int | float | bool | None
JsonContainer: TypeAlias = dict[str, Any] | list[Any]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def canonical_json(value: JsonValue) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def stable_hash(value: JsonValue) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def build_cache_key(
    *,
    provider: str,
    resource_type: str,
    request_payload: JsonValue,
    version: str = "v1",
) -> str:
    request_hash = stable_hash(request_payload)
    return f"{provider}:{resource_type}:{version}:{request_hash}"


class PersistentProviderCache:
    def __init__(
        self,
        session: Session,
        *,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._session = session
        self._now = now or _utc_now

    def get_json(
        self,
        *,
        provider: str,
        resource_type: str,
        request_payload: JsonValue,
        version: str = "v1",
    ) -> JsonContainer | None:
        cache_key = build_cache_key(
            provider=provider,
            resource_type=resource_type,
            request_payload=request_payload,
            version=version,
        )
        entry = self._get_entry(cache_key)
        if entry is None or self._is_expired(entry):
            return None
        return copy.deepcopy(entry.response_json)

    def get_or_create_json(
        self,
        *,
        provider: str,
        resource_type: str,
        request_payload: JsonValue,
        ttl_seconds: int | None,
        producer: Callable[[], JsonContainer],
        version: str = "v1",
    ) -> JsonContainer:
        request_hash = stable_hash(request_payload)
        cache_key = build_cache_key(
            provider=provider,
            resource_type=resource_type,
            request_payload=request_payload,
            version=version,
        )
        entry = self._get_entry(cache_key)
        if entry is not None and not self._is_expired(entry):
            return copy.deepcopy(entry.response_json)

        response_json = producer()
        self._replace_entry(
            entry=entry,
            provider=provider,
            resource_type=resource_type,
            cache_key=cache_key,
            request_hash=request_hash,
            response_json=response_json,
            ttl_seconds=ttl_seconds,
        )
        return copy.deepcopy(response_json)

    def _get_entry(self, cache_key: str) -> ProviderCache | None:
        return self._session.scalar(
            select(ProviderCache).where(ProviderCache.cache_key == cache_key)
        )

    def _is_expired(self, entry: ProviderCache) -> bool:
        if entry.expires_at is None:
            return False
        return _normalize_datetime(entry.expires_at) <= _normalize_datetime(self._now())

    def _replace_entry(
        self,
        *,
        entry: ProviderCache | None,
        provider: str,
        resource_type: str,
        cache_key: str,
        request_hash: str,
        response_json: JsonContainer,
        ttl_seconds: int | None,
    ) -> None:
        if entry is not None:
            self._session.delete(entry)
            self._session.flush()

        now = _normalize_datetime(self._now())
        expires_at = now + timedelta(seconds=ttl_seconds) if ttl_seconds is not None else None
        self._session.add(
            ProviderCache(
                provider=provider,
                resource_type=resource_type,
                cache_key=cache_key,
                request_hash=request_hash,
                response_json=copy.deepcopy(response_json),
                expires_at=expires_at,
                created_at=now,
                updated_at=now,
            )
        )
        self._session.flush()
