from __future__ import annotations


def normalize_name(value: str) -> str:
    return " ".join(value.strip().lower().split())
