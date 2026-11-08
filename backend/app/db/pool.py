"""asyncpg pool for Tiger Data (TimescaleDB)."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg

from app.core.config import settings

_SCHEMA_PATH = Path(__file__).resolve().parents[2] / "db" / "init" / "001_schema.sql"
_pool: asyncpg.Pool | None = None


def prepare_dsn(url: str) -> tuple[str, dict]:
    """Turn a libpq URL into an asyncpg DSN plus connect kwargs.

    asyncpg rejects ``sslmode`` as a keyword, which Tiger Cloud appends to the URL.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url.removeprefix("postgres://")
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    sslmode = query.pop("sslmode", None)
    dsn = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    kwargs: dict = {}
    if sslmode == "disable":
        kwargs["ssl"] = False
    elif sslmode:
        kwargs["ssl"] = sslmode
    return dsn, kwargs


async def init_db() -> None:
    global _pool
    dsn, kwargs = prepare_dsn(settings.database_url)
    _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=10, **kwargs)
    await apply_schema()


async def close_db() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")
    return _pool


async def ping() -> None:
    async with get_pool().acquire() as conn:
        await conn.execute("SELECT 1")


async def apply_schema() -> None:
    sql = _SCHEMA_PATH.read_text(encoding="utf-8")
    async with get_pool().acquire() as conn:
        await conn.execute(sql)
