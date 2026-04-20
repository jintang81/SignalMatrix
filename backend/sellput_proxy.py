"""
sellput_proxy.py — Sell Put 开仓决策工具的后端代理模块
==========================================================

挂载到 SignalMatrix 的 main.py:

    from sellput_proxy import router as sellput_router
    app.include_router(sellput_router)

所需环境变量 (已在 Render 上配置，无需新增):
    TRADIER_TOKEN   — Tradier 正式账户 API Token（实时数据）
    API_KEY         — X-API-Key 鉴权 header（与其它 screener 端点统一）

可选环境变量:
    TRADIER_SANDBOX — 设为 "true" 时用 sandbox 端点（延迟15分钟，调试用）

端点列表:
    GET /api/sellput/options/{ticker}
        不带 expiration → 返回到期日列表 + 当前报价
        带 ?expiration=YYYY-MM-DD → 返回该日期的 puts 链（含 Greeks）

    GET /api/sellput/valuation/{ticker}
        返回父资产的 Forward P/E + 过去约4年年度稀释 EPS 序列
        供 Gate 0（估值守门员）使用

缓存策略 (Upstash Redis):
    options meta   — 5 分钟 TTL
    options chain  — 1 分钟 TTL（Greeks 盘中变化）
    valuation      — 24 小时 TTL（EPS / P/E 每日不变）
"""

import os
import time
from datetime import datetime
from typing import Optional

import requests
from fastapi import APIRouter, Header, HTTPException, Query

try:
    from redis_client import redis_get, redis_set
except ImportError:
    _mem: dict = {}

    def redis_get(key):
        v = _mem.get(key)
        if v and v["exp"] > time.time():
            return v["val"]
        return None

    def redis_set(key, val, ex=60):
        _mem[key] = {"val": val, "exp": time.time() + ex}


TRADIER_TOKEN   = os.environ.get("TRADIER_TOKEN", "")
TRADIER_SANDBOX = os.environ.get("TRADIER_SANDBOX", "false").lower() == "true"
TRADIER_BASE    = (
    "https://sandbox.tradier.com/v1" if TRADIER_SANDBOX
    else "https://api.tradier.com/v1"
)
API_KEY  = os.environ.get("API_KEY", "")
YF_BASE  = "https://query2.finance.yahoo.com"

router = APIRouter(prefix="/api/sellput", tags=["sellput"])


# ── 鉴权 ──────────────────────────────────────────────────────────────────
def _check_auth(x_api_key: Optional[str]):
    if not API_KEY:
        return
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


# ── Tradier 工具 ─────────────────────────────────────────────────────────
def _tradier(path: str, params: dict) -> dict:
    if not TRADIER_TOKEN:
        raise HTTPException(500, "TRADIER_TOKEN not configured")
    r = requests.get(
        f"{TRADIER_BASE}{path}",
        params=params,
        headers={"Authorization": f"Bearer {TRADIER_TOKEN}", "Accept": "application/json"},
        timeout=12,
    )
    if r.status_code != 200:
        raise HTTPException(502, f"Tradier {r.status_code}: {r.text[:200]}")
    return r.json()


def _tradier_quote(symbol: str) -> dict:
    data = _tradier("/markets/quotes", {"symbols": symbol})
    q = data.get("quotes", {}).get("quote")
    if isinstance(q, list):
        q = q[0] if q else {}
    return q or {}


def _tradier_expirations(symbol: str) -> list:
    data = _tradier("/markets/options/expirations", {
        "symbol": symbol, "includeAllRoots": "true",
    })
    exps = data.get("expirations", {}).get("date", [])
    return ([exps] if isinstance(exps, str) else exps) or []


def _tradier_chain(symbol: str, expiration: str) -> list:
    data = _tradier("/markets/options/chains", {
        "symbol": symbol, "expiration": expiration, "greeks": "true",
    })
    opts = data.get("options", {}).get("option", [])
    return ([opts] if isinstance(opts, dict) else opts) or []


# ── Yahoo Finance 工具 ────────────────────────────────────────────────────
def _yf_get(path: str, params: dict = None) -> dict:
    r = requests.get(
        f"{YF_BASE}{path}",
        params=params or {},
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        timeout=12,
    )
    if r.status_code != 200:
        raise HTTPException(502, f"Yahoo Finance {r.status_code}")
    return r.json()


