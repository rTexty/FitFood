from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import UserAccount


DEMO_USER_ID = "user-demo"


def get_or_create_demo_user(session: Session) -> UserAccount:
    existing_user = session.get(UserAccount, DEMO_USER_ID)
    if existing_user is not None:
        return existing_user

    demo_user = UserAccount(
        id=DEMO_USER_ID,
        email="alex@fitfood.app",
        display_name="Alex Green",
        locale="en-US",
        timezone="Europe/Moscow",
    )
    session.add(demo_user)
    session.commit()
    session.refresh(demo_user)
    return demo_user
