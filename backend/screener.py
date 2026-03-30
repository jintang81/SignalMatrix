"""
MACD / RSI 底背离筛选器 - 美股（做多信号）

筛选条件：
  1. 股票池：S&P500 + NASDAQ-100 成分股 + 主要 ETF（约 556 只）
  2. 底背离（任一满足即触发）：
     MACD 底背离：价格创新低，DIFF 不创新低，两底间隔 20~100 根，第二底绿柱缩短 ≥ 20%
     RSI  底背离：价格创新低，RSI  不创新低，两底间隔 10~30  根，第二底 RSI < 35（超卖区）
  3. 第二个底必须在最近 5 根 K 线内形成

数据源：Yahoo Finance v8 Chart API，经 Cloudflare Worker 代理
        https://yahoo-proxy.hejintang.workers.dev/
"""

import pandas as pd
import numpy as np
import json
import requests
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# ─────────────────────────────────────────────
# 参数配置
# ─────────────────────────────────────────────
MACD_FAST        = 12
MACD_SLOW        = 26
MACD_SIGNAL      = 9
RSI_PERIOD       = 14
LOOKBACK_DAYS    = 200
MIN_MARKET_CAP   = 5e9

MACD_DIV_MIN_BARS = 20
MACD_DIV_MAX_BARS = 100

RSI_DIV_MIN_BARS  = 10
RSI_DIV_MAX_BARS  = 30

RSI_OVERSOLD      = 35
MACD_HIST_SHRINK  = 0.2
RECENT_BARS       = 8
TROUGH_LOOKBACK   = 3
MAX_WORKERS       = 8


# ─────────────────────────────────────────────
# 数据获取
# ─────────────────────────────────────────────
CF_PROXY_BASE = "https://yahoo-proxy.hejintang.workers.dev/"
YAHOO_BASE    = "https://query1.finance.yahoo.com"

_session = requests.Session()
_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
})

def _proxy_url(path):
    from urllib.parse import quote
    return CF_PROXY_BASE + "?url=" + quote(YAHOO_BASE + path, safe="")

def fetch_history(ticker, start, end):
    start_ts = int(start.timestamp())
    end_ts   = int(end.timestamp())
    path = f"/v8/finance/chart/{ticker}?interval=1d&period1={start_ts}&period2={end_ts}&events=history"
    r = _session.get(_proxy_url(path), timeout=20)
    r.raise_for_status()
    data = r.json()
    result = data.get("chart", {}).get("result", [])
    if not result:
        raise ValueError(f"Yahoo API 无数据: {ticker}")
    res        = result[0]
    timestamps = res.get("timestamp", [])
    quotes     = res.get("indicators", {}).get("quote", [{}])[0]
    adjclose   = res.get("indicators", {}).get("adjclose", [{}])[0].get("adjclose", [])
    if not timestamps or not adjclose:
        raise ValueError(f"Yahoo API 返回空: {ticker}")
    # 去重：按 timestamp 日期比较，移除收盘后追加的同日重复 bar
    if len(timestamps) >= 2:
        import datetime as _dt
        def to_day(t):
            d = _dt.datetime.utcfromtimestamp(t)
            return (d.year, d.month, d.day)
        if to_day(timestamps[-1]) == to_day(timestamps[-2]):
            timestamps = timestamps[:-1]
            for key in ["open", "high", "low", "volume"]:
                if quotes.get(key): quotes[key] = quotes[key][:-1]
            adjclose = adjclose[:-1]
    dates = pd.to_datetime(timestamps, unit="s", utc=True).tz_convert("America/New_York").normalize()
    df = pd.DataFrame({
        "Open":   quotes.get("open",   [None]*len(timestamps)),
        "High":   quotes.get("high",   [None]*len(timestamps)),
        "Low":    quotes.get("low",    [None]*len(timestamps)),
        "Close":  adjclose,
        "Volume": quotes.get("volume", [None]*len(timestamps)),
    }, index=dates)
    df.index.name = "Date"
    df = df.dropna(subset=["Close"])
    df = df[df["Close"] > 0]
    df = df.sort_index()
    pct_change = round(float((df["Close"].iloc[-1] - df["Close"].iloc[-2]) / df["Close"].iloc[-2] * 100), 2) if len(df) >= 2 else 0.0
    meta = res.get("meta", {})
    market_cap = meta.get("marketCap", 0) or meta.get("totalAssets", 0) or 0
    # Fallback: sharesOutstanding × regularMarketPrice
    if not market_cap:
        shares = meta.get("sharesOutstanding") or 0
        price  = meta.get("regularMarketPrice") or meta.get("chartPreviousClose") or 0
        market_cap = int(shares * price) if (shares and price) else 0
    return df, pct_change, market_cap


