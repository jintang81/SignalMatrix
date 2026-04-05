"""
AI Natural Language Stock Screener

Flow:
  run_fundamentals_refresh() — fetches S&P 500 fundamentals via yfinance,
                               stores in Redis (key: screener:nl:fundamentals, TTL 48h)

  run_nl_search(query)       — calls Claude Haiku to parse the NL query into
                               structured filters, applies them to the cached
                               fundamental universe, returns top-25 results.
"""

import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from zoneinfo import ZoneInfo

import anthropic
import yfinance as yf

from redis_client import get_nl_fundamentals, set_nl_fundamentals

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MAX_RESULTS = 25
MAX_WORKERS = 20  # parallel yfinance fetches

# ─── S&P 500 ticker list ──────────────────────────────────────────

def _fetch_sp500_wiki() -> list[str]:
    import pandas as pd
    tables = pd.read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")
    tickers = tables[0]["Symbol"].tolist()
    # Fix class-B share notation (e.g. BRK.B → BRK-B)
    return [t.replace(".", "-") for t in tickers]


# Fallback list (top 100 by market cap, updated periodically)
_FALLBACK_SP500 = [
    "AAPL","MSFT","NVDA","AMZN","GOOGL","GOOG","META","TSLA","AVGO","BRK-B",
    "JPM","LLY","V","UNH","XOM","MA","COST","ORCL","HD","PG","JNJ","WMT","ABBV",
    "BAC","NFLX","CRM","KO","AMD","MRK","CVX","PEP","ACN","TMO","LIN","ADBE","WFC",
    "MCD","CSCO","GE","ABT","IBM","TXN","MS","GS","AXP","AMGN","CAT","DHR","PM",
    "ISRG","SPGI","BKNG","VZ","LOW","BLK","RTX","T","SYK","UBER","ETN","NEE","PFE",
    "NOW","AMAT","DE","MMC","UNP","PANW","CB","PLD","VRTX","ADP","TJX","SCHW",
    "MDT","C","BSX","ADI","GILD","SO","MU","BMY","ZTS","CME","ELV","CL","ITW",
    "SHW","DUK","AON","GD","REGN","EMR","FI","MCO","APH","NOC","CEG","MMM",
]


def get_sp500_tickers() -> list[str]:
    """Fetch S&P 500 tickers from Wikipedia, with hardcoded fallback."""
    try:
        return _fetch_sp500_wiki()
    except Exception:
        return _FALLBACK_SP500[:]


# ─── Fundamentals fetch ───────────────────────────────────────────

def _fetch_one(ticker: str) -> dict | None:
    """Fetch fundamentals for a single ticker. Returns None on error."""
    try:
        info = yf.Ticker(ticker).info
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        if not price:
            return None
        return {
            "ticker": ticker,
            "name": info.get("shortName") or info.get("longName") or ticker,
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "pb_ratio": info.get("priceToBook"),
            "revenue_growth": info.get("revenueGrowth"),
            "profit_margin": info.get("profitMargins"),
            "debt_to_equity": info.get("debtToEquity"),
            "dividend_yield": info.get("dividendYield"),
            "week52_high": info.get("fiftyTwoWeekHigh"),
            "week52_low": info.get("fiftyTwoWeekLow"),
            "price": price,
            "roe": info.get("returnOnEquity"),
            "earnings_growth": info.get("earningsGrowth"),
        }
    except Exception:
        return None


def fetch_fundamentals_universe() -> list[dict]:
    """
    Fetch fundamental data for all S&P 500 stocks in parallel.
    Takes ~60-90s at MAX_WORKERS=20.
    """
    tickers = get_sp500_tickers()
    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(_fetch_one, t): t for t in tickers}
        for fut in as_completed(futures):
            data = fut.result()
            if data:
                results.append(data)
    return results


# ─── Claude Haiku NL → Filter parsing ────────────────────────────

_NL_SYSTEM = (
    "You are a stock screener assistant for US equities (S&P 500). "
    "Parse the user's natural language query into structured filter conditions. "
    "Output only valid JSON, no other text."
)

