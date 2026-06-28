from __future__ import annotations

import copy
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AiArtifact
from app.services.cache.provider_cache import JsonContainer, JsonValue, build_cache_key, stable_hash


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


class AiArtifactStore:
    def __init__(
        self,
        session: Session,
        *,
        provider: str = "minimax",
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._session = session
        self._provider = provider
        self._now = now or _utc_now

    def get_output(
        self,
        *,
        task_type: str,
        model: str,
        input_payload: JsonValue,
        prompt_version: str = "v1",
    ) -> JsonContainer | None:
        artifact = self._get_artifact(
            task_type=task_type,
            model=model,
            input_payload=input_payload,
            prompt_version=prompt_version,
        )
        if artifact is None or artifact.status != "succeeded":
            return None
        return copy.deepcopy(artifact.output_json)

    def get_or_create_output(
        self,
        *,
        task_type: str,
        model: str,
        input_payload: JsonValue,
        producer: Callable[[], JsonContainer],
        prompt_version: str = "v1",
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> JsonContainer:
        cache_key = self._build_artifact_key(
            task_type=task_type,
            model=model,
            input_payload=input_payload,
            prompt_version=prompt_version,
        )
        artifact = self._session.scalar(
            select(AiArtifact).where(AiArtifact.cache_key == cache_key)
        )
        if artifact is not None and artifact.status == "succeeded":
            return copy.deepcopy(artifact.output_json)

        try:
            output_json = producer()
        except Exception as exc:
            self._replace_artifact(
                artifact=artifact,
                task_type=task_type,
                model=model,
                input_payload=input_payload,
                prompt_version=prompt_version,
                cache_key=cache_key,
                output_json={},
                status="failed",
                error_code=type(exc).__name__,
                input_tokens=input_tokens,
                output_tokens=0,
            )
            raise

        self._replace_artifact(
            artifact=artifact,
            task_type=task_type,
            model=model,
            input_payload=input_payload,
            prompt_version=prompt_version,
            cache_key=cache_key,
            output_json=output_json,
            status="succeeded",
            error_code=None,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        return copy.deepcopy(output_json)

    def store_output(
        self,
        *,
        task_type: str,
        model: str,
        input_payload: JsonValue,
        output_json: JsonContainer,
        prompt_version: str = "v1",
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> JsonContainer:
        cache_key = self._build_artifact_key(
            task_type=task_type,
            model=model,
            input_payload=input_payload,
            prompt_version=prompt_version,
        )
        existing_artifact = self._session.scalar(
            select(AiArtifact).where(AiArtifact.cache_key == cache_key)
        )
        self._replace_artifact(
            artifact=existing_artifact,
            task_type=task_type,
            model=model,
            input_payload=input_payload,
            prompt_version=prompt_version,
            cache_key=cache_key,
            output_json=output_json,
            status="succeeded",
            error_code=None,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        return copy.deepcopy(output_json)

    def _get_artifact(
        self,
        *,
        task_type: str,
        model: str,
        input_payload: JsonValue,
        prompt_version: str,
    ) -> AiArtifact | None:
        cache_key = self._build_artifact_key(
            task_type=task_type,
            model=model,
            input_payload=input_payload,
            prompt_version=prompt_version,
        )
        return self._session.scalar(
            select(AiArtifact).where(AiArtifact.cache_key == cache_key)
        )

    def _build_artifact_key(
        self,
        *,
        task_type: str,
        model: str,
        input_payload: JsonValue,
        prompt_version: str,
    ) -> str:
        return build_cache_key(
            provider=self._provider,
            resource_type=f"llm:{task_type}",
            request_payload={
                "input": input_payload,
                "model": model,
                "prompt_version": prompt_version,
            },
        )

    def _replace_artifact(
        self,
        *,
        artifact: AiArtifact | None,
        task_type: str,
        model: str,
        input_payload: JsonValue,
        prompt_version: str,
        cache_key: str,
        output_json: JsonContainer,
        status: str,
        error_code: str | None,
        input_tokens: int,
        output_tokens: int,
    ) -> None:
        if artifact is not None:
            self._session.delete(artifact)
            self._session.flush()

        now = _normalize_datetime(self._now())
        self._session.add(
            AiArtifact(
                provider=self._provider,
                model=model,
                task_type=task_type,
                cache_key=cache_key,
                prompt_hash=stable_hash({"task_type": task_type, "version": prompt_version}),
                input_hash=stable_hash(input_payload),
                request_json=copy.deepcopy(_as_request_object(input_payload)),
                output_json=copy.deepcopy(output_json),
                status=status,
                error_code=error_code,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                created_at=now,
                updated_at=now,
            )
        )
        self._session.commit()


def _as_request_object(value: JsonValue) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {"value": value}