# ─────────────────────────────────────────────
# 股票列表
# ─────────────────────────────────────────────

ETF_LIST = [
    "SPY","QQQ","IWM","DIA","VOO","VTI","IVV","VEA","VWO","EFA",
    "XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU","XLB","XLRE","XLC",
    "ARKK","ARKW","ARKF","SMH","SOXX","IGV","CIBR",
    "TLT","HYG","LQD","GLD","SLV","USO","UNG",
    "TQQQ","SOXL","UPRO","TECL",
]

def _fetch_sp500_wiki():
    import urllib.request, html.parser

    class TableParser(html.parser.HTMLParser):
        def __init__(self):
            super().__init__()
            self.in_first_table = False
            self.row = []
            self.rows = []
            self.col_idx = None
            self.header_done = False
            self.td_text = ''
            self.in_td = False
            self.table_count = 0

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == 'table' and 'wikitable' in attrs.get('class', ''):
                self.table_count += 1
                if self.table_count == 1:
                    self.in_first_table = True
            if self.in_first_table and tag in ('td', 'th'):
                self.in_td = True
                self.td_text = ''

        def handle_endtag(self, tag):
            if tag == 'table' and self.in_first_table:
                self.in_first_table = False
            if self.in_first_table and tag in ('td', 'th'):
                self.in_td = False
                self.row.append(self.td_text.strip())
            if self.in_first_table and tag == 'tr':
                if not self.header_done:
                    for i, h in enumerate(self.row):
                        if 'Symbol' in h or 'Ticker' in h:
                            self.col_idx = i
                    self.header_done = True
                else:
                    if self.col_idx is not None and len(self.row) > self.col_idx:
                        self.rows.append(self.row[self.col_idx])
                self.row = []

        def handle_data(self, data):
            if self.in_td:
                self.td_text += data

    url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        html_content = resp.read().decode('utf-8')
    parser = TableParser()
    parser.feed(html_content)
    tickers = [t.replace('.', '-') for t in parser.rows if t and t != 'Symbol']
    if len(tickers) < 400:
        raise ValueError(f'只解析到 {len(tickers)} 个 ticker，可能解析失败')
    return tickers


