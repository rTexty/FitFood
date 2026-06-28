from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import CanonicalProduct, ProductAlias
from app.services.normalization import normalize_name


@dataclass(frozen=True)
class ProductTaxonomySeed:
    display_name: str
    normalized_name: str
    category: str
    default_location: str
    shelf_life_days: int
    expiration_confidence: float
    aliases: tuple[str, ...]


@dataclass(frozen=True)
class EnrichedProduct:
    display_name: str
    normalized_name: str
    category: str
    location: str
    expiration_date: date
    expiration_date_source: str
    expiration_confidence: float
    taxonomy_source: str


PRODUCT_TAXONOMY_SEEDS: tuple[ProductTaxonomySeed, ...] = (
    ProductTaxonomySeed(
        "Помидоры",
        "помидоры",
        "Produce",
        "fridge",
        5,
        0.78,
        (
            "помидор",
            "помидоры",
            "томат",
            "томаты",
            "кавказские помидоры",
            "бакинские помидоры",
            "азербайджанские помидоры",
            "tomato",
            "tomatoes",
        ),
    ),
    ProductTaxonomySeed(
        "Greek Yogurt",
        "greek yogurt",
        "Dairy",
        "fridge",
        10,
        0.82,
        ("greek yogurt", "йогурт греческий", "греческий йогурт"),
    ),
    ProductTaxonomySeed("Milk", "milk", "Dairy", "fridge", 7, 0.78, ("milk", "молоко")),
    ProductTaxonomySeed("Eggs", "eggs", "Dairy", "fridge", 21, 0.78, ("eggs", "яйца")),
    ProductTaxonomySeed(
        "Bananas",
        "bananas",
        "Produce",
        "pantry",
        5,
        0.72,
        ("banana", "bananas", "банан", "бананы"),
    ),
    ProductTaxonomySeed(
        "Chicken Breast",
        "chicken breast",
        "Meat",
        "fridge",
        3,
        0.82,
        ("chicken breast", "куриная грудка"),
    ),
    ProductTaxonomySeed(
        "Salmon Fillet",
        "salmon fillet",
        "Fish",
        "fridge",
        2,
        0.82,
        ("salmon", "salmon fillet", "лосось", "филе лосося"),
    ),
    ProductTaxonomySeed(
        "Broccoli",
        "broccoli",
        "Produce",
        "fridge",
        5,
        0.75,
        ("broccoli", "брокколи"),
    ),
    ProductTaxonomySeed(
        "Avocado",
        "avocado",
        "Produce",
        "pantry",
        4,
        0.70,
        ("avocado", "авокадо"),
    ),
    ProductTaxonomySeed(
        "Brown Rice",
        "brown rice",
        "Grains",
        "pantry",
        180,
        0.75,
        ("brown rice", "рис бурый", "бурый рис"),
    ),
    ProductTaxonomySeed(
        "Rolled Oats",
        "rolled oats",
        "Grains",
        "pantry",
        180,
        0.75,
        ("rolled oats", "овсянка", "овсяные хлопья"),
    ),
    ProductTaxonomySeed(
        "Pasta",
        "pasta",
        "Grains",
        "pantry",
        365,
        0.70,
        ("pasta", "паста", "макароны"),
    ),
)

MARKETING_WORDS = {
    "кавказские",
    "кавказский",
    "азербайджанские",
    "азербайджанский",
    "узбекские",
    "узбекский",
    "бакинские",
    "бакинский",
    "фермерские",
    "фермерский",
    "свежие",
    "свежий",
    "отборные",
    "отборный",
    "розовые",
    "розовый",
    "грунтовые",
    "грунтовый",
    "домашние",
    "домашний",
    "organic",
    "fresh",
    "selected",
    "premium",
}


def seed_product_taxonomy(session: Session) -> None:
    existing_products = {
        product.normalized_name: product
        for product in session.scalars(select(CanonicalProduct)).all()
    }

    for seed in PRODUCT_TAXONOMY_SEEDS:
        product = existing_products.get(seed.normalized_name)
        if product is None:
            product = CanonicalProduct(
                display_name=seed.display_name,
                normalized_name=seed.normalized_name,
                category=seed.category,
                default_location=seed.default_location,
                shelf_life_days=seed.shelf_life_days,
                expiration_confidence=seed.expiration_confidence,
                is_active=True,
            )
            session.add(product)
            session.flush()
            existing_products[seed.normalized_name] = product

        existing_aliases = {
            alias.normalized_alias
            for alias in session.scalars(
                select(ProductAlias).where(ProductAlias.canonical_product_id == product.id)
            ).all()
        }
        for alias in seed.aliases:
            normalized_alias = normalize_name(alias)
            if normalized_alias in existing_aliases:
                continue
            session.add(
                ProductAlias(
                    canonical_product_id=product.id,
                    alias=alias,
                    normalized_alias=normalized_alias,
                    locale=_alias_locale(alias),
                    source="seed",
                    confidence=seed.expiration_confidence,
                )
            )


