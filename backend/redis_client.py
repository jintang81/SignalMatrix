"""
Upstash Redis wrapper for screener caching.

Required env vars (from Upstash REST API):
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
"""

import json
from datetime import datetime, timezone
from upstash_redis import Redis

KEY_RESULT = "screener:divergence:result"
KEY_STATUS = "screener:divergence:status"

VOLUME_KEY_RESULT = "screener:volume:result"
VOLUME_KEY_STATUS = "screener:volume:status"

TTL = 48 * 3600  # 48 hours

_redis: Redis | None = None


def _get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_env()
    return _redis


def get_result() -> dict | None:
    """Returns the last scan result, or None if not yet available."""
    raw = _get_redis().get(KEY_RESULT)
    if raw is None:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


def set_result(data: dict) -> None:
    _get_redis().setex(KEY_RESULT, TTL, json.dumps(data, ensure_ascii=False))


def get_status() -> dict:
    """Returns status dict; defaults to {"status": "idle"} if key missing."""
    raw = _get_redis().get(KEY_STATUS)
    if raw is None:
        return {"status": "idle"}
    return json.loads(raw) if isinstance(raw, str) else raw


def set_status(status: str, **extra) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload: dict = {"status": status, "updated_at": now, **extra}
    if status == "running":
        payload["started_at"] = now
    _get_redis().setex(KEY_STATUS, TTL, json.dumps(payload))


# ─── Volume Surge helpers ─────────────────────────────────────────

def get_volume_result() -> dict | None:
    """Returns the last volume scan result, or None if not yet available."""
    raw = _get_redis().get(VOLUME_KEY_RESULT)
    if raw is None:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


def set_volume_result(data: dict) -> None:
    _get_redis().setex(VOLUME_KEY_RESULT, TTL, json.dumps(data, ensure_ascii=False))


def get_volume_status() -> dict:
    """Returns status dict; defaults to {"status": "idle"} if key missing."""
    raw = _get_redis().get(VOLUME_KEY_STATUS)
    if raw is None:
        return {"status": "idle"}
    return json.loads(raw) if isinstance(raw, str) else raw


def set_volume_status(status: str, **extra) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload: dict = {"status": status, "updated_at": now, **extra}
    if status == "running":
        payload["started_at"] = now
    _get_redis().setex(VOLUME_KEY_STATUS, TTL, json.dumps(payload))


# ─── Duck Bill helpers ────────────────────────────────────────────

DUCK_KEY_RESULT = "screener:duck:result"
DUCK_KEY_STATUS = "screener:duck:status"


def get_duck_result() -> dict | None:
    """Returns the last duck scan result, or None if not yet available."""
    raw = _get_redis().get(DUCK_KEY_RESULT)
    if raw is None:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


def set_duck_result(data: dict) -> None:
    _get_redis().setex(DUCK_KEY_RESULT, TTL, json.dumps(data, ensure_ascii=False))


def get_duck_status() -> dict:
    """Returns status dict; defaults to {"status": "idle"} if key missing."""
    raw = _get_redis().get(DUCK_KEY_STATUS)
    if raw is None:
        return {"status": "idle"}
    return json.loads(raw) if isinstance(raw, str) else raw


def set_duck_status(status: str, **extra) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload: dict = {"status": status, "updated_at": now, **extra}
    if status == "running":
        payload["started_at"] = now
    _get_redis().setex(DUCK_KEY_STATUS, TTL, json.dumps(payload))


# ─── Options Flow helpers ─────────────────────────────────────────

OPTIONS_KEY_RESULT = "screener:options:result"
OPTIONS_KEY_STATUS = "screener:options:status"


def get_options_result() -> dict | None:
    """Returns the last options scan result, or None if not yet available."""
    raw = _get_redis().get(OPTIONS_KEY_RESULT)
    if raw is None:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


def set_options_result(data: dict) -> None:
    _get_redis().setex(OPTIONS_KEY_RESULT, TTL, json.dumps(data, ensure_ascii=False))


def get_options_status() -> dict:
    """Returns status dict; defaults to {"status": "idle"} if key missing."""
    raw = _get_redis().get(OPTIONS_KEY_STATUS)
    if raw is None:
        return {"status": "idle"}
    return json.loads(raw) if isinstance(raw, str) else raw


def set_options_status(status: str, **extra) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload: dict = {"status": status, "updated_at": now, **extra}
    if status == "running":
        payload["started_at"] = now
    _get_redis().setex(OPTIONS_KEY_STATUS, TTL, json.dumps(payload))


# ─── Top Volume Surge helpers ─────────────────────────────────────

TOP_VOL_KEY_RESULT = "screener:top-volume:result"
TOP_VOL_KEY_STATUS = "screener:top-volume:status"


def get_top_vol_result() -> dict | None:
    raw = _get_redis().get(TOP_VOL_KEY_RESULT)
    if raw is None:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


def set_top_vol_result(data: dict) -> None:
    _get_redis().setex(TOP_VOL_KEY_RESULT, TTL, json.dumps(data, ensure_ascii=False))


def get_top_vol_status() -> dict:
    raw = _get_redis().get(TOP_VOL_KEY_STATUS)
    if raw is None:
        return {"status": "idle"}
    return json.loads(raw) if isinstance(raw, str) else raw


def set_top_vol_status(status: str, **extra) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload: dict = {"status": status, "updated_at": now, **extra}
    if status == "running":
        payload["started_at"] = now
    _get_redis().setex(TOP_VOL_KEY_STATUS, TTL, json.dumps(payload))


# ─── Top Divergence helpers ───────────────────────────────────────

TOP_DIV_KEY_RESULT = "screener:top-divergence:result"
TOP_DIV_KEY_STATUS = "screener:top-divergence:status"


def get_top_div_result() -> dict | None:
    """Returns the last top-divergence scan result, or None if not yet available."""
    raw = _get_redis().get(TOP_DIV_KEY_RESULT)
    if raw is None:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


def set_top_div_result(data: dict) -> None:
    _get_redis().setex(TOP_DIV_KEY_RESULT, TTL, json.dumps(data, ensure_ascii=False))


def get_top_div_status() -> dict:
    """Returns status dict; defaults to {"status": "idle"} if key missing."""
    raw = _get_redis().get(TOP_DIV_KEY_STATUS)
    if raw is None:
        return {"status": "idle"}
    return json.loads(raw) if isinstance(raw, str) else raw


def set_top_div_status(status: str, **extra) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload: dict = {"status": status, "updated_at": now, **extra}
    if status == "running":
        payload["started_at"] = now
    _get_redis().setex(TOP_DIV_KEY_STATUS, TTL, json.dumps(payload))
