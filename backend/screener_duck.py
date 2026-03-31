"""
MACD 正鸭嘴形筛选器 — Duck Bill Screener

筛选条件：
  1. 股票池：S&P500 + NASDAQ-100 + 主要 ETF（约 556 只）
  2. 均线多头排列：MA5 > MA10 > MA20
  3. MACD 正鸭嘴三段式形成（以最近金叉为起点）：
     Phase A  金叉后连续 3 根 MACD 柱递增（正柱扩张）
     Phase B  DIFF 回调趋近 DEA（差值 / 价格 < 1.5%），但不死叉
     Phase C  再次上行，开口角度 > 25°，DEA/DIFF 变化比 ≤ 0.65（非平行上行）
  4. Phase B 结束距今 ≤ 3 根交易日（形成足够新鲜）
  5. 全程 DIFF > DEA（金叉后不再死叉），最近 5 根在 0 轴上方
"""

import json
import math
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import requests

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

# ─── 核心参数 ─────────────────────────────────────────────────────
MACD_FAST      = 12
MACD_SLOW      = 26
MACD_SIGNAL    = 9
LOOKBACK_DAYS  = 120
DUCK_WINDOW    = 35
NEAR_THRESHOLD = 0.015   # Phase B 趋近 DEA 的容忍度（1.5% 价格幅度）
MAX_WORKERS    = 8

# ─── 股票池 ───────────────────────────────────────────────────────

ETF_LIST = [
    "SPY","QQQ","IWM","DIA","VOO","VTI","IVV","VEA","VWO","EFA",
    "XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU","XLB","XLRE","XLC",
    "ARKK","ARKW","ARKF","SMH","SOXX","IGV","CIBR",
    "TLT","HYG","LQD","GLD","SLV","USO","UNG",
    "TQQQ","SOXL","UPRO","TECL",
]
ETF_SET = set(ETF_LIST)

def _fetch_sp500_wiki():
    import urllib.request, html.parser
    class TableParser(html.parser.HTMLParser):
        def __init__(self):
            super().__init__()
            self.in_first_table = False
            self.row = []; self.rows = []
            self.col_idx = None; self.header_done = False
            self.td_text = ''; self.in_td = False; self.table_count = 0
        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == 'table' and 'wikitable' in attrs.get('class', ''):
                self.table_count += 1
                if self.table_count == 1: self.in_first_table = True
            if self.in_first_table and tag in ('td', 'th'):
                self.in_td = True; self.td_text = ''
        def handle_endtag(self, tag):
            if tag == 'table' and self.in_first_table: self.in_first_table = False
            if self.in_first_table and tag in ('td', 'th'):
                self.in_td = False; self.row.append(self.td_text.strip())
            if self.in_first_table and tag == 'tr':
                if not self.header_done:
                    for i, h in enumerate(self.row):
                        if 'Symbol' in h or 'Ticker' in h: self.col_idx = i
                    self.header_done = True
                else:
                    if self.col_idx is not None and len(self.row) > self.col_idx:
                        self.rows.append(self.row[self.col_idx])
                self.row = []
        def handle_data(self, data):
            if self.in_td: self.td_text += data
    url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        html_content = resp.read().decode('utf-8')
    parser = TableParser(); parser.feed(html_content)
    tickers = [t.replace('.', '-') for t in parser.rows if t and t != 'Symbol']
    if len(tickers) < 400: raise ValueError(f'只解析到 {len(tickers)} 个 ticker')
    return tickers

