from datetime import date
from typing import Optional

from fastapi import FastAPI
from sqlalchemy import Column, Date, Float, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


DATABASE_URL = "sqlite:///./fitfood.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(bind=engine)

Base = declarative_base()

app = FastAPI(title="FitFood MVP v1 API")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    quantity = Column(Float, default=1)
    unit = Column(String, default="pcs")
    purchase_date = Column(Date, nullable=False)
    expiration_date = Column(Date, nullable=True)


Base.metadata.create_all(bind=engine)


@app.get("/health")
def health_check():
    return {"status": "ok"}