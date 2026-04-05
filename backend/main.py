"""
SignalMatrix FastAPI Backend

Endpoints:
  GET  /api/screener/divergence       — return cached bottom-divergence scan results
  GET  /api/screener/status           — check divergence scan status
  POST /api/screener/run              — trigger a divergence scan (requires X-API-Key header)

  GET  /api/screener/volume           — return cached bottom-volume-surge scan results
  GET  /api/screener/volume/status    — check volume scan status
  POST /api/screener/volume/run       — trigger a volume scan (requires X-API-Key header)

  GET  /api/screener/duck             — return cached duck-bill scan results
  GET  /api/screener/duck/status      — check duck scan status
  POST /api/screener/duck/run         — trigger a duck scan (requires X-API-Key header)

  GET  /api/screener/inverted-duck             — return cached inverted-duck-bill scan results
  GET  /api/screener/inverted-duck/status      — check inverted-duck scan status
  POST /api/screener/inverted-duck/run         — trigger an inverted-duck scan (requires X-API-Key header)

  GET  /api/screener/options          — return cached unusual-options scan results
  GET  /api/screener/options/status   — check options scan status
  POST /api/screener/options/run      — trigger an options scan (requires X-API-Key header)

Required env vars:
  API_KEY                  — protects the /run endpoints
  UPSTASH_REDIS_REST_URL   — from Upstash console
  UPSTASH_REDIS_REST_TOKEN — from Upstash console
"""

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from redis_client import (
    get_nl_fundamentals,
    get_result, get_status, set_result, set_status,
    get_volume_result, get_volume_status, set_volume_result, set_volume_status,
    get_duck_result, get_duck_status, set_duck_result, set_duck_status,
    get_options_result, get_options_status, set_options_result, set_options_status,
    get_options_snapshot_index, get_options_daily_snapshot,
    get_divergence_snapshot_index, get_divergence_daily_snapshot,
    get_volume_snapshot_index, get_volume_daily_snapshot,
    get_duck_snapshot_index, get_duck_daily_snapshot,
    get_top_div_result, get_top_div_status, set_top_div_result, set_top_div_status,
    get_top_vol_result, get_top_vol_status, set_top_vol_result, set_top_vol_status,
    get_ai_strategy_result, get_ai_strategy_status, set_ai_strategy_result, set_ai_strategy_status,
    get_ai_strategy_daily_snapshot, get_ai_strategy_snapshot_index,
    get_inverted_duck_result, get_inverted_duck_status, set_inverted_duck_result, set_inverted_duck_status,
    get_inverted_duck_snapshot_index, get_inverted_duck_daily_snapshot,
)
from screener import run_full_scan
from screener_volume import run_volume_scan
from screener_duck import run_duck_scan
from screener_options import run_options_scan
from screener_top_divergence import run_top_divergence_scan
from screener_top_volume import run_top_volume_scan
from screener_inverted_duck_bill import run_inverted_duck_scan as run_inverted_duck_scan_fn
from ai_strategy import run_ai_strategy
from screener_nl import run_nl_search, run_fundamentals_refresh

# ─── App ──────────────────────────────────────────────────────────

app = FastAPI(title="SignalMatrix API", version="1.0.0")


@app.on_event("startup")
def _reset_stale_running_statuses():
    """
    On startup, reset any 'running' statuses left over from a previous process.
    This prevents the frontend from polling forever after a Render restart/redeploy.
    """
    from redis_client import (
        get_status, set_status,
        get_volume_status, set_volume_status,
        get_duck_status, set_duck_status,
        get_options_status, set_options_status,
        get_top_div_status, set_top_div_status,
        get_top_vol_status, set_top_vol_status,
        get_ai_strategy_status, set_ai_strategy_status,
    )
    for get_fn, set_fn in [
        (get_status,           set_status),
        (get_volume_status,    set_volume_status),
        (get_duck_status,      set_duck_status),
        (get_options_status,   set_options_status),
        (get_top_div_status,   set_top_div_status),
        (get_top_vol_status,       set_top_vol_status),
        (get_ai_strategy_status,   set_ai_strategy_status),
        (get_inverted_duck_status, set_inverted_duck_status),
    ]:
        try:
            if get_fn().get("status") == "running":
                set_fn("idle")
        except Exception:
            pass


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