def _fetch_nasdaq100_wiki():
    import urllib.request

    csv_urls = [
        'https://raw.githubusercontent.com/datasets/nasdaq-100/main/data/nasdaq-100.csv',
        'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_screener.csv',
    ]
    for csv_url in csv_urls:
        try:
            req = urllib.request.Request(csv_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                lines = resp.read().decode('utf-8').splitlines()
            if not lines:
                continue
            header = [h.strip().strip('"').lower() for h in lines[0].split(',')]
            col = next((i for i, h in enumerate(header) if h in ('symbol','ticker','code')), None)
            if col is None:
                continue
            tickers = []
            for line in lines[1:]:
                parts = line.split(',')
                if len(parts) > col:
                    t = parts[col].strip().strip('"').replace('.', '-')
                    if t and t.upper() == t and len(t) <= 5:
                        tickers.append(t)
            if len(tickers) >= 80:
                return tickers
        except Exception:
            continue

    url = 'https://en.wikipedia.org/wiki/Nasdaq-100'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        content = resp.read().decode('utf-8')

    import re
    table_starts = [m.start() for m in re.finditer(r'class="[^"]*wikitable', content)]
    ticker_pattern = re.compile(r'^[A-Z]{1,5}$')

    for t_start in table_starts:
        t_end = content.find('</table>', t_start)
        table_html = content[t_start:t_end]
        ths = re.findall(r'<th[^>]*>(.*?)</th>', table_html, re.DOTALL | re.IGNORECASE)
        ths_clean = [re.sub(r'<[^>]+>', '', t).strip().lower() for t in ths]
        ticker_col = next(
            (i for i, h in enumerate(ths_clean)
             if any(kw in h for kw in ('ticker', 'symbol', 'code'))),
            None
        )
        if ticker_col is None:
            rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL | re.IGNORECASE)
            tickers = []
            for row in rows:
                tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
                if tds:
                    first = re.sub(r'<[^>]+>', '', tds[0]).strip().replace('.', '-')
                    if ticker_pattern.match(first):
                        tickers.append(first)
            if len(tickers) >= 80:
                return tickers
            continue

        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL | re.IGNORECASE)
        tickers = []
        for row in rows:
            tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
            if len(tds) > ticker_col:
                t = re.sub(r'<[^>]+>', '', tds[ticker_col]).strip().replace('.', '-')
                if ticker_pattern.match(t):
                    tickers.append(t)
        if len(tickers) >= 80:
            return tickers

    raise ValueError('所有数据源均失败，使用兜底列表')


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

def get_us_large_cap_tickers():
    sp500 = []
    ndx   = []

    try:
        sp500 = _fetch_sp500_wiki()
        print(f"[INFO] 实时获取 S&P500: {len(sp500)} 只")
    except Exception as e:
        print(f"[WARN] S&P500 实时获取失败（{e}），使用兜底列表")
        sp500 = _FALLBACK_SP500

    try:
        ndx = _fetch_nasdaq100_wiki()
        print(f"[INFO] 实时获取 NASDAQ-100: {len(ndx)} 只")
    except Exception as e:
        print(f"[WARN] NASDAQ-100 实时获取失败（{e}），使用兜底列表")
        ndx = _FALLBACK_NDX

    all_tickers = sorted(set(
        [t.replace(".", "-") for t in sp500 + ndx + ETF_LIST if t]
    ))
    print(f"[INFO] 候选股票总数: {len(all_tickers)}（含 ETF {len(ETF_LIST)} 只）")
    return all_tickers


ETF_SET = set(ETF_LIST)


# ─────────────────────────────────────────────
# 指标计算
# ─────────────────────────────────────────────

def calc_ema(series, period):
    return series.ewm(span=period, adjust=False).mean()

def calc_macd(close):
    ema_fast  = calc_ema(close, MACD_FAST)
    ema_slow  = calc_ema(close, MACD_SLOW)
    diff      = ema_fast - ema_slow
    dea       = calc_ema(diff, MACD_SIGNAL)
    histogram = (diff - dea) * 2
    return diff, dea, histogram

def calc_rsi(close, period=RSI_PERIOD):
    delta  = close.diff()
    gain   = delta.clip(lower=0)
    loss   = (-delta).clip(lower=0)
    avg_g  = gain.ewm(com=period - 1, adjust=False).mean()
    avg_l  = loss.ewm(com=period - 1, adjust=False).mean()
    rs     = avg_g / avg_l.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


# ─────────────────────────────────────────────
# 底部识别 + 背离检测
# ─────────────────────────────────────────────

def find_troughs(series, lb=TROUGH_LOOKBACK):
    arr     = series.values
    n       = len(arr)
    troughs = []
    for i in range(lb, n - lb):
        window = arr[i - lb: i + lb + 1]
        if arr[i] == window.min() and arr[i] <= arr[i - 1] and arr[i] <= arr[i + 1]:
            troughs.append(i)
    return troughs


