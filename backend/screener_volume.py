"""
底部放量筛选器 — Bottom Volume Surge Screener

筛选条件：
  1. 股价 ≤ MA50（50日均线，处于下行趋势）
  2. 年初至今收益为负（YTD return < 0）
  3. 最近连续 2 天成交量 ≥ 20日均量 × 1.5x（底部放量信号）
  4. 市值 ≥ 5B 美元

股票池：S&P500 + NASDAQ-100 + ETF（约 600 只）
数据源：Yahoo Finance v8 Chart API，经 Cloudflare Worker 代理
"""

import json
import time
import datetime
import urllib.request
import urllib.error
import concurrent.futures
import threading

import requests
from urllib.parse import quote
from redis_client import set_volume_daily_snapshot

# ─── 核心参数 ────────────────────────────────────────────────────────
LOOKBACK_DAYS     = 200     # 拉取历史天数（含 MA50 + 缓冲）
MIN_MARKET_CAP    = 5e9     # 市值门槛 5B 美元
VOLUME_MULTIPLIER = 1.5     # 放量倍数
MA50_PERIOD       = 50
VOL_MA_PERIOD     = 20
CHART_LEN         = 60      # 图表显示最近 N 根 bar
MAX_WORKERS       = 8

# ─── ETF 列表（固定，不筛市值） ────────────────────────────────────────
ETF_LIST = [
    "SPY","QQQ","IWM","DIA","VOO","VTI","IVV","VEA","VWO","EFA",
    "XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU","XLB","XLRE","XLC",
    "ARKK","ARKW","ARKF","SMH","SOXX","IGV","CIBR",
    "TLT","HYG","LQD","GLD","SLV","USO","UNG",
    "TQQQ","SOXL","UPRO","TECL","COPX",
]
ETF_SET = set(ETF_LIST)

# ─── 股票池获取 ───────────────────────────────────────────────────────

def _fetch_sp500_wiki():
    """从 Wikipedia 实时抓取 S&P500 成分股。"""
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


def _fetch_nasdaq100_wiki():
    """从 GitHub CSV 或 Wikipedia 获取 NASDAQ-100 成分股。"""
    import re

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


def get_us_large_cap_tickers() -> list[str]:
    """返回 S&P500 + NASDAQ-100 + ETF 的去重 ticker 列表。"""
    sp500, ndx = [], []
    try:
        sp500 = _fetch_sp500_wiki()
        print(f"[INFO] 实时 S&P500: {len(sp500)} 只")
    except Exception as e:
        print(f"[WARN] S&P500 实时获取失败 ({e})，使用备用列表")
        sp500 = _FALLBACK_SP500

    try:
        ndx = _fetch_nasdaq100_wiki()
        print(f"[INFO] 实时 NASDAQ-100: {len(ndx)} 只")
    except Exception as e:
        print(f"[WARN] NASDAQ-100 实时获取失败 ({e})，使用备用列表")
        ndx = _FALLBACK_NDX

    all_tickers = sorted(set(
        [t.replace(".", "-") for t in sp500 + ndx + ETF_LIST if t]
    ))
    print(f"[INFO] 总股票池: {len(all_tickers)} 只（含 ETF {len(ETF_LIST)} 只）")
    return all_tickers


# ─── 数据拉取（Yahoo Finance v8 via CF Worker） ─────────────────────
CF_PROXY_BASE = "https://yahoo-proxy.hejintang.workers.dev/"
YAHOO_BASE    = "https://query1.finance.yahoo.com"

_session = requests.Session()
_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept":     "application/json",
})


def _proxy_url(path: str) -> str:
    return CF_PROXY_BASE + "?url=" + quote(YAHOO_BASE + path, safe="")


def fetch_ohlcv(ticker: str, days: int = LOOKBACK_DAYS):
    """返回 (rows, market_cap)。rows 为每日 OHLCV + date 字典列表。"""
    end   = int(time.time())
    start = end - days * 86400
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

    # 去重：移除尾部当天重复 bar（收盘前追加）
    if len(ts) >= 2:
        def to_day(t):
            d = datetime.datetime.utcfromtimestamp(t)
            return (d.year, d.month, d.day)
        if to_day(ts[-1]) == to_day(ts[-2]):
            ts      = ts[:-1]
            closes  = closes[:-1]
            opens   = opens[:-1] if opens else opens
            highs   = highs[:-1] if highs else highs
            lows    = lows[:-1] if lows else lows
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

    # 市值：优先从 chart meta 取，失败时回退 v7/quote
    market_cap = meta.get("marketCap", 0) or 0
    if market_cap == 0:
        try:
            qr = _session.get(
                _proxy_url(f"/v7/finance/quote?symbols={ticker}&fields=marketCap,totalAssets"),
                timeout=10,
            )
            qdata = qr.json().get("quoteResponse", {}).get("result", [])
            if qdata:
                market_cap = (
                    qdata[0].get("marketCap", 0)
                    or qdata[0].get("totalAssets", 0)
                    or 0
                )
        except Exception:
            pass

    return rows, market_cap


# ─── 筛选逻辑 ─────────────────────────────────────────────────────────