API_KEY           = os.environ.get("API_KEY", "")
_executor         = ThreadPoolExecutor(max_workers=1)   # one divergence scan at a time
_volume_executor  = ThreadPoolExecutor(max_workers=1)   # one volume scan at a time
_duck_executor    = ThreadPoolExecutor(max_workers=1)   # one duck scan at a time
_options_executor = ThreadPoolExecutor(max_workers=1)   # one options scan at a time
_top_div_executor = ThreadPoolExecutor(max_workers=1)   # one top-divergence scan at a time
_top_vol_executor = ThreadPoolExecutor(max_workers=1)   # one top-volume scan at a time
_ai_strategy_executor      = ThreadPoolExecutor(max_workers=1)  # one AI strategy at a time
_inverted_duck_executor    = ThreadPoolExecutor(max_workers=1)  # one inverted-duck scan at a time
_nl_executor               = ThreadPoolExecutor(max_workers=2)  # NL search + fundamentals refresh


# ─── Endpoints ────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"service": "SignalMatrix API", "status": "ok"}


@app.get("/api/screener/divergence")
def get_divergence():
    """Returns the most recent bottom-divergence scan results from Redis cache."""
    data = get_result()
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="No scan results yet. Trigger a scan first via POST /api/screener/run",
        )
    return data


@app.get("/api/screener/status")
def get_scan_status():
    """Returns current scan status: idle | running | done | error."""
    return get_status()


@app.get("/api/screener/snapshots")
def get_divergence_snapshots(date: str | None = None):
    """
    Backtesting endpoint for 底背离.
    - No params: returns index of available snapshot dates.
    - ?date=YYYY-MM-DD: returns that day's lightweight snapshot.
    """
    if date:
        snap = get_divergence_daily_snapshot(date)
        if snap is None:
            raise HTTPException(status_code=404, detail=f"No divergence snapshot for {date}")
        return snap
    return {"dates": get_divergence_snapshot_index()}


@app.post("/api/screener/run", status_code=202)
async def trigger_scan(
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None),
):
    """
    Triggers an async background scan.
    Requires X-API-Key header matching the API_KEY env var.
    Returns 202 immediately; poll /api/screener/status for progress.
    """
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    current = get_status()
    if current.get("status") == "running":
        return {"message": "scan already running", "status": current}

    set_status("running")
    background_tasks.add_task(_run_scan_task)
    return {"message": "scan started"}


# ─── Volume Surge Endpoints ───────────────────────────────────────

@app.get("/api/screener/volume")
def get_volume():
    """Returns the most recent bottom-volume-surge scan results from Redis cache."""
    data = get_volume_result()
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="No volume scan results yet. Trigger a scan first via POST /api/screener/volume/run",
        )
    return data


@app.get("/api/screener/volume/status")
def get_volume_scan_status():
    """Returns current volume scan status: idle | running | done | error."""
    return get_volume_status()


@app.get("/api/screener/volume/snapshots")
def get_volume_snapshots(date: str | None = None):
    """
    Backtesting endpoint for 底部放量.
    - No params: returns index of available snapshot dates.
    - ?date=YYYY-MM-DD: returns that day's lightweight snapshot.
    """
    if date:
        snap = get_volume_daily_snapshot(date)
        if snap is None:
            raise HTTPException(status_code=404, detail=f"No volume snapshot for {date}")
        return snap
    return {"dates": get_volume_snapshot_index()}


@app.post("/api/screener/volume/run", status_code=202)
async def trigger_volume_scan(
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None),
):
    """
    Triggers an async background volume surge scan.
    Requires X-API-Key header matching the API_KEY env var.
    Returns 202 immediately; poll /api/screener/volume/status for progress.
    """
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    current = get_volume_status()
    if current.get("status") == "running":
        return {"message": "volume scan already running", "status": current}

    set_volume_status("running")
    background_tasks.add_task(_run_volume_scan_task)
    return {"message": "volume scan started"}


# ─── Duck Bill Endpoints ──────────────────────────────────────────

