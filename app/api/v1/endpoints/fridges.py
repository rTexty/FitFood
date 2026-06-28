from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.deps import get_session
from app.api.v1.pagination import build_list_meta
from app.db.models import Fridge


router = APIRouter()


@router.get("/fridges")
def list_fridges(session: Session = Depends(get_session)) -> dict[str, object]:
    fridges = session.scalars(
        select(Fridge).order_by(Fridge.is_primary.desc(), Fridge.id.asc())
    ).all()
    data = [
        {
            "id": fridge.id,
            "name": fridge.name,
            "kind": fridge.kind,
            "description": fridge.description,
            "is_primary": fridge.is_primary,
        }
        for fridge in fridges
    ]
    return {
        "data": data,
        "meta": build_list_meta(len(data)),
    }