def screen_ticker(ticker: str) -> dict | None:
    try:
        rows, market_cap = fetch_ohlcv(ticker, LOOKBACK_DAYS)
    except Exception:
        return None

    if market_cap < MIN_MARKET_CAP:
        return None
    if len(rows) < MA50_PERIOD + 5:
        return None

    closes  = [r["close"]  for r in rows]
    volumes = [r["volume"] for r in rows]

    # ── 条件1：股价 ≤ MA50 ──
    ma50       = sum(closes[-MA50_PERIOD:]) / MA50_PERIOD
    last_close = closes[-1]
    if last_close > ma50:
        return None

    # ── 条件2：YTD 收益为负 ──
    current_year    = datetime.datetime.utcnow().year
    year_start_price = None
    for r in rows:
        if r["date"].startswith(str(current_year)):
            year_start_price = r["close"]
            break
    if year_start_price is None or year_start_price <= 0:
        return None
    ytd_return = (last_close - year_start_price) / year_start_price
    if ytd_return >= 0:
        return None

    # ── 条件3：连续 2 天放量 ≥ vol_MA20 × 1.5x ──
    if len(volumes) < VOL_MA_PERIOD + 2:
        return None
    # 用倒数第3天之前的均量，避免放量天数拉高基准
    vol_ma20  = sum(volumes[-(VOL_MA_PERIOD + 2):-2]) / VOL_MA_PERIOD
    last_vol  = volumes[-1]
    prev_vol  = volumes[-2]
    if vol_ma20 <= 0:
        return None
    vol_ratio  = last_vol  / vol_ma20
    vol_ratio2 = prev_vol  / vol_ma20
    if vol_ratio < VOLUME_MULTIPLIER or vol_ratio2 < VOLUME_MULTIPLIER:
        return None

    # ── 构建图表数据（最近 CHART_LEN 根） ──
    chart_rows = rows[-CHART_LEN:]
    chart_opens   = [r["open"]   for r in chart_rows]
    chart_highs   = [r["high"]   for r in chart_rows]
    chart_lows    = [r["low"]    for r in chart_rows]
    chart_closes  = [r["close"]  for r in chart_rows]
    chart_volumes = [r["volume"] for r in chart_rows]
    chart_dates   = [r["date"]   for r in chart_rows]

    # MA50 序列（对齐到 chart_rows）
    ma50_series = []
    for i in range(len(rows) - CHART_LEN, len(rows)):
        if i >= MA50_PERIOD - 1:
            ma50_series.append(sum(closes[i - MA50_PERIOD + 1 : i + 1]) / MA50_PERIOD)
        else:
            ma50_series.append(None)

    # Vol MA20 序列
    vol_ma20_series = []
    for i in range(len(rows) - CHART_LEN, len(rows)):
        if i >= VOL_MA_PERIOD - 1:
            vol_ma20_series.append(sum(volumes[i - VOL_MA_PERIOD + 1 : i + 1]) / VOL_MA_PERIOD)
        else:
            vol_ma20_series.append(None)

    return {
        "ticker":     ticker,
        "last_close": round(last_close, 2),
        "ma50":       round(ma50, 2),
        "ytd_return": round(ytd_return * 100, 2),   # 百分比
        "last_vol":   last_vol,
        "prev_vol":   prev_vol,
        "vol_ma20":   round(vol_ma20, 0),
        "vol_ratio":  round(vol_ratio, 2),
        "vol_ratio2": round(vol_ratio2, 2),
        "market_cap": market_cap,
        "chart": {
            "dates":    chart_dates,
            "open":     chart_opens,
            "high":     chart_highs,
            "low":      chart_lows,
            "close":    chart_closes,
            "volume":   chart_volumes,
            "ma50":     ma50_series,
            "vol_ma20": vol_ma20_series,
        },
    }


# ─── 主入口 ────────────────────────────────────────────────────────────

def run_volume_scan() -> dict:
    """
    执行完整扫描，返回结果字典（供 FastAPI 缓存到 Redis）。
    格式：{ "date": ..., "scan_time": ..., "results": [...], "params": {...} }
    """
    import zoneinfo
    tz_la  = zoneinfo.ZoneInfo("America/Los_Angeles")
    now_la = datetime.datetime.now(tz_la)

    tickers = get_us_large_cap_tickers()
    results = []
    lock    = threading.Lock()

    def worker(t):
        res = screen_ticker(t)
        if res:
            with lock:
                results.append(res)

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as exe:
        futures = [exe.submit(worker, t) for t in tickers]
        concurrent.futures.wait(futures)

    # 按放量倍数降序排列
    results.sort(key=lambda x: x["vol_ratio"], reverse=True)

    date_str = now_la.strftime("%Y-%m-%d")

    # ── Daily snapshot for backtesting ────────────────────────
    snapshot_entries = [
        {
            "ticker":     r["ticker"],
            "price":      r["last_close"],
            "vol_ratio":  r["vol_ratio"],
            "vol_ratio2": r["vol_ratio2"],
            "ytd_return": r["ytd_return"],
        }
        for r in results
    ]
    set_volume_daily_snapshot(date_str, snapshot_entries)

    return {
        "date":      date_str,
        "scan_time": now_la.strftime("%Y-%m-%d %H:%M:%S %Z"),
        "results":   results,
        "params": {
            "volume_multiplier": VOLUME_MULTIPLIER,
            "ma50_period":       MA50_PERIOD,
            "vol_ma_period":     VOL_MA_PERIOD,
            "min_market_cap_b":  MIN_MARKET_CAP / 1e9,
        },
    }
