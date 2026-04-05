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


# ─── AI Strategy helpers ──────────────────────────────────────────

AI_STRATEGY_KEY_RESULT = "screener:ai-strategy:result"
AI_STRATEGY_KEY_STATUS = "screener:ai-strategy:status"


def get_ai_strategy_result() -> dict | None:
    """Returns the last AI strategy result, or None if not yet available."""
    raw = _get_redis().get(AI_STRATEGY_KEY_RESULT)
    if raw is None:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


def set_ai_strategy_result(data: dict) -> None:
    _get_redis().setex(AI_STRATEGY_KEY_RESULT, TTL, json.dumps(data, ensure_ascii=False))


def get_ai_strategy_status() -> dict:
    """Returns status dict; defaults to {"status": "idle"} if key missing."""
    raw = _get_redis().get(AI_STRATEGY_KEY_STATUS)
    if raw is None:
        return {"status": "idle"}
    return json.loads(raw) if isinstance(raw, str) else raw


def set_ai_strategy_status(status: str, **extra) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload: dict = {"status": status, "updated_at": now, **extra}
    if status == "running":
        payload["started_at"] = now
    _get_redis().setex(AI_STRATEGY_KEY_STATUS, TTL, json.dumps(payload))


# ─── Options v2: OI snapshot + flow history ───────────────────────

OPTIONS_OI_SNAP_KEY   = "screener:options:oi_snapshot"
OPTIONS_FLOW_HIST_KEY = "screener:options:flow_history"


def get_options_oi_snapshot() -> dict:
    """Returns { ticker → { 'strike|expiry|type' → oi } } from previous scan."""
    raw = _get_redis().get(OPTIONS_OI_SNAP_KEY)
    if raw is None:
        return {}
    return json.loads(raw) if isinstance(raw, str) else raw


def set_options_oi_snapshot(data: dict) -> None:
    _get_redis().setex(OPTIONS_OI_SNAP_KEY, TTL, json.dumps(data))


def get_options_flow_history() -> dict:
    """Returns { ticker → [{ date, net_call_premium }, ...] } (last 5 trading days)."""
    raw = _get_redis().get(OPTIONS_FLOW_HIST_KEY)
    if raw is None:
        return {}
    return json.loads(raw) if isinstance(raw, str) else raw


def set_options_flow_history(data: dict) -> None:
    _get_redis().setex(OPTIONS_FLOW_HIST_KEY, 7 * 24 * 3600, json.dumps(data))


# ─── Options daily snapshots (for backtesting) ────────────────────
# Key pattern : screener:options:snapshot:{YYYY-MM-DD}
# Index key   : screener:options:snapshot:index  (sorted list of dates)
# TTL         : 90 days per snapshot, 180 days for index

SNAPSHOT_TTL       = 90  * 24 * 3600   # 90 days
SNAPSHOT_INDEX_TTL = 180 * 24 * 3600   # 180 days
SNAPSHOT_INDEX_KEY = "screener:options:snapshot:index"


def _snapshot_key(date_str: str) -> str:
    return f"screener:options:snapshot:{date_str}"


def set_options_daily_snapshot(date_str: str, entries: list) -> None:
    """
    Persist a lightweight daily snapshot for backtesting.
    entries: list of { ticker, price, stars, overall, sm_direction,
                        sm_call_premium, sm_put_premium }
    """
    r = _get_redis()
    payload = {"date": date_str, "entries": entries}
    r.setex(_snapshot_key(date_str), SNAPSHOT_TTL, json.dumps(payload))

    # Update sorted index (list of date strings, deduped)
    raw = r.get(SNAPSHOT_INDEX_KEY)
    dates: list = json.loads(raw) if isinstance(raw, str) and raw else []
    if date_str not in dates:
        dates.append(date_str)
        dates.sort()
    r.setex(SNAPSHOT_INDEX_KEY, SNAPSHOT_INDEX_TTL, json.dumps(dates))


def get_options_snapshot_index() -> list:
    """Returns sorted list of available snapshot date strings."""
    raw = _get_redis().get(SNAPSHOT_INDEX_KEY)
    if not raw:
        return []
    return json.loads(raw) if isinstance(raw, str) else raw


def get_options_daily_snapshot(date_str: str) -> dict | None:
    """Returns the snapshot for a specific date, or None if not found."""
    raw = _get_redis().get(_snapshot_key(date_str))
    if raw is None:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


# ─── Generic snapshot helper ──────────────────────────────────────

def _set_snapshot(prefix: str, date_str: str, entries: list) -> None:
    """Generic: store a daily snapshot and update its index."""
    r = _get_redis()
    key       = f"{prefix}:{date_str}"
    index_key = f"{prefix}:index"
    r.setex(key, SNAPSHOT_TTL, json.dumps({"date": date_str, "entries": entries}))
    raw   = r.get(index_key)
    dates: list = json.loads(raw) if isinstance(raw, str) and raw else []
    if date_str not in dates:
        dates.append(date_str)
        dates.sort()
    r.setex(index_key, SNAPSHOT_INDEX_TTL, json.dumps(dates))


def _get_snapshot(prefix: str, date_str: str) -> dict | None:
    raw = _get_redis().get(f"{prefix}:{date_str}")
    if raw is None:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


def _get_snapshot_index(prefix: str) -> list:
    raw = _get_redis().get(f"{prefix}:index")
    if not raw:
        return []
    return json.loads(raw) if isinstance(raw, str) else raw


# ─── Divergence daily snapshots ───────────────────────────────────

DIV_SNAP_PREFIX = "screener:divergence:snapshot"


def set_divergence_daily_snapshot(date_str: str, entries: list) -> None:
    """entries: list of { ticker, price, pct_change, vol_ratio, rsi_latest, triggered }"""
    _set_snapshot(DIV_SNAP_PREFIX, date_str, entries)


def get_divergence_daily_snapshot(date_str: str) -> dict | None:
    return _get_snapshot(DIV_SNAP_PREFIX, date_str)


def get_divergence_snapshot_index() -> list:
    return _get_snapshot_index(DIV_SNAP_PREFIX)


# ─── Volume surge daily snapshots ─────────────────────────────────

VOL_SNAP_PREFIX = "screener:volume:snapshot"


def set_volume_daily_snapshot(date_str: str, entries: list) -> None:
    """entries: list of { ticker, price, vol_ratio, vol_ratio2, ytd_return }"""
    _set_snapshot(VOL_SNAP_PREFIX, date_str, entries)


def get_volume_daily_snapshot(date_str: str) -> dict | None:
    return _get_snapshot(VOL_SNAP_PREFIX, date_str)


def get_volume_snapshot_index() -> list:
    return _get_snapshot_index(VOL_SNAP_PREFIX)
