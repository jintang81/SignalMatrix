"""
SignalMatrix FastAPI Backend

Endpoints:
  GET  /api/screener/divergence  — return cached scan results
  GET  /api/screener/status      — check scan status
  POST /api/screener/run         — trigger a background scan (requires X-API-Key header)

Required env vars:
  API_KEY                  — protects the /run endpoint
  UPSTASH_REDIS_REST_URL   — from Upstash console
  UPSTASH_REDIS_REST_TOKEN — from Upstash console
"""

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from redis_client import get_result, get_status, set_result, set_status
from screener import run_full_scan

# ─── App ──────────────────────────────────────────────────────────

app = FastAPI(title="SignalMatrix API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

API_KEY   = os.environ.get("API_KEY", "")
_executor = ThreadPoolExecutor(max_workers=1)   # one scan at a time


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


# ─── Background task ──────────────────────────────────────────────

async def _run_scan_task() -> None:
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_executor, run_full_scan)
        set_result(result)
        set_status("done")
    except Exception as exc:
        set_status("error", error=str(exc)[:200])