def enrich_product_name(
    display_name: str,
    *,
    purchase_date: date,
    category: str | None = None,
    location: str | None = None,
    session: Session | None = None,
) -> EnrichedProduct:
    product = _find_canonical_product(session, display_name) if session is not None else None
    if product is None:
        product = _fallback_product(display_name)
        taxonomy_source = "fallback"
    else:
        taxonomy_source = "database"

    if product is None:
        normalized_display_name = " ".join(display_name.strip().split())
        fallback_category = _clean_text(category) or "Other"
        fallback_location = _clean_text(location) or _location_for_category(fallback_category)
        shelf_life_days = _shelf_life_for_category(fallback_category)
        return EnrichedProduct(
            display_name=normalized_display_name,
            normalized_name=normalize_name(normalized_display_name),
            category=fallback_category,
            location=fallback_location,
            expiration_date=purchase_date + timedelta(days=shelf_life_days),
            expiration_date_source="estimated",
            expiration_confidence=0.45,
            taxonomy_source="fallback",
        )

    return EnrichedProduct(
        display_name=product.display_name,
        normalized_name=product.normalized_name,
        category=product.category,
        location=product.default_location,
        expiration_date=purchase_date + timedelta(days=product.shelf_life_days),
        expiration_date_source="estimated",
        expiration_confidence=product.expiration_confidence,
        taxonomy_source=taxonomy_source,
    )


def _find_canonical_product(session: Session, display_name: str) -> CanonicalProduct | None:
    candidates = _lookup_candidates(display_name)

    alias = session.scalar(
        select(ProductAlias)
        .options(selectinload(ProductAlias.canonical_product))
        .where(ProductAlias.normalized_alias.in_(candidates))
        .order_by(ProductAlias.confidence.desc(), ProductAlias.id.asc())
        .limit(1)
    )
    if alias is not None and alias.canonical_product.is_active:
        return alias.canonical_product

    return session.scalar(
        select(CanonicalProduct)
        .where(
            CanonicalProduct.normalized_name.in_(candidates),
            CanonicalProduct.is_active.is_(True),
        )
        .order_by(CanonicalProduct.id.asc())
        .limit(1)
    )


def _fallback_product(display_name: str) -> CanonicalProduct | None:
    candidates = _lookup_candidates(display_name)
    for seed in PRODUCT_TAXONOMY_SEEDS:
        seed_aliases = {normalize_name(alias) for alias in seed.aliases}
        if seed.normalized_name in candidates or seed_aliases.intersection(candidates):
            return CanonicalProduct(
                display_name=seed.display_name,
                normalized_name=seed.normalized_name,
                category=seed.category,
                default_location=seed.default_location,
                shelf_life_days=seed.shelf_life_days,
                expiration_confidence=seed.expiration_confidence,
                is_active=True,
            )
    return None


def _lookup_candidates(display_name: str) -> set[str]:
    normalized_display_name = normalize_name(display_name)
    return {
        normalized_display_name,
        _without_marketing_words(normalized_display_name),
    }


def _without_marketing_words(value: str) -> str:
    words = [word for word in value.split() if word not in MARKETING_WORDS]
    return " ".join(words)


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.strip().split())
    return cleaned or None


def _location_for_category(category: str) -> str:
    normalized_category = normalize_name(category)
    if normalized_category in {"dairy", "meat", "fish", "produce"}:
        return "fridge"
    return "pantry"


def _shelf_life_for_category(category: str) -> int:
    normalized_category = normalize_name(category)
    if normalized_category == "dairy":
        return 7
    if normalized_category == "meat":
        return 3
    if normalized_category == "fish":
        return 2
    if normalized_category == "produce":
        return 5
    if normalized_category == "grains":
        return 180
    return 14


def _alias_locale(alias: str) -> str:
    return "ru" if any("а" <= char.lower() <= "я" or char == "ё" for char in alias) else "en"