@app.get("/api/screener/duck")
def get_duck():
    """Returns the most recent duck-bill scan results from Redis cache."""
    data = get_duck_result()
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="No duck scan results yet. Trigger a scan first via POST /api/screener/duck/run",
        )
    return data


@app.get("/api/screener/duck/status")
def get_duck_scan_status():
    """Returns current duck scan status: idle | running | done | error."""
    return get_duck_status()


@app.get("/api/screener/duck/snapshots")
def get_duck_snapshots(date: str | None = None):
    """
    Backtesting endpoint for 正鸭嘴.
    - No params: returns index of available snapshot dates.
    - ?date=YYYY-MM-DD: returns that day's lightweight snapshot
      { ticker, price, pct_change, vol_ratio, ma5, ma10, ma20 }
    """
    if date:
        snap = get_duck_daily_snapshot(date)
        if snap is None:
            raise HTTPException(status_code=404, detail=f"No duck snapshot for {date}")
        return snap
    return {"dates": get_duck_snapshot_index()}


@app.post("/api/screener/duck/run", status_code=202)
async def trigger_duck_scan(
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None),
):
    """
    Triggers an async background duck-bill scan.
    Requires X-API-Key header matching the API_KEY env var.
    Returns 202 immediately; poll /api/screener/duck/status for progress.
    """
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    current = get_duck_status()
    if current.get("status") == "running":
        return {"message": "duck scan already running", "status": current}

    set_duck_status("running")
    background_tasks.add_task(_run_duck_scan_task)
    return {"message": "duck scan started"}


# ─── Options Flow Endpoints ──────────────────────────────────────

@app.get("/api/screener/options")
def get_options():
    """Returns the most recent unusual-options scan results from Redis cache."""
    data = get_options_result()
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="No options scan results yet. Trigger a scan first via POST /api/screener/options/run",
        )
    return data


@app.get("/api/screener/options/status")
def get_options_scan_status():
    """Returns current options scan status: idle | running | done | error."""
    return get_options_status()


@app.get("/api/screener/options/snapshots")
def get_options_snapshots(date: str | None = None):
    """
    Backtesting endpoint.
    - No params: returns index of available snapshot dates.
    - ?date=YYYY-MM-DD: returns that day's lightweight snapshot.
    """
    if date:
        snap = get_options_daily_snapshot(date)
        if snap is None:
            raise HTTPException(status_code=404, detail=f"No snapshot for {date}")
        return snap
    return {"dates": get_options_snapshot_index()}


@app.post("/api/screener/options/run", status_code=202)
async def trigger_options_scan(
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None),
):
    """
    Triggers an async background unusual-options scan.
    Requires X-API-Key header matching the API_KEY env var.
    Returns 202 immediately; poll /api/screener/options/status for progress.
    """
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    current = get_options_status()
    if current.get("status") == "running":
        return {"message": "options scan already running", "status": current}

    set_options_status("running")
    background_tasks.add_task(_run_options_scan_task)
    return {"message": "options scan started"}


# ─── Top Divergence Endpoints ────────────────────────────────────

@app.get("/api/screener/top-divergence")
def get_top_divergence():
    """Returns the most recent top-divergence scan results from Redis cache."""
    data = get_top_div_result()
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="No top-divergence scan results yet. Trigger a scan first via POST /api/screener/top-divergence/run",
        )
    return data


@app.get("/api/screener/top-divergence/status")
def get_top_divergence_status():
    """Returns current top-divergence scan status: idle | running | done | error."""
    return get_top_div_status()


@app.post("/api/screener/top-divergence/run", status_code=202)
async def trigger_top_divergence_scan(
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None),
):
    """
    Triggers an async background top-divergence scan.
    Requires X-API-Key header matching the API_KEY env var.
    Returns 202 immediately; poll /api/screener/top-divergence/status for progress.
    """
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    current = get_top_div_status()
    if current.get("status") == "running":
        return {"message": "top-divergence scan already running", "status": current}

    set_top_div_status("running")
    background_tasks.add_task(_run_top_div_scan_task)
    return {"message": "top-divergence scan started"}