_NL_USER_TMPL = """\
Parse this stock screening query into filter conditions:
"{query}"

Available filter fields (include ONLY relevant ones):
- sector: string (must be one of: "Technology", "Healthcare", "Financials", \
"Energy", "Consumer Discretionary", "Consumer Staples", "Industrials", \
"Materials", "Real Estate", "Utilities", "Communication Services")
- industry: string (partial match, e.g. "Semiconductors", "Banks")
- market_cap_min / market_cap_max: number in USD (1B=1000000000)
- pe_ratio_min / pe_ratio_max: trailing P/E ratio (exclude negative PE stocks automatically)
- pb_ratio_min / pb_ratio_max: price-to-book ratio
- revenue_growth_min / revenue_growth_max: decimal (0.15 = 15% YoY growth)
- profit_margin_min / profit_margin_max: decimal (0.10 = 10% net margin)
- debt_to_equity_max: maximum D/E ratio
- dividend_yield_min: minimum dividend yield as decimal (0.03 = 3%)
- week52_position_min: minimum position in 52-week range, 0.0=near low, 1.0=near high
- roe_min: minimum return on equity as decimal

sort_by options: "revenue_growth_desc", "market_cap_desc", "pe_ratio_asc",
                 "profit_margin_desc", "dividend_yield_desc", "roe_desc"

Return ONLY this JSON structure:
{{
  "filters": {{}},
  "sort_by": "most_relevant_sort_option",
  "reasoning": "brief Chinese explanation of interpretation (1-2 sentences)",
  "display_name": "short Chinese label ≤8 chars"
}}"""


def parse_nl_query(query: str) -> dict:
    """
    Call Claude Haiku to parse a natural language query into structured filters.
    Returns dict: { filters, sort_by, reasoning, display_name }
    """
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY not configured")

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=512,
        system=_NL_SYSTEM,
        messages=[{"role": "user", "content": _NL_USER_TMPL.format(query=query)}],
    )

    text = message.content[0].text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1]).strip()

    parsed = json.loads(text)

    # Validate and sanitise sort_by
    valid_sorts = {
        "revenue_growth_desc", "market_cap_desc", "pe_ratio_asc",
        "profit_margin_desc", "dividend_yield_desc", "roe_desc",
    }
    if parsed.get("sort_by") not in valid_sorts:
        parsed["sort_by"] = "revenue_growth_desc"

    return parsed


# ─── Filter application ───────────────────────────────────────────

def _week52_position(stock: dict) -> float | None:
    """Compute where current price sits in the 52-week range (0=low, 1=high)."""
    h = stock.get("week52_high")
    lo = stock.get("week52_low")
    p = stock.get("price")
    if h and lo and p and h > lo:
        return (p - lo) / (h - lo)
    return None


def apply_filters(stocks: list[dict], filters: dict) -> list[dict]:
    """Apply structured filters to the fundamental universe."""
    results = []
    for s in stocks:
        if "sector" in filters:
            if s.get("sector") != filters["sector"]:
                continue
        if "industry" in filters:
            ind = s.get("industry") or ""
            if filters["industry"].lower() not in ind.lower():
                continue
        if "market_cap_min" in filters:
            mc = s.get("market_cap")
            if mc is None or mc < filters["market_cap_min"]:
                continue
        if "market_cap_max" in filters:
            mc = s.get("market_cap")
            if mc is None or mc > filters["market_cap_max"]:
                continue
        if "pe_ratio_min" in filters:
            pe = s.get("pe_ratio")
            if pe is None or pe <= 0 or pe < filters["pe_ratio_min"]:
                continue
        if "pe_ratio_max" in filters:
            pe = s.get("pe_ratio")
            if pe is None or pe <= 0 or pe > filters["pe_ratio_max"]:
                continue
        if "pb_ratio_min" in filters:
            pb = s.get("pb_ratio")
            if pb is None or pb < filters["pb_ratio_min"]:
                continue
        if "pb_ratio_max" in filters:
            pb = s.get("pb_ratio")
            if pb is None or pb > filters["pb_ratio_max"]:
                continue
        if "revenue_growth_min" in filters:
            rg = s.get("revenue_growth")
            if rg is None or rg < filters["revenue_growth_min"]:
                continue
        if "revenue_growth_max" in filters:
            rg = s.get("revenue_growth")
            if rg is None or rg > filters["revenue_growth_max"]:
                continue
        if "profit_margin_min" in filters:
            pm = s.get("profit_margin")
            if pm is None or pm < filters["profit_margin_min"]:
                continue
        if "profit_margin_max" in filters:
            pm = s.get("profit_margin")
            if pm is None or pm > filters["profit_margin_max"]:
                continue
        if "debt_to_equity_max" in filters:
            de = s.get("debt_to_equity")
            if de is None or de > filters["debt_to_equity_max"]:
                continue
        if "dividend_yield_min" in filters:
            dy = s.get("dividend_yield")
            if dy is None or dy < filters["dividend_yield_min"]:
                continue
        if "week52_position_min" in filters:
            pos = _week52_position(s)
            if pos is None or pos < filters["week52_position_min"]:
                continue
        if "roe_min" in filters:
            roe = s.get("roe")
            if roe is None or roe < filters["roe_min"]:
                continue
        results.append(s)
    return results