def _base_divergence(close, indicator, min_bars, max_bars):
    price_arr     = close.values
    indic_arr     = indicator.values
    n             = len(price_arr)
    price_troughs = find_troughs(close)

    def nearest_indic_trough(center):
        lo = max(0, center - 8)
        hi = min(n - 1, center + 8)
        window_idx = range(lo, hi + 1)
        best_i = min(window_idx, key=lambda i: indic_arr[i])
        return best_i, indic_arr[best_i]

    results = []

    for b2 in price_troughs:
        if b2 < n - RECENT_BARS:
            continue
        for b1 in price_troughs:
            gap = b2 - b1
            if not (min_bars <= gap <= max_bars):
                continue
            if price_arr[b2] >= price_arr[b1]:
                continue
            if b2 > b1 + 1:
                between_low = price_arr[b1 + 1: b2].min()
                if between_low < price_arr[b2] * 0.95:
                    continue
            i1_idx, i1_val = nearest_indic_trough(b1)
            i2_idx, i2_val = nearest_indic_trough(b2)
            if i2_val <= i1_val:
                continue
            price_drop = (price_arr[b1] - price_arr[b2]) / price_arr[b1] * 100
            results.append({
                "b1": b1, "b2": b2,
                "i1_idx": i1_idx, "i2_idx": i2_idx,
                "price_b1":   round(float(price_arr[b1]), 2),
                "price_b2":   round(float(price_arr[b2]), 2),
                "indic_b1":   round(float(i1_val), 4),
                "indic_b2":   round(float(i2_val), 4),
                "gap_bars":   gap,
                "price_drop_pct": round(price_drop, 2),
                "indic_rise": round(float(i2_val - i1_val), 4),
                "bars_ago":   n - 1 - b2,
            })
    return results, indic_arr, price_arr


def detect_macd_divergence(close, diff, hist):
    pairs, diff_arr, price_arr = _base_divergence(close, diff, MACD_DIV_MIN_BARS, MACD_DIV_MAX_BARS)
    hist_arr = hist.values

    def min_hist_near(center):
        lo, hi = max(0, center - 5), min(len(hist_arr) - 1, center + 5)
        window = hist_arr[lo: hi + 1]
        neg    = window[window < 0]
        if len(neg) == 0:
            return None
        return float(np.min(np.abs(neg)))

    best = None
    for p in pairs:
        b1, b2 = p["b1"], p["b2"]
        if b2 > b1 + 1:
            between_diff_min = diff_arr[b1 + 1: b2].min()
            if between_diff_min < diff_arr[b1]:
                continue
        h1 = min_hist_near(b1)
        h2 = min_hist_near(b2)
        if h1 is None or h2 is None:
            continue
        if h2 > h1 * (1 - MACD_HIST_SHRINK):
            continue
        shrink_pct = round((1 - h2 / h1) * 100, 1)
        entry = {**p, "hist_b1": round(h1, 4), "hist_b2": round(h2, 4),
                 "hist_shrink_pct": shrink_pct, "label": "MACD"}
        if best is None or p["b2"] > best["b2"]:
            best = entry

    return (True, best) if best else (False, {})


def detect_rsi_divergence(close, rsi):
    pairs, rsi_arr, price_arr = _base_divergence(close, rsi, RSI_DIV_MIN_BARS, RSI_DIV_MAX_BARS)

    best = None
    for p in pairs:
        b1, b2 = p["b1"], p["b2"]
        if p["indic_b2"] >= RSI_OVERSOLD:
            continue
        if b2 > b1 + 1:
            between_rsi_min = rsi_arr[b1 + 1: b2].min()
            if between_rsi_min < rsi_arr[b1]:
                continue
        entry = {**p, "label": "RSI"}
        if best is None or b2 > best["b2"]:
            best = entry

    return (True, best) if best else (False, {})


