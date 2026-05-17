"""
MA20 拐头筛选器 — MA20 Turning Point Screener

筛选条件：
  拐头向上: MA20[today] > MA20[yesterday] AND MA20[yesterday] <= MA20[day2ago]
  拐头向下: MA20[today] < MA20[yesterday] AND MA20[yesterday] >= MA20[day2ago]
  市值门槛: >= 30B USD

股票池：S&P500 + NASDAQ-100 + ETF + AI Watchlist（约 600+ 只）
数据源：Yahoo Finance v8 Chart API，经 Cloudflare Worker 代理
"""

import datetime
import threading
import concurrent.futures
import zoneinfo

from screener_volume import get_us_large_cap_tickers, _AI_WATCHLIST, fetch_ohlcv

MA_PERIOD       = 20
LOOKBACK_DAYS   = 60       # 约 42 个交易日，远超 MA20 所需的 22 根
CHART_LEN       = 60
MAX_WORKERS     = 8
MIN_MARKET_CAP  = 30e9     # 30B USD


def _calc_ma20_series(closes: list) -> list:
    """返回与 closes 等长的 MA20 序列，前 19 项为 None。"""
    result = []
    for i in range(len(closes)):
        if i < MA_PERIOD - 1:
            result.append(None)
        else:
            result.append(sum(closes[i - MA_PERIOD + 1 : i + 1]) / MA_PERIOD)
    return result


def screen_ticker_ma20(ticker: str) -> dict | None:
    """
    检测单只股票的 MA20 是否在当日发生拐头。
    返回结果 dict（含 direction="up"/"dn"）或 None。
    """
    try:
        rows, market_cap = fetch_ohlcv(ticker, LOOKBACK_DAYS)
    except Exception:
        return None

    # 市值过滤
    if market_cap < MIN_MARKET_CAP:
        return None

    # 至少需要 22 根有效 K 线（20 根 MA + 2 根对比）
    if len(rows) < MA_PERIOD + 2:
        return None

    closes = [r["close"] for r in rows]
    ma20_series = _calc_ma20_series(closes)

    # 取最后 3 个有效 MA20 值
    valid_ma = [(i, v) for i, v in enumerate(ma20_series) if v is not None]
    if len(valid_ma) < 3:
        return None

    ma_today = valid_ma[-1][1]
    ma_yest  = valid_ma[-2][1]
    ma_day2  = valid_ma[-3][1]

    turn_up = (ma_today > ma_yest) and (ma_yest <= ma_day2)
    turn_dn = (ma_today < ma_yest) and (ma_yest >= ma_day2)

    if not turn_up and not turn_dn:
        return None

    direction = "up" if turn_up else "dn"

    # 图表数据：最近 CHART_LEN 根 K 线
    chart_rows = rows[-CHART_LEN:]
    chart_closes = [r["close"]  for r in chart_rows]

    # MA20 序列对齐到图表窗口
    offset = len(rows) - len(chart_rows)
    chart_ma20 = []
    for i in range(offset, len(rows)):
        if i < MA_PERIOD - 1:
            chart_ma20.append(None)
        else:
            chart_ma20.append(
                round(sum(closes[i - MA_PERIOD + 1 : i + 1]) / MA_PERIOD, 4)
            )

    return {
        "ticker":      ticker,
        "direction":   direction,
        "last_close":  round(closes[-1], 2),
        "ma20_today":  round(ma_today, 4),
        "ma20_yest":   round(ma_yest, 4),
        "ma20_day2":   round(ma_day2, 4),
        "ma20_slope":  round(ma_today - ma_yest, 4),
        "market_cap":  market_cap,
        "chart": {
            "dates":  [r["date"]   for r in chart_rows],
            "open":   [r["open"]   for r in chart_rows],
            "high":   [r["high"]   for r in chart_rows],
            "low":    [r["low"]    for r in chart_rows],
            "close":  chart_closes,
            "volume": [r["volume"] for r in chart_rows],
            "ma20":   chart_ma20,
        },
    }


def run_ma20_scan() -> dict:
    """
    执行完整 MA20 拐头扫描。
    返回: { date, scan_time, turning_up, turning_dn, total_scanned, signals_found, params }
    """
    tz_la  = zoneinfo.ZoneInfo("America/Los_Angeles")
    now_la = datetime.datetime.now(tz_la)

    tickers = list(set(get_us_large_cap_tickers()) | set(_AI_WATCHLIST))
    turning_up: list = []
    turning_dn: list = []
    lock = threading.Lock()

    def worker(t: str):
        res = screen_ticker_ma20(t)
        if res:
            with lock:
                if res["direction"] == "up":
                    turning_up.append(res)
                else:
                    turning_dn.append(res)

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as exe:
        futures = [exe.submit(worker, t) for t in tickers]
        concurrent.futures.wait(futures)

    # 按市值从高到低排列
    turning_up.sort(key=lambda x: x["market_cap"], reverse=True)
    turning_dn.sort(key=lambda x: x["market_cap"], reverse=True)

    tz_abbr = now_la.strftime("%Z")

    return {
        "date":          now_la.strftime("%Y-%m-%d"),
        "scan_time":     now_la.strftime(f"%Y-%m-%d %H:%M:%S {tz_abbr}"),
        "turning_up":    turning_up,
        "turning_dn":    turning_dn,
        "total_scanned": len(tickers),
        "signals_found": len(turning_up) + len(turning_dn),
        "params": {
            "ma_period":       MA_PERIOD,
            "min_market_cap_b": MIN_MARKET_CAP / 1e9,
        },
    }