def _fetch_nasdaq100_wiki():
    import urllib.request, re
    csv_urls = [
        'https://raw.githubusercontent.com/datasets/nasdaq-100/main/data/nasdaq-100.csv',
        'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_screener.csv',
    ]
    for csv_url in csv_urls:
        try:
            req = urllib.request.Request(csv_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                lines = resp.read().decode('utf-8').splitlines()
            if not lines: continue
            header = [h.strip().strip('"').lower() for h in lines[0].split(',')]
            col = next((i for i, h in enumerate(header) if h in ('symbol','ticker','code')), None)
            if col is None: continue
            tickers = []
            for line in lines[1:]:
                parts = line.split(',')
                if len(parts) > col:
                    t = parts[col].strip().strip('"').replace('.', '-')
                    if t and t.upper() == t and len(t) <= 5: tickers.append(t)
            if len(tickers) >= 80: return tickers
        except Exception: continue
    url = 'https://en.wikipedia.org/wiki/Nasdaq-100'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        content = resp.read().decode('utf-8')
    table_starts = [m.start() for m in re.finditer(r'class="[^"]*wikitable', content)]
    ticker_pattern = re.compile(r'^[A-Z]{1,5}$')
    for t_start in table_starts:
        t_end = content.find('</table>', t_start)
        table_html = content[t_start:t_end]
        ths = re.findall(r'<th[^>]*>(.*?)</th>', table_html, re.DOTALL | re.IGNORECASE)
        ths_clean = [re.sub(r'<[^>]+>', '', t).strip().lower() for t in ths]
        ticker_col = next((i for i, h in enumerate(ths_clean) if any(kw in h for kw in ('ticker','symbol','code'))), None)
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL | re.IGNORECASE)
        tickers = []
        for row in rows:
            tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
            col_i = ticker_col if ticker_col is not None else 0
            if len(tds) > col_i:
                t = re.sub(r'<[^>]+>', '', tds[col_i]).strip().replace('.', '-')
                if ticker_pattern.match(t): tickers.append(t)
        if len(tickers) >= 80: return tickers
    raise ValueError('所有数据源均失败')

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
        print(f"[WARN] S&P500 实时获取失败（{e}），使用备用列表")
        sp500 = _FALLBACK_SP500
    try:
        ndx = _fetch_nasdaq100_wiki()
        print(f"[INFO] 实时获取 NASDAQ-100: {len(ndx)} 只")
    except Exception as e:
        print(f"[WARN] NASDAQ-100 实时获取失败（{e}），使用备用列表")
        ndx = _FALLBACK_NDX
    all_tickers = sorted(set([t.replace(".", "-") for t in sp500 + ndx + ETF_LIST if t]))
    print(f"[INFO] 选取股票总数: {len(all_tickers)}（含 ETF {len(ETF_LIST)} 只）")
    return all_tickers

# ─── 指标计算 ─────────────────────────────────────────────────────

def calc_ema(series, period):
    return series.ewm(span=period, adjust=False).mean()

def calc_macd(close):
    ema_fast  = calc_ema(close, MACD_FAST)
    ema_slow  = calc_ema(close, MACD_SLOW)
    diff      = ema_fast - ema_slow
    dea       = calc_ema(diff, MACD_SIGNAL)
    histogram = (diff - dea) * 2
    return diff, dea, histogram

def calc_ma(close, period):
    return close.rolling(period).mean()

# ─── 正鸭嘴形态检测 ───────────────────────────────────────────────