# ─── Top Volume Surge Endpoints ──────────────────────────────────

@app.get("/api/screener/top-volume")
def get_top_volume():
    """Returns the most recent top-volume-surge scan results from Redis cache."""
    data = get_top_vol_result()
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="No top-volume scan results yet. Trigger a scan first via POST /api/screener/top-volume/run",
        )
    return data


@app.get("/api/screener/top-volume/status")
def get_top_volume_status():
    """Returns current top-volume scan status: idle | running | done | error."""
    return get_top_vol_status()


@app.post("/api/screener/top-volume/run", status_code=202)
async def trigger_top_volume_scan(
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None),
):
    """
    Triggers an async background top-volume-surge scan.
    Requires X-API-Key header matching the API_KEY env var.
    Returns 202 immediately; poll /api/screener/top-volume/status for progress.
    """
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    current = get_top_vol_status()
    if current.get("status") == "running":
        return {"message": "top-volume scan already running", "status": current}

    set_top_vol_status("running")
    background_tasks.add_task(_run_top_vol_scan_task)
    return {"message": "top-volume scan started"}


# ─── AI Strategy Endpoints ───────────────────────────────────────

@app.get("/api/strategy")
def get_ai_strategy():
    """Returns the most recent AI strategy result from Redis cache."""
    data = get_ai_strategy_result()
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="No AI strategy yet. Trigger generation via POST /api/strategy/run",
        )
    return data


@app.get("/api/strategy/status")
def get_ai_strategy_status_endpoint():
    """Returns current AI strategy status: idle | running | done | error."""
    return get_ai_strategy_status()


@app.post("/api/strategy/run", status_code=202)
async def trigger_ai_strategy(
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None),
):
    """
    Triggers async AI strategy generation.
    Requires X-API-Key header. Returns 202 immediately;
    poll /api/strategy/status for completion.
    """
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    current = get_ai_strategy_status()
    if current.get("status") == "running":
        return {"message": "AI strategy already running", "status": current}

    set_ai_strategy_status("running")
    background_tasks.add_task(_run_ai_strategy_task)
    return {"message": "AI strategy generation started"}


@app.get("/api/strategy/snapshots")
def get_ai_strategy_snapshots(date: str | None = None):
    """
    Returns AI strategy snapshot index or a specific day's result.
    No date → {"dates": ["YYYY-MM-DD", ...]}
    With ?date=YYYY-MM-DD → full strategy result dict for that day
    """
    if date:
        snap = get_ai_strategy_daily_snapshot(date)
        if snap is None:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        return snap
    return {"dates": get_ai_strategy_snapshot_index()}


# ─── Inverted Duck Bill Endpoints ────────────────────────────────

@app.get("/api/screener/inverted-duck")
def get_inverted_duck():
    """Returns the most recent inverted-duck-bill scan results from Redis cache."""
    data = get_inverted_duck_result()
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="No inverted-duck scan results yet. Trigger a scan first via POST /api/screener/inverted-duck/run",
        )
    return data


@app.get("/api/screener/inverted-duck/status")
def get_inverted_duck_scan_status():
    """Returns current inverted-duck scan status: idle | running | done | error."""
    return get_inverted_duck_status()


@app.get("/api/screener/inverted-duck/snapshots")
def get_inverted_duck_snapshots(date: str | None = None):
    """
    Backtesting endpoint for 倒鸭嘴.
    - No params: returns index of available snapshot dates.
    - ?date=YYYY-MM-DD: returns that day's lightweight snapshot.
    """
    if date:
        snap = get_inverted_duck_daily_snapshot(date)
        if snap is None:
            raise HTTPException(status_code=404, detail=f"No inverted-duck snapshot for {date}")
        return snap
    return {"dates": get_inverted_duck_snapshot_index()}


@app.post("/api/screener/inverted-duck/run", status_code=202)
async def trigger_inverted_duck_scan(
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None),
):
    """
    Triggers an async background inverted-duck-bill scan.
    Requires X-API-Key header matching the API_KEY env var.
    Returns 202 immediately; poll /api/screener/inverted-duck/status for progress.
    """
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    current = get_inverted_duck_status()
    if current.get("status") == "running":
        return {"message": "inverted-duck scan already running", "status": current}

    set_inverted_duck_status("running")
    background_tasks.add_task(_run_inverted_duck_scan_task)
    return {"message": "inverted-duck scan started"}


