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
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from zoneinfo import ZoneInfo

import anthropic
import yfinance as yf

from redis_client import get_nl_fundamentals, set_nl_fundamentals
from screener_volume import _AI_WATCHLIST

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MAX_RESULTS = 25
MAX_WORKERS = 20  # parallel yfinance fetches

# ─── Ticker list (S&P 500 + NASDAQ-100) ──────────────────────────

def _fetch_sp500_wiki() -> list[str]:
    """Fetch S&P 500 tickers from Wikipedia using stdlib HTML parser (no pandas)."""
    import html.parser as _hp

    class _Parser(_hp.HTMLParser):
        def __init__(self):
            super().__init__()
            self.in_first_table = False
            self.row = []
            self.rows = []
            self.col_idx = None
            self.header_done = False
            self.td_text = ""
            self.in_td = False
            self.table_count = 0

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == "table" and "wikitable" in attrs.get("class", ""):
                self.table_count += 1
                if self.table_count == 1:
                    self.in_first_table = True
            if self.in_first_table and tag in ("td", "th"):
                self.in_td = True
                self.td_text = ""

        def handle_endtag(self, tag):
            if tag == "table" and self.in_first_table:
                self.in_first_table = False
            if self.in_first_table and tag in ("td", "th"):
                self.in_td = False
                self.row.append(self.td_text.strip())
            if self.in_first_table and tag == "tr":
                if not self.header_done:
                    for i, h in enumerate(self.row):
                        if "Symbol" in h or "Ticker" in h:
                            self.col_idx = i
                    self.header_done = True
                else:
                    if self.col_idx is not None and len(self.row) > self.col_idx:
                        self.rows.append(self.row[self.col_idx])
                self.row = []

        def handle_data(self, data):
            if self.in_td:
                self.td_text += data

    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        content = resp.read().decode("utf-8")
    parser = _Parser()
    parser.feed(content)
    tickers = [t.replace(".", "-") for t in parser.rows if t and t != "Symbol"]
    if len(tickers) < 400:
        raise ValueError(f"只解析到 {len(tickers)} 个 ticker")
    return tickers


def _fetch_nasdaq100_wiki() -> list[str]:
    """Fetch NASDAQ-100 tickers from GitHub CSV or Wikipedia."""
    csv_urls = [
        "https://raw.githubusercontent.com/datasets/nasdaq-100/main/data/nasdaq-100.csv",
    ]
    for url in csv_urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                lines = resp.read().decode("utf-8").splitlines()
            if not lines:
                continue
            header = [h.strip().strip('"').lower() for h in lines[0].split(",")]
            col = next((i for i, h in enumerate(header) if h in ("symbol", "ticker", "code")), None)
            if col is None:
                continue
            tickers = []
            for line in lines[1:]:
                parts = line.split(",")
                if len(parts) > col:
                    t = parts[col].strip().strip('"').replace(".", "-")
                    if t and t.upper() == t and len(t) <= 5:
                        tickers.append(t)
            if len(tickers) >= 80:
                return tickers
        except Exception:
            continue

    # Wikipedia fallback
    url = "https://en.wikipedia.org/wiki/Nasdaq-100"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        content = resp.read().decode("utf-8")
    ticker_pattern = re.compile(r"^[A-Z]{1,5}$")
    table_starts = [m.start() for m in re.finditer(r'class="[^"]*wikitable', content)]
    for t_start in table_starts:
        t_end = content.find("</table>", t_start)
        table_html = content[t_start:t_end]
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table_html, re.DOTALL | re.IGNORECASE)
        tickers = []
        for row in rows:
            tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL | re.IGNORECASE)
            if tds:
                first = re.sub(r"<[^>]+>", "", tds[0]).strip().replace(".", "-")
                if ticker_pattern.match(first):
                    tickers.append(first)
        if len(tickers) >= 80:
            return tickers
    raise ValueError("所有数据源均失败")