# ─────────────────────────────────────────────
# 单股筛选
# ─────────────────────────────────────────────

def screen_ticker(ticker, verbose=False):
    """返回 dict（命中）或 str（拒绝原因）"""
    try:
        end   = datetime.today()
        start = end - timedelta(days=LOOKBACK_DAYS)
        df, pct_change, market_cap = fetch_history(ticker, start, end)

        if df is None or len(df) < 60:
            if verbose: print(f"  [{ticker}] ✗ 数据不足")
            return "no_data"

        close           = df["Close"]
        diff, dea, hist = calc_macd(close)
        rsi             = calc_rsi(close)

        macd_div, macd_detail = detect_macd_divergence(close, diff, hist)
        rsi_div,  rsi_detail  = detect_rsi_divergence(close, rsi)

        if not macd_div and not rsi_div:
            return "no_div"

        triggered = []
        details   = {}
        if macd_div:
            triggered.append("MACD")
            details["macd"] = macd_detail
        if rsi_div:
            triggered.append("RSI")
            details["rsi"] = rsi_detail

        volume     = df["Volume"]
        vol_recent = volume.iloc[-3:].mean()
        vol_avg20  = volume.iloc[-23:-3].mean()
        vol_ratio  = round(vol_recent / vol_avg20, 2) if vol_avg20 > 0 else 0

        rsi_latest = round(float(rsi.iloc[-1]), 1)

        chart_len  = 120
        chart_data = {
            "dates":  [str(d.date()) for d in df.index[-chart_len:]],
            "open":   [round(float(v), 2) for v in df["Open"].iloc[-chart_len:]],
            "high":   [round(float(v), 2) for v in df["High"].iloc[-chart_len:]],
            "low":    [round(float(v), 2) for v in df["Low"].iloc[-chart_len:]],
            "close":  [round(float(v), 2) for v in close.iloc[-chart_len:]],
            "volume": [int(v) for v in volume.iloc[-chart_len:]],
            "diff":   [round(float(v), 4) for v in diff.iloc[-chart_len:]],
            "dea":    [round(float(v), 4) for v in dea.iloc[-chart_len:]],
            "hist":   [round(float(v), 4) for v in hist.iloc[-chart_len:]],
            "rsi":    [round(float(v), 2) for v in rsi.iloc[-chart_len:]],
        }

        if verbose: print(f"  [{ticker}] ✅ 触发: {'+'.join(triggered)}, 价格={close.iloc[-1]:.2f}, 涨跌={pct_change:+.2f}%")
        return {
            "ticker":     ticker,
            "is_etf":     ticker in ETF_SET,
            "price":      round(float(close.iloc[-1]), 2),
            "pct_change": pct_change,
            "mktcap_b":   round(market_cap / 1e9, 1) if market_cap else None,
            "vol_ratio":  vol_ratio,
            "rsi_latest": rsi_latest,
            "triggered":  triggered,
            "details":    details,
            "chart":      chart_data,
        }

    except Exception as e:
        if verbose: print(f"  [{ticker}] 异常: {e}")
        return str(e)[:80]


# ─────────────────────────────────────────────
# 全量扫描（FastAPI 后台任务入口）
# ─────────────────────────────────────────────

def run_full_scan() -> dict:
    """Screens all tickers and returns a DivergenceScreenerResult dict."""
    tickers = get_us_large_cap_tickers()
    results = []
    lock    = threading.Lock()

    def worker(ticker):
        r = screen_ticker(ticker)
        if isinstance(r, dict):
            with lock:
                results.append(r)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(worker, t): t for t in tickers}
        for _ in as_completed(futures):
            pass

    results.sort(key=lambda s: (-(s.get("mktcap_b") or 0), -len(s["triggered"])))
    return {
        "date": str(datetime.today().date()),
        "stocks": results,
    }