# ─── NL Screener Endpoints ───────────────────────────────────────

from pydantic import BaseModel


class NLSearchRequest(BaseModel):
    query: str


@app.post("/api/screener/nl")
async def nl_screener(
    body: NLSearchRequest,
    x_api_key: str = Header(None),
):
    """
    Natural language stock screener.
    Calls Claude Haiku to parse the query, applies filters to the
    cached S&P 500 fundamental universe, returns up to 25 matching stocks.
    Returns 503 if the fundamentals cache is empty.
    """
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query must not be empty")
    if len(query) > 500:
        raise HTTPException(status_code=400, detail="query too long (max 500 chars)")

    cached = get_nl_fundamentals()
    if cached is None:
        raise HTTPException(
            status_code=503,
            detail="基本面数据未缓存，请稍后再试（后台将在每日 16:30 PDT 自动刷新）",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_nl_executor, run_nl_search, query)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)[:200]}")

    return result


@app.post("/api/screener/nl/refresh-fundamentals", status_code=202)
async def nl_refresh_fundamentals(
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None),
):
    """
    Triggers a background refresh of the S&P 500 fundamental data cache.
    Takes ~60-90 seconds. Required before /api/screener/nl can serve results.
    """
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    background_tasks.add_task(_run_nl_refresh_task)
    return {"message": "fundamentals refresh started"}


@app.get("/api/screener/nl/fundamentals-status")
def nl_fundamentals_status():
    """Returns cache metadata (count + cached_at) or {cached: false} if not cached."""
    cached = get_nl_fundamentals()
    if cached is None:
        return {"cached": False}
    return {
        "cached": True,
        "count": cached.get("count", 0),
        "cached_at": cached.get("cached_at", ""),
    }


# ─── Background tasks ─────────────────────────────────────────────

async def _run_scan_task() -> None:
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_executor, run_full_scan)
        set_result(result)
        set_status("done")
    except Exception as exc:
        set_status("error", error=str(exc)[:200])


async def _run_volume_scan_task() -> None:
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_volume_executor, run_volume_scan)
        set_volume_result(result)
        set_volume_status("done")
    except Exception as exc:
        set_volume_status("error", error=str(exc)[:200])


async def _run_duck_scan_task() -> None:
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_duck_executor, run_duck_scan)
        set_duck_result(result)
        set_duck_status("done")
    except Exception as exc:
        set_duck_status("error", error=str(exc)[:200])


async def _run_options_scan_task() -> None:
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_options_executor, run_options_scan)
        set_options_result(result)
        set_options_status("done")
    except Exception as exc:
        set_options_status("error", error=str(exc)[:200])


async def _run_top_div_scan_task() -> None:
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_top_div_executor, run_top_divergence_scan)
        set_top_div_result(result)
        set_top_div_status("done")
    except Exception as exc:
        set_top_div_status("error", error=str(exc)[:200])


async def _run_top_vol_scan_task() -> None:
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_top_vol_executor, run_top_volume_scan)
        set_top_vol_result(result)
        set_top_vol_status("done")
    except Exception as exc:
        set_top_vol_status("error", error=str(exc)[:200])


async def _run_ai_strategy_task() -> None:
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_ai_strategy_executor, run_ai_strategy)
        set_ai_strategy_result(result)
        set_ai_strategy_status("done")
    except Exception as exc:
        set_ai_strategy_status("error", error=str(exc)[:200])


async def _run_inverted_duck_scan_task() -> None:
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_inverted_duck_executor, run_inverted_duck_scan_fn)
        set_inverted_duck_result(result)
        set_inverted_duck_status("done")
    except Exception as exc:
        set_inverted_duck_status("error", error=str(exc)[:200])


async def _run_nl_refresh_task() -> None:
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(_nl_executor, run_fundamentals_refresh)
    except Exception as exc:
        print(f"NL fundamentals refresh failed: {exc}", flush=True)
