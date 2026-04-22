"""
隔夜套利筛选器 — Overnight Arbitrage Screener

入场条件（3:40 PM EST cron 触发）：
  1. 盘中涨幅 ∈ [3%, 5%]
     使用 meta.regularMarketPrice（实时）vs meta.regularMarketPreviousClose（昨收）
     注意：3:40 PM 未收盘，不使用已完成的日线 close
  2. 过去 20 个交易日中至少 1 天 close-to-close 涨幅 > 5%（有人气的强势股）
  3. 量比 > 1
     volume_ratio = today_volume / (20日均量 × 0.949)
     0.949 = 6h10m / 6.5h，代表 3:40 PM 时已过 94.9% 的交易日
  4. 换手率 ∈ [5%, 10%]（今日成交量 / 流通股数）
  5. 股价 > VWAP（via Tradier 1-min timesales，当日分时 VWAP）

出场分析（次日早盘，on-demand via GET /api/screener/overnight/exit/{ticker}）：
  获取 9:30-9:45 AM 1 分钟 K 线，判断 5 种开盘场景并给出操作建议
"""

import datetime
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote

import requests

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

# ─── 核心参数 ─────────────────────────────────────────────────────────
LOOKBACK_DAYS         = 60
HIST_WIN              = 20       # 过去 20 个交易日（用于条件 2、3）
MIN_PCT_GAIN          = 3.0      # 条件 1：涨幅下限
MAX_PCT_GAIN          = 5.0      # 条件 1：涨幅上限
SURGE_THRESH          = 5.0      # 条件 2：单日最大涨幅门槛
VOL_RATIO_MIN         = 1.0      # 条件 3：量比门槛
TURNOVER_MIN          = 0.5      # 条件 4：换手率下限（%）
TURNOVER_MAX          = 10.0     # 条件 4：换手率上限（%）
TRADING_DAY_FRACTION  = 0.83     # 3:40 PM 前约完成全天 83% 成交量
                                  # 美股成交量 U 型分布：收盘前 20 分钟占 ~17%，
                                  # 不能用时间比 6h10m/6.5h=94.9%（会严重低估量比）
VOL_MA_PERIOD         = 20
CHART_LEN             = 30       # 图表显示最近 N 根日线 bar
MAX_WORKERS           = 8

# ─── Tradier 配置 ──────────────────────────────────────────────────────
TRADIER_TOKEN   = os.environ.get("TRADIER_TOKEN", "")
TRADIER_SANDBOX = os.environ.get("TRADIER_SANDBOX", "false").lower() == "true"
TRADIER_BASE    = (
    "https://sandbox.tradier.com/v1" if TRADIER_SANDBOX
    else "https://api.tradier.com/v1"
)

# ─── Yahoo Finance (CF Worker proxy) ──────────────────────────────────
CF_PROXY_BASE = "https://yahoo-proxy.hejintang.workers.dev/"
YAHOO_BASE    = "https://query1.finance.yahoo.com"

_session = requests.Session()
_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept":     "application/json",
})


def _proxy_url(path: str) -> str:
    return CF_PROXY_BASE + "?url=" + quote(YAHOO_BASE + path, safe="")


# ─── 股票池（复用 screener_volume.py 的实现）─────────────────────────────
from screener_volume import get_us_large_cap_tickers, _AI_WATCHLIST


# ─── 数据拉取 ──────────────────────────────────────────────────────────

def fetch_chart(ticker: str) -> tuple:
    """
    返回 (rows, intraday_meta)。
    rows: 已完成日线的 OHLCV list（自动排除当日未收盘 bar）。
    intraday_meta: 含 price, prev_close, volume, market_cap 的实时快照（来自 meta 字段）。
    """
    end   = int(time.time())
    start = end - LOOKBACK_DAYS * 86400
    path  = (
        f"/v8/finance/chart/{ticker}"
        f"?interval=1d&period1={start}&period2={end}&events=history"
    )
    r = _session.get(_proxy_url(path), timeout=20)
    r.raise_for_status()
    data = r.json()

    res  = data["chart"]["result"][0]
    meta = res["meta"]
    q    = res["indicators"]["quote"][0]
    ts   = res.get("timestamp", [])
    ac   = res.get("indicators", {}).get("adjclose", [{}])[0].get("adjclose", [])

    closes  = ac if ac else q.get("close", [])
    opens   = q.get("open", [])
    highs   = q.get("high", [])
    lows    = q.get("low", [])
    volumes = q.get("volume", [])

    # 移除当日未收盘 bar（盘中 Yahoo Finance 会追加一根当日不完整 bar）
    la_tz    = ZoneInfo("America/Los_Angeles")
    today_la = datetime.datetime.now(la_tz).date()
    if ts and datetime.datetime.fromtimestamp(ts[-1], tz=la_tz).date() >= today_la:
        ts      = ts[:-1]
        closes  = closes[:-1]
        opens   = opens[:-1]  if opens   else opens
        highs   = highs[:-1]  if highs   else highs
        lows    = lows[:-1]   if lows    else lows
        volumes = volumes[:-1] if volumes else volumes

    rows = []
    for i in range(len(closes)):
        if all(x is not None for x in [
            closes[i],
            opens[i]   if opens   else None,
            highs[i]   if highs   else None,
            lows[i]    if lows    else None,
            volumes[i] if volumes else None,
        ]):
            rows.append({
                "date":   datetime.datetime.utcfromtimestamp(ts[i]).strftime("%Y-%m-%d"),
                "open":   opens[i],
                "high":   highs[i],
                "low":    lows[i],
                "close":  closes[i],
                "volume": volumes[i],
            })

    intraday_meta = {
        "price":      meta.get("regularMarketPrice", 0) or 0,
        "prev_close": meta.get("regularMarketPreviousClose", 0) or 0,
        "volume":     meta.get("regularMarketVolume", 0) or 0,
        "market_cap": meta.get("marketCap", 0) or 0,
    }
    return rows, intraday_meta


