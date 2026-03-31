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
    get_result, get_status, set_result, set_status,
    get_volume_result, get_volume_status, set_volume_result, set_volume_status,
    get_duck_result, get_duck_status, set_duck_result, set_duck_status,
    get_options_result, get_options_status, set_options_result, set_options_status,
)
from screener import run_full_scan
from screener_volume import run_volume_scan
from screener_duck import run_duck_scan
from screener_options import run_options_scan

# ─── App ──────────────────────────────────────────────────────────

app = FastAPI(title="SignalMatrix API", version="1.0.0")

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