_FALLBACK_SP500 = [
    "MMM","AOS","ABT","ABBV","ACN","ADBE","AMD","AES","AFL","A","APD","ABNB","AKAM","ALB","ARE",
    "ALGN","ALLE","LNT","ALL","GOOGL","GOOG","MO","AMZN","AMCR","AEE","AAL","AEP","AXP","AIG",
    "AMT","AWK","AMP","AME","AMGN","APH","ADI","ANSS","AON","APA","AAPL","AMAT","APTV","ACGL",
    "ADM","ANET","AJG","AIZ","T","ATO","ADSK","ADP","AZO","AVB","AVY","AXON","BKR","BALL","BAC",
    "BK","BBWI","BAX","BDX","WRB","BBY","BIIB","BLK","BX","BA","BSX","BMY","AVGO","BR","BRO",
    "BG","BLDR","CHRW","CDNS","CPT","CPB","COF","CAH","KMX","CCL","CARR","CAT","CBOE","CBRE",
    "CDW","COR","CNC","CDAY","CF","SCHW","CHTR","CVX","CMG","CB","CHD","CI","CINF","CTAS","CSCO",
    "C","CFG","CLX","CME","CMS","KO","CTSH","CL","CMCSA","CAG","COP","ED","STZ","CEG","COO",
    "CPRT","GLW","CTVA","CSGP","COST","CTRA","CCI","CSX","CMI","CVS","DHR","DRI","DVA","DE",
    "DAL","DVN","DXCM","FANG","DLR","DFS","DG","DLTR","D","DPZ","DOV","DOW","DHI","DTE","DUK",
    "DD","EMN","ETN","EBAY","ECL","EIX","EW","EA","ELV","LLY","EMR","ENPH","ETR","EOG","EQT",
    "EFX","EQIX","EQR","ESS","EL","ETSY","ES","EXC","EXPE","EXPD","EXR","XOM","FDS","FICO",
    "FAST","FRT","FDX","FIS","FITB","FSLR","FE","FI","FLT","FMC","F","FTNT","FTV","FOXA","FOX",
    "BEN","FCX","GRMN","IT","GE","GEHC","GEV","GNRC","GD","GIS","GM","GPC","GILD","GPN","GS",
    "HAL","HIG","HAS","HCA","HSIC","HSY","HES","HPE","HLT","HOLX","HD","HON","HRL","HST","HWM",
    "HPQ","HUBB","HUM","HBAN","HII","IBM","IEX","IDXX","ITW","INCY","IR","PODD","INTC","ICE",
    "IFF","IP","IPG","INTU","ISRG","IVZ","INVH","IQV","IRM","JKHY","J","JBL","JPM","K","KDP",
    "KEY","KEYS","KMB","KIM","KMI","KLAC","KHC","KR","LHX","LH","LRCX","LW","LVS","LDOS","LEN",
    "LIN","LYV","LKQ","LMT","L","LOW","LULU","LYB","MTB","MRO","MPC","MKTX","MAR","MMC","MLM",
    "MAS","MA","MKC","MCD","MCK","MDT","MRK","META","MET","MTD","MGM","MCHP","MU","MSFT","MAA",
    "MRNA","MOH","TAP","MDLZ","MPWR","MNST","MCO","MS","MOS","MSI","MSCI","NDAQ","NTAP","NFLX",
    "NEM","NWSA","NWS","NEE","NKE","NI","NDSN","NSC","NTRS","NOC","NCLH","NRG","NUE","NVDA",
    "NVR","NXPI","ORLY","OXY","ODFL","OMC","ON","OKE","ORCL","OTIS","PCAR","PKG","PLTR","PH",
    "PAYX","PAYC","PYPL","PNR","PEP","PFE","PCG","PM","PSX","PNC","POOL","PPG","PPL","PFG","PG",
    "PGR","PLD","PRU","PEG","PTC","PSA","PHM","PWR","QCOM","DGX","RL","RJF","RTX","O","REG",
    "REGN","RF","RSG","RMD","RVTY","ROK","ROL","ROP","ROST","RCL","SPGI","CRM","SBAC","SLB",
    "STX","SRE","NOW","SHW","SPG","SJM","SW","SNA","SO","SWK","SBUX","STT","STLD","STE","SYK",
    "SMCI","SYF","SNPS","SYY","TMUS","TROW","TTWO","TPR","TRGP","TGT","TEL","TDY","TFX","TER",
    "TSLA","TXN","TPL","TXT","TMO","TJX","TSCO","TT","TDG","TRV","TRMB","TFC","TYL","TSN","USB",
    "UBER","UDR","UNP","UAL","UPS","URI","UNH","VLO","VTR","VRSN","VRSK","VZ","VRTX","VTRS",
    "VICI","V","VST","VMC","WAB","WMT","DIS","WBD","WM","WAT","WEC","WFC","WELL","WST","WDC",
    "WY","WHR","WMB","WTW","GWW","WYNN","XEL","XYL","YUM","ZBRA","ZBH","ZTS",
    "DECK","GEV","KVUE","SOLV","VLTO","CEG","VST","GDDY","EG","AXON","ERIE",
    "HUBB","LDOS","LW","MKL","PODD","PWR","TRMB","TTD","CRWD","PANW","SNOW",
]

_FALLBACK_NDX = [
    "ADSK","ANSS","BKNG","CDNS","DDOG","DXCM","EBAY","ENPH","EQIX","FAST",
    "FTNT","GEHC","GRMN","IDXX","ILMN","INCY","LRCX","LULU","MCHP","MDLZ",
    "MNST","MRNA","MSCI","NFLX","NXPI","ODFL","ORLY","PAYX","PCAR","PYPL",
    "REGN","ROST","SIRI","TEAM","TTD","VRSK","VRTX","WDAY","ZS","CRWD",
    "ABNB","COIN","RBLX","DKNG","ROKU","SHOP","NET","MDB","PANW","GTLB",
]


def get_sp500_tickers() -> list[str]:
    """Return S&P 500 + NASDAQ-100 tickers (deduplicated, no ETFs)."""
    sp500, ndx = [], []
    try:
        sp500 = _fetch_sp500_wiki()
        print(f"[INFO] 实时 S&P500: {len(sp500)} 只")
    except Exception as e:
        print(f"[WARN] S&P500 实时获取失败 ({e})，使用备用列表")
        sp500 = _FALLBACK_SP500[:]

    try:
        ndx = _fetch_nasdaq100_wiki()
        print(f"[INFO] 实时 NASDAQ-100: {len(ndx)} 只")
    except Exception as e:
        print(f"[WARN] NASDAQ-100 实时获取失败 ({e})，使用备用列表")
        ndx = _FALLBACK_NDX[:]

    all_tickers = sorted(set(sp500 + ndx))
    print(f"[INFO] NL screener 股票池: {len(all_tickers)} 只")
    return all_tickers


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
    tickers = list(set(get_sp500_tickers()) | set(_AI_WATCHLIST))
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