def fetch_float_shares(ticker: str):
    """从 Yahoo Finance quoteSummary 获取流通股数（floatShares）。"""
    path = f"/v10/finance/quoteSummary/{ticker}?modules=defaultKeyStatistics"
    try:
        r = _session.get(_proxy_url(path), timeout=15)
        r.raise_for_status()
        result = r.json().get("quoteSummary", {}).get("result", [])
        if not result:
            return None
        ks = result[0].get("defaultKeyStatistics", {})
        fs = ks.get("floatShares", {})
        if isinstance(fs, dict):
            return fs.get("raw")
        return float(fs) if fs else None
    except Exception:
        return None


def fetch_tradier_timesales(ticker: str, date_str: str,
                             start_time: str, end_time: str) -> list:
    """
    获取 Tradier 1 分钟 K 线。
    date_str: "2026-04-21"
    start_time / end_time: "09:30" / "15:40"
    返回 bars list（每根：{time, open, high, low, close, volume}）。
    """
    if not TRADIER_TOKEN:
        return []
    start = f"{date_str} {start_time}"
    end   = f"{date_str} {end_time}"
    try:
        resp = requests.get(
            f"{TRADIER_BASE}/markets/timesales",
            params={
                "symbol":         ticker,
                "interval":       "1min",
                "start":          start,
                "end":            end,
                "session_filter": "open",
            },
            headers={
                "Authorization": f"Bearer {TRADIER_TOKEN}",
                "Accept":        "application/json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data   = resp.json()
        series = data.get("series") or {}
        if not series:
            return []
        raw = series.get("data", [])
        if isinstance(raw, dict):  # Tradier returns single bar as dict, not list
            raw = [raw]
        return raw or []
    except Exception as e:
        print(f"[WARN] Tradier timesales {ticker}: {e}")
        return []


def compute_vwap(bars: list):
    """计算 VWAP = Σ(typical_price × volume) / Σ(volume)。"""
    total_vol = 0
    total_pv  = 0.0
    for b in bars:
        try:
            h  = float(b["high"])
            l  = float(b["low"])
            c  = float(b["close"])
            v  = int(b["volume"])
            tp = (h + l + c) / 3
            total_pv  += tp * v
            total_vol += v
        except (KeyError, TypeError, ValueError):
            continue
    return total_pv / total_vol if total_vol > 0 else None


def fetch_spx_env() -> dict:
    """获取 S&P 500 vs 20 日均线的大盘环境状态。"""
    try:
        rows, meta = fetch_chart("^GSPC")
        if len(rows) < 20:
            return {"signal": "unknown", "suitable": False, "spx_price": 0, "spx_ma20": 0}
        closes = [r["close"] for r in rows]
        ma20   = sum(closes[-20:]) / 20
        price  = meta["price"] or closes[-1]
        signal = "bull" if price > ma20 else "bear"
        return {
            "spx_price": round(price, 2),
            "spx_ma20":  round(ma20, 2),
            "suitable":  price > ma20,
            "signal":    signal,
        }
    except Exception as e:
        print(f"[WARN] SPX env check failed: {e}")
        return {"signal": "unknown", "suitable": False, "spx_price": 0, "spx_ma20": 0}


# ─── Phase 1 筛选（条件 1、2、3） ─────────────────────────────────────────

def _screen_phase1(ticker: str):
    """
    使用日线数据进行 Phase 1 筛选（条件 1、2、3）。
    返回候选 dict 或 None（不符合条件）。
    """
    try:
        rows, meta = fetch_chart(ticker)
    except Exception:
        return None

    price      = meta["price"]
    prev_close = meta["prev_close"]
    today_vol  = meta["volume"]
    mktcap_b   = meta["market_cap"] / 1e9 if meta["market_cap"] else 0.0

    if not price or not prev_close or prev_close <= 0:
        return None

    # ── 条件 1：盘中涨幅 ∈ [3%, 5%] ──
    pct_change = (price - prev_close) / prev_close * 100
    if not (MIN_PCT_GAIN <= pct_change <= MAX_PCT_GAIN):
        return None

    # ── 条件 2：过去 20 个完整交易日中，至少 1 天 close-to-close > 5% ──
    if len(rows) < HIST_WIN + 1:
        return None
    hist_rows = rows[-(HIST_WIN + 1):]  # 21 bars → 20 daily returns
    max_daily = 0.0
    for i in range(1, len(hist_rows)):
        c0 = hist_rows[i - 1]["close"]
        c1 = hist_rows[i]["close"]
        if c0 > 0:
            chg = (c1 - c0) / c0 * 100
            if chg > max_daily:
                max_daily = chg
    if max_daily < SURGE_THRESH:
        return None

    # ── 条件 3：量比 > 1 ──
    if len(rows) < VOL_MA_PERIOD + 1:
        return None
    hist_vols = [r["volume"] for r in rows[-VOL_MA_PERIOD:]]  # last 20 completed days
    if not hist_vols or sum(hist_vols) == 0:
        return None
    avg_vol_20d = sum(hist_vols) / len(hist_vols)
    vol_ratio   = (
        today_vol / (avg_vol_20d * TRADING_DAY_FRACTION)
        if avg_vol_20d > 0 else 0.0
    )
    if vol_ratio < VOL_RATIO_MIN:
        return None

    # 通过 Phase 1 — 构建候选记录
    chart_rows = rows[-CHART_LEN:]
    return {
        "ticker":       ticker,
        "price":        round(price, 2),
        "pct_change":   round(pct_change, 2),
        "volume_ratio": round(vol_ratio, 2),
        "max_gain_20d": round(max_daily, 1),
        "mktcap_b":     round(mktcap_b, 1),
        "today_volume": today_vol,
        "avg_vol_20d":  int(avg_vol_20d),
        "chart": {
            "dates":  [r["date"]   for r in chart_rows],
            "open":   [r["open"]   for r in chart_rows],
            "high":   [r["high"]   for r in chart_rows],
            "low":    [r["low"]    for r in chart_rows],
            "close":  [r["close"]  for r in chart_rows],
            "volume": [r["volume"] for r in chart_rows],
        },
        # Phase 2 字段，稍后填充
        "float_shares":  None,
        "turnover_rate": None,
        "vwap":          None,
        "above_vwap":    None,
    }


# ─── 主入口 ────────────────────────────────────────────────────────────

def run_overnight_scan() -> dict:
    """
    执行完整入场扫描，返回结果字典。
    由 FastAPI 的 POST /api/screener/overnight/run 触发（cron 3:40 PM EST）。
    """
    la_tz  = ZoneInfo("America/Los_Angeles")
    now_la = datetime.datetime.now(la_tz)
    tz_abbr = "PDT" if now_la.dst() else "PST"
    today_str = now_la.strftime("%Y-%m-%d")

    tickers = list(set(get_us_large_cap_tickers()) | set(_AI_WATCHLIST))
    print(f"[overnight] Phase 1: 扫描 {len(tickers)} 只股票（含 AI 自选股）...")

    # ── Phase 1：多线程筛选条件 1、2、3 ──
    phase1_results = []
    lock = threading.Lock()

    def _worker(t):
        res = _screen_phase1(t)
        if res:
            with lock:
                phase1_results.append(res)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = [ex.submit(_worker, t) for t in tickers]
        for f in as_completed(futures):
            try:
                f.result()
            except Exception as e:
                print(f"[WARN] Phase 1 worker error: {e}")

    print(f"[overnight] Phase 1 完成: {len(phase1_results)} 只候选股")

    # ── Phase 2：串行处理候选股（条件 4 + 5）──
    final_stocks = []
    for c in phase1_results:
        ticker = c["ticker"]

        # 条件 4：换手率 ∈ [5%, 10%]
        float_shares = fetch_float_shares(ticker)
        if float_shares and float_shares > 0:
            turnover_rate = c["today_volume"] / float_shares * 100
            c["float_shares"]  = float_shares
            c["turnover_rate"] = round(turnover_rate, 2)
            if not (TURNOVER_MIN <= turnover_rate <= TURNOVER_MAX):
                print(f"[overnight] {ticker} 换手率 {turnover_rate:.1f}% 不在范围，跳过")
                continue
        else:
            # 无法获取流通股数，保留候选但标记为 null
            c["float_shares"]  = None
            c["turnover_rate"] = None
            print(f"[overnight] {ticker} 无法获取流通股数，保留但标记 null")

        # 条件 5：股价 > VWAP
        time.sleep(0.1)  # Tradier rate-limit buffer
        bars = fetch_tradier_timesales(ticker, today_str, "09:30", "15:40")
        vwap = compute_vwap(bars) if bars else None
        if vwap:
            above_vwap    = c["price"] > vwap
            c["vwap"]      = round(vwap, 2)
            c["above_vwap"] = above_vwap
            if not above_vwap:
                print(f"[overnight] {ticker} 价格 {c['price']} < VWAP {vwap:.2f}，跳过")
                continue
        else:
            # 无 timesales 数据（非交易日 / Tradier 暂时无数据）— 保留但标记 null
            c["vwap"]      = None
            c["above_vwap"] = None
            print(f"[overnight] {ticker} 无 Tradier timesales 数据，保留但标记 null")

        final_stocks.append(c)

    print(f"[overnight] Phase 2 完成: {len(final_stocks)} 只最终候选股")

    # ── 大盘环境 ──
    market_env = fetch_spx_env()

    return {
        "date":       today_str,
        "scan_time":  now_la.strftime(f"%Y-%m-%d %H:%M:%S {tz_abbr}"),
        "market_env": market_env,
        "stocks":     final_stocks,
    }


# ─── 次日早盘出场分析（on-demand）────────────────────────────────────────

def get_exit_analysis(ticker: str, date_str: str | None = None) -> dict:
    """
    获取指定股票指定日期的开盘 15 分钟走势，判断 5 种出场场景。
    date_str: "YYYY-MM-DD"（默认今天 LA 时间）。
    由 FastAPI 的 GET /api/screener/overnight/exit/{ticker} 调用。
    """
    la_tz = ZoneInfo("America/Los_Angeles")
    if not date_str:
        date_str = datetime.datetime.now(la_tz).strftime("%Y-%m-%d")

    bars = fetch_tradier_timesales(ticker, date_str, "09:30", "09:45")

    if not bars or len(bars) < 3:
        return {
            "ticker":  ticker,
            "date":    date_str,
            "status":  "waiting",
            "message": "等待 9:30 开盘数据，请在 9:45 AM EST 后再试",
            "bars":    bars or [],
        }

    open_price = float(bars[0]["open"])
    last_close = float(bars[-1]["close"])

    all_highs  = [float(b["high"]) for b in bars]
    all_lows   = [float(b["low"])  for b in bars]
    peak_idx   = all_highs.index(max(all_highs))
    trough_idx = all_lows.index(min(all_lows))

    gain_pct = (last_close - open_price) / open_price * 100 if open_price > 0 else 0.0

    # ── 判断 5 种场景 ──
    if peak_idx < trough_idx:
        # 先涨后跌
        if last_close >= open_price:
            scenario = "washout"
            action   = "hold"
            detail   = "开盘先涨后跌，价格未跌破开盘价 — 疑似主力洗盘，中午前找机会出"
            color    = "green"
        else:
            scenario = "flee"
            action   = "sell_asap"
            detail   = "开盘先涨后跌并跌破开盘价 — 主力可能在出逃，尽快出掉"
            color    = "red"
    elif trough_idx < peak_idx:
        # 先跌后涨
        if last_close <= open_price:
            scenario = "weak_bounce"
            action   = "sell_asap"
            detail   = "开盘先跌后涨，反弹未超开盘价 — 弱反弹，大概率继续跌，尽快出掉"
            color    = "red"
        else:
            scenario = "fake_drop"
            action   = "hold"
            detail   = "开盘先跌后涨并超过开盘价 — 可能是假摔，中午前找机会出"
            color    = "green"
    else:
        # peak_idx == trough_idx（极少数情况，按涨跌判断）
        if gain_pct >= 0:
            scenario = "steady_rise"
            action   = "hold"
            detail   = "开盘小幅拉升，走势平稳 — 不急于早盘出"
            color    = "green"
        else:
            scenario = "weak"
            action   = "sell_asap"
            detail   = "开盘走弱 — 尽快出掉"
            color    = "red"

    # 特殊覆盖：小幅稳健上涨（涨幅 > 0 且 < 5%，peak 在后期）
    if (
        peak_idx > trough_idx
        and last_close > open_price
        and 0 < gain_pct < 5
    ):
        scenario = "steady_rise"
        action   = "hold_strong"
        detail   = "开盘 15 分钟小幅稳健拉升，站上开盘价，成交量温和 — 无需急于早盘出"
        color    = "blue"

    return {
        "ticker":        ticker,
        "date":          date_str,
        "status":        "analyzed",
        "open_price":    round(open_price, 2),
        "current_price": round(last_close, 2),
        "gain_pct":      round(gain_pct, 2),
        "scenario":      scenario,
        "action":        action,
        "detail":        detail,
        "color":         color,
        "bars":          bars,
    }