# ── 端点 1: 期权链 ────────────────────────────────────────────────────────
@router.get("/options/{ticker}")
def get_options(
    ticker: str,
    expiration: Optional[str] = Query(
        None,
        description="YYYY-MM-DD。不传返回到期日列表；传入返回该日期 puts 链（含 Greeks）。",
    ),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    期权数据代理（Tradier）。

    **不带 expiration（元数据模式）**
    ```json
    {
      "ticker":           "TQQQ",
      "underlying_price": 54.5,
      "quote":            { "last", "bid", "ask", "prevclose", "week_52_high", "week_52_low" },
      "expirations":      ["2026-05-15", "2026-06-20", ...],
      "fetched_at":       "2026-04-19T..."
    }
    ```

    **带 expiration（期权链模式）**
    ```json
    {
      "ticker":           "TQQQ",
      "underlying_price": 54.5,
      "expiration":       "2026-05-15",
      "chain": {
        "puts": [
          {
            "symbol":        "TQQQ260515P00049000",
            "strike":        49.0,
            "bid":           1.60,
            "ask":           1.80,
            "last":          1.70,
            "volume":        1234,
            "open_interest": 5678,
            "iv":            0.68,
            "greeks": { "delta": -0.25, "gamma": 0.045, "theta": -0.08, "vega": 0.12 },
            "expiration": "2026-05-15"
          }
        ]
      },
      "fetched_at": "2026-04-19T..."
    }
    ```
    """
    _check_auth(x_api_key)
    ticker = ticker.upper().strip()
    if not ticker:
        raise HTTPException(400, "ticker required")

    cache_key = f"sellput:opts:{ticker}:{expiration or 'meta'}"
    if cached := redis_get(cache_key):
        return cached

    quote = _tradier_quote(ticker)
    underlying_price = quote.get("last") or quote.get("close") or quote.get("prevclose")

    if not expiration:
        result = {
            "ticker": ticker,
            "underlying_price": underlying_price,
            "quote": {
                "last":         quote.get("last"),
                "bid":          quote.get("bid"),
                "ask":          quote.get("ask"),
                "prevclose":    quote.get("prevclose"),
                "week_52_high": quote.get("week_52_high"),
                "week_52_low":  quote.get("week_52_low"),
            },
            "expirations": _tradier_expirations(ticker),
            "fetched_at": datetime.utcnow().isoformat() + "Z",
        }
        redis_set(cache_key, result, ex=300)
        return result

    chain = _tradier_chain(ticker, expiration)
    puts = []
    for opt in chain:
        if opt.get("option_type") != "put":
            continue
        greeks = opt.get("greeks") or {}
        puts.append({
            "symbol":        opt.get("symbol"),
            "strike":        opt.get("strike"),
            "bid":           opt.get("bid"),
            "ask":           opt.get("ask"),
            "last":          opt.get("last"),
            "volume":        opt.get("volume") or 0,
            "open_interest": opt.get("open_interest") or 0,
            "iv":            greeks.get("mid_iv") or greeks.get("smv_vol"),
            "greeks": {
                "delta": greeks.get("delta"),
                "gamma": greeks.get("gamma"),
                "theta": greeks.get("theta"),
                "vega":  greeks.get("vega"),
            } if greeks else None,
            "expiration": opt.get("expiration_date"),
        })

    puts.sort(key=lambda p: p.get("strike") or 0, reverse=True)

    result = {
        "ticker": ticker,
        "underlying_price": underlying_price,
        "expiration": expiration,
        "chain": {"puts": puts},
        "fetched_at": datetime.utcnow().isoformat() + "Z",
    }
    redis_set(cache_key, result, ex=60)
    return result


# ── 端点 2: 估值数据 ──────────────────────────────────────────────────────
@router.get("/valuation/{ticker}")
def get_valuation(
    ticker: str,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    父资产估值数据（Yahoo Finance），供 Gate 0 估值守门员使用。

    注意：应传入**父资产**代码，不是杠杆 ETF 本身：
      - TQQQ → QQQ
      - SOXL → SOXX
      - NVDL → NVDA
      - TSLL → TSLA

    返回:
    ```json
    {
      "ticker":      "NVDA",
      "forward_pe":  17.9,
      "trailing_pe": 35.2,
      "annual_eps": [
        { "date": "2022-01-31", "eps": 3.85 },
        { "date": "2025-01-31", "eps": 28.30 }
      ],
      "data_source": "yahoo_fundamentals_timeseries",
      "fetched_at":  "2026-04-19T..."
    }
    ```
    """
    _check_auth(x_api_key)
    ticker = ticker.upper().strip()
    if not ticker:
        raise HTTPException(400, "ticker required")

    cache_key = f"sellput:val:{ticker}"
    if cached := redis_get(cache_key):
        return cached

    result = {
        "ticker":      ticker,
        "forward_pe":  None,
        "trailing_pe": None,
        "annual_eps":  [],
        "data_source": "yahoo_fundamentals_timeseries",
        "fetched_at":  datetime.utcnow().isoformat() + "Z",
    }

    # 1. Forward P/E + Trailing P/E
    try:
        data = _yf_get(
            f"/v10/finance/quoteSummary/{ticker}",
            {"modules": "defaultKeyStatistics,summaryDetail"},
        )
        r0 = (data.get("quoteSummary", {}).get("result") or [{}])[0]
        ks = r0.get("defaultKeyStatistics", {})
        sd = r0.get("summaryDetail", {})
        result["forward_pe"]  = (ks.get("forwardPE")  or {}).get("raw") \
                              or (sd.get("forwardPE")  or {}).get("raw")
        result["trailing_pe"] = (ks.get("trailingPE") or {}).get("raw") \
                              or (sd.get("trailingPE") or {}).get("raw")
    except Exception:
        pass

    # 2. 年度稀释 EPS 序列
    try:
        now_ts  = int(time.time())
        six_yr  = now_ts - 6 * 365 * 86400
        data = _yf_get(
            f"/ws/fundamentals-timeseries/v1/finance/timeseries/{ticker}",
            {"symbol": ticker, "type": "annualDilutedEPS",
             "period1": str(six_yr), "period2": str(now_ts)},
        )
        series = data.get("timeseries", {}).get("result") or []
        eps_series = next(
            (s for s in series
             if "annualDilutedEPS" in (s.get("meta", {}).get("type") or [])),
            None,
        )
        if eps_series:
            for item in (eps_series.get("annualDilutedEPS") or []):
                raw  = (item.get("reportedValue") or {}).get("raw")
                date = item.get("asOfDate")
                if raw is not None and date:
                    result["annual_eps"].append({"date": date, "eps": raw})
            result["annual_eps"].sort(key=lambda x: x["date"])
    except Exception:
        pass

    redis_set(cache_key, result, ex=86400)  # 24h TTL
    return result