def detect_duck_bill(diff, dea, hist, close, window=DUCK_WINDOW, verbose=False):
    """
    正鸭嘴形态检测（0 轴上方，前哨信号）。
    返回 (bool, detail_dict)
    """
    def reject(reason):
        if verbose: print(f"    ✗ {reason}")
        return False, {}

    n = len(diff)
    if n < window + 10:
        return reject("数据不足")

    all_d = diff.values
    all_s = dea.values
    all_h = hist.values
    all_c = close.values

    # 找最近一次金叉（DIFF 上穿 DEA）
    golden_cross_idx = -1
    for i in range(n - 1, max(n - window - 1, 0), -1):
        if all_d[i] > all_s[i] and all_d[i-1] <= all_s[i-1]:
            golden_cross_idx = i
            break

    if golden_cross_idx < 0:
        return reject(f"最近{window}根内无金叉")

    d = all_d[golden_cross_idx:]
    s = all_s[golden_cross_idx:]
    h = all_h[golden_cross_idx:]
    c = all_c[golden_cross_idx:]
    w = len(d)

    if verbose:
        print(f"    金叉位置: 距今{n-1-golden_cross_idx}根，金叉后段{w}根")

    if w < 7:
        return reject(f"金叉后段仅{w}根，不足7根")

    # 金叉后全程不能死叉
    if np.any(d <= s):
        cross_bars = [i for i in range(w) if d[i] <= s[i]]
        return reject(f"金叉后在 i={cross_bars} 处出现死叉")

    # 最近 5 根必须在 0 轴上方
    if not (np.all(d[-5:] > 0) and np.all(s[-5:] > 0)):
        return reject(f"最近5根未在全在0轴上方")

    # Phase A：金叉后找连续 3 根 hist 递增（正值扩大），取最近满足的位置
    phase_a_end = -1
    for i in range(2, w - 4):
        if h[i] > h[i-1] > h[i-2] and h[i] > 0:
            phase_a_end = i
    if phase_a_end < 0:
        if verbose: print(f"    ✗ Phase A未找到，hist末段: {[round(x,3) for x in h[-8:]]}")
        return False, {}
    if verbose: print(f"    ✓ Phase A end=i{phase_a_end}（距今{w-1-phase_a_end}根）")

    # Phase B：回调段，hist 正值缩小，DIFF 曾趋近 DEA
    phase_b_start = phase_a_end + 1
    phase_b_end   = -1
    min_gap_ratio = np.inf

    for i in range(phase_b_start, w - 1):
        gap_ratio = (d[i] - s[i]) / c[i]
        min_gap_ratio = min(min_gap_ratio, gap_ratio)
        if h[i] < h[i-1]:  # hist 正值缩小 = 回调中
            phase_b_end = i

    if phase_b_end < 0:
        return reject("Phase B未找到（无 hist正值缩小的回调）")
    if verbose: print(f"    ✓ Phase B end=i{phase_b_end}（距今{w-1-phase_b_end}根），min_gap={min_gap_ratio*100:.3f}%")

    if min_gap_ratio > NEAR_THRESHOLD:
        return reject(f"回调未趋近DEA: min_gap={min_gap_ratio*100:.3f}% > {NEAR_THRESHOLD*100}%")

    # Phase B 之后全程在 0 轴上方
    if not (np.all(d[phase_b_end:] > 0) and np.all(s[phase_b_end:] > 0)):
        return reject("Phase B后穿越0轴")

    # Phase C：再次上行
    if phase_b_end >= w - 1:
        return reject("Phase B在最后一根，无 Phase C空间")

    if not (h[w-1] > h[w-2] > 0):
        return reject(f"Phase C正柱未递增: h[-1]={h[w-1]:.3f}, h[-2]={h[w-2]:.3f}")

    if d[w-1] <= d[phase_b_end]:
        return reject(f"DIFF未重新上行: {d[w-1]:.4f} <= {d[phase_b_end]:.4f}")

    bars_since_reversal = (w - 1) - phase_b_end
    if bars_since_reversal > 3:
        return reject(f"时间条件失败: bars_since_reversal={bars_since_reversal} > 3")

    # 开口角度：Phase C 整段 DIFF 上行幅度 > DEA 上行幅度
    price_ref = c[-1]
    if price_ref <= 0:
        return reject("价格无效")

    phase_c_start = phase_b_end
    phase_c_len   = w - phase_c_start
    if phase_c_len < 2:
        return reject("Phase C长度不足2根")

    diff_change_c = d[-1] - d[phase_c_start]
    dea_change_c  = s[-1] - s[phase_c_start]
    open_gap      = diff_change_c - dea_change_c

    if open_gap <= 0:
        return reject(f"开口未扩大: open_gap={open_gap:.4f}")

    diff_abs = abs(diff_change_c)
    dea_abs  = abs(dea_change_c)
    if diff_abs <= 0:
        return reject("DIFF无变化")

    ratio = dea_abs / diff_abs
    if ratio > 0.65:
        return reject(f"两线近平行上行: DEA/DIFF比={ratio:.2f} > 0.65")

    avg_diverge_per_bar = open_gap / (phase_c_len * price_ref)
    angle_deg = round(math.degrees(math.atan(avg_diverge_per_bar * 1000)), 1)
    MIN_ANGLE = math.tan(math.radians(25))
    if avg_diverge_per_bar * 1000 < MIN_ANGLE:
        return reject(f"开口角度不足: {angle_deg}° < 25°")

    if verbose:
        print(f"    ✓ 开口角度={angle_deg}°, DEA/DIFF比={ratio:.2f}, bars={bars_since_reversal}")

    detail = {
        "diff_latest":         round(float(d[-1]), 4),
        "dea_latest":          round(float(s[-1]), 4),
        "hist_latest":         round(float(h[-1]), 4),
        "gap_ratio_min":       round(float(min_gap_ratio * 100), 3),
        "bars_since_reversal": int(bars_since_reversal),
        "diverge_angle":       angle_deg,
    }
    return True, detail


def check_ma_bullish(close):
    """MA5 > MA10 > MA20 多头排列（最新一根K线）"""
    ma5  = calc_ma(close, 5).iloc[-1]
    ma10 = calc_ma(close, 10).iloc[-1]
    ma20 = calc_ma(close, 20).iloc[-1]
    return ma5 > ma10 > ma20, round(float(ma5), 2), round(float(ma10), 2), round(float(ma20), 2)

# ─── 数据获取 ─────────────────────────────────────────────────────

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

    # 去重：同一日期保留最新一条
    if len(timestamps) >= 2:
        def to_day(t):
            import datetime as _dt
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
    return df, pct_change

def get_market_cap(ticker):
    """通过 /v7/finance/quote 获取市值（Worker 带 crumb 此接口可用）。"""
    try:
        path = f"/v7/finance/quote?symbols={ticker}&fields=marketCap,totalAssets"
        r    = _session.get(_proxy_url(path), timeout=10)
        r.raise_for_status()
        data   = r.json()
        result = data.get("quoteResponse", {}).get("result", [])
        if not result:
            return 0
        q      = result[0]
        mktcap = q.get("marketCap", 0) or q.get("totalAssets", 0) or 0
        return mktcap
    except Exception:
        return 0

# ─── 单股筛选 ─────────────────────────────────────────────────────

