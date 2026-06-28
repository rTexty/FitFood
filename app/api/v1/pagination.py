from __future__ import annotations


def build_list_meta(total: int, *, page: int = 1, per_page: int | None = None) -> dict[str, int]:
    resolved_per_page = total if per_page is None else per_page
    return {
        "page": page,
        "per_page": resolved_per_page,
        "total": total,
    }