def sort_results(stocks: list[dict], sort_by: str) -> list[dict]:
    """Sort filtered results. Nulls always sort last."""
    sort_map = {
        "revenue_growth_desc": ("revenue_growth", True),
        "market_cap_desc":     ("market_cap",     True),
        "pe_ratio_asc":        ("pe_ratio",        False),
        "profit_margin_desc":  ("profit_margin",   True),
        "dividend_yield_desc": ("dividend_yield",  True),
        "roe_desc":            ("roe",             True),
    }
    if sort_by not in sort_map:
        return stocks
    field, reverse = sort_map[sort_by]
    return sorted(
        stocks,
        key=lambda s: (
            s.get(field) is None,
            -(s.get(field) or 0) if reverse else (s.get(field) or 0),
        ),
    )


# ─── Main entry points ────────────────────────────────────────────

def run_nl_search(query: str) -> dict:
    """
    Main entry point for a single NL search.
    Reads cached fundamentals, calls Claude Haiku, applies filters.
    Raises RuntimeError if fundamentals are not cached.
    """
    cached = get_nl_fundamentals()
    if cached is None:
        raise RuntimeError(
            "基本面数据未缓存，请稍后再试（后台将在每日 16:30 PDT 自动刷新）"
        )

    parsed = parse_nl_query(query)
    filters = parsed.get("filters", {})
    sort_by = parsed.get("sort_by", "revenue_growth_desc")

    matched = apply_filters(cached["stocks"], filters)
    matched = sort_results(matched, sort_by)[:MAX_RESULTS]

    now_la = datetime.now(ZoneInfo("America/Los_Angeles"))
    tz_abbr = "PDT" if now_la.dst() else "PST"

    return {
        "query": query,
        "display_name": parsed.get("display_name", ""),
        "reasoning": parsed.get("reasoning", ""),
        "filters": filters,
        "sort_by": sort_by,
        "total_matched": len(matched),
        "stocks": matched,
        "fundamentals_date": cached.get("cached_at", ""),
        "scan_time": now_la.strftime(f"%Y-%m-%d %H:%M:%S {tz_abbr}"),
    }


def run_fundamentals_refresh() -> dict:
    """
    Entry point for the daily fundamentals cache refresh cron job.
    Fetches ~503 S&P 500 stocks and stores in Redis.
    """
    now_la = datetime.now(ZoneInfo("America/Los_Angeles"))
    tz_abbr = "PDT" if now_la.dst() else "PST"

    stocks = fetch_fundamentals_universe()

    payload = {
        "stocks": stocks,
        "count": len(stocks),
        "cached_at": now_la.strftime(f"%Y-%m-%d %H:%M:%S {tz_abbr}"),
    }
    set_nl_fundamentals(payload)

    return {
        "status": "ok",
        "count": len(stocks),
        "cached_at": payload["cached_at"],
    }