def screen_ticker(ticker, verbose=False):
    """返回 dict（命中）或 str（淘汰原因 / 异常）。"""
    try:
        end   = datetime.today()
        start = end - timedelta(days=LOOKBACK_DAYS)
        df, pct_change = fetch_history(ticker, start, end)

        if df is None or len(df) < 60:
            if verbose: print(f"  [{ticker}] ✗ 数据不足")
            return "no_data"

        close  = df["Close"]
        volume = df["Volume"]
        diff, dea, hist = calc_macd(close)

        if verbose: print(f"  [{ticker}] 检测正鸭嘴...")
        is_duck, duck_detail = detect_duck_bill(diff, dea, hist, close, verbose=verbose)
        if not is_duck:
            return "no_duck"

        is_bull, ma5, ma10, ma20 = check_ma_bullish(close)
        if not is_bull:
            if verbose: print(f"  [{ticker}] ✗ 非多头排列: MA5={ma5}, MA10={ma10}, MA20={ma20}")
            return "no_ma"

        vol_recent = volume.iloc[-3:].mean()
        vol_avg20  = volume.iloc[-23:-3].mean()
        vol_ratio  = round(vol_recent / vol_avg20, 2) if vol_avg20 > 0 else 0

        chart_len = 60
        chart_data = {
            "dates":  [str(d.date()) for d in df.index[-chart_len:]],
            "open":   [round(float(v), 2) for v in df["Open"].iloc[-chart_len:]],
            "high":   [round(float(v), 2) for v in df["High"].iloc[-chart_len:]],
            "low":    [round(float(v), 2) for v in df["Low"].iloc[-chart_len:]],
            "close":  [round(float(v), 2) for v in close.iloc[-chart_len:]],
            "volume": [int(v) for v in df["Volume"].iloc[-chart_len:]],
            "diff":   [round(float(v), 4) for v in diff.iloc[-chart_len:]],
            "dea":    [round(float(v), 4) for v in dea.iloc[-chart_len:]],
            "hist":   [round(float(v), 4) for v in hist.iloc[-chart_len:]],
        }

        bars = duck_detail["bars_since_reversal"]
        reversal_date = str(df.index[-(bars + 1)].date()) if bars + 1 <= len(df) else "—"
        duck_detail["reversal_date"] = reversal_date

        if verbose: print(f"  [{ticker}] ✓ 确认，价格={close.iloc[-1]:.2f}, 涨跌={pct_change:+.2f}%")
        return {
            "ticker":     ticker,
            "is_etf":     ticker in ETF_SET,
            "price":      round(float(close.iloc[-1]), 2),
            "pct_change": pct_change,
            "mktcap_b":   round(get_market_cap(ticker) / 1e9, 1) or None,
            "ma5":        ma5,
            "ma10":       ma10,
            "ma20":       ma20,
            "vol_ratio":  vol_ratio,
            "duck":       duck_detail,
            "chart":      chart_data,
        }

    except Exception as e:
        if verbose: print(f"  [{ticker}] 异常: {e}")
        return str(e)[:80]

# ─── 主入口（供 FastAPI 调用） ────────────────────────────────────

def run_duck_scan() -> dict:
    """
    全量扫描，返回结果 dict（可直接存入 Redis）。
    格式：{"date": "YYYY-MM-DD", "scan_time": "...", "stocks": [...]}
    """
    tickers  = get_us_large_cap_tickers()
    results  = []
    total    = len(tickers)
    lock     = threading.Lock()
    counters = {"done": [0], "no_data": [0], "no_duck": [0],
                "no_ma": [0], "except": [0]}

    print(f"\n开始扫描 {total} 只股票（{MAX_WORKERS} 线程并发），请耐心等待...\n")

    def worker(ticker):
        r = screen_ticker(ticker)
        with lock:
            counters["done"][0] += 1
            if isinstance(r, dict):
                results.append(r)
                print(f"\n  ✓ 发现: {ticker} (价格 {r['price']}, 涨跌 {r['pct_change']:+.2f}%)")
            elif r in ("no_data", "no_duck", "no_ma"):
                counters[r][0] += 1
            else:
                counters["except"][0] += 1

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(worker, t): t for t in tickers}
        for _ in as_completed(futures):
            pass

    print(f"\n扫描完成，共发现 {len(results)} 只符合条件的股票。")

    results.sort(key=lambda x: x["vol_ratio"], reverse=True)

    la_tz = ZoneInfo("America/Los_Angeles")
    now_la = datetime.now(la_tz)
    tz_abbr = "PDT" if now_la.dst() and now_la.dst().total_seconds() > 0 else "PST"

    return {
        "date":      str(now_la.date()),
        "scan_time": now_la.strftime(f"%Y-%m-%d %H:%M:%S {tz_abbr}"),
        "stocks":    results,
    }
