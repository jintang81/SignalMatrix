"""
异常期权信号扫描器
==================
数据源: Tradier API
入口:   run_options_scan() → dict (JSON-serializable)

信号模型（共5个，触发数量决定评级）：
  1. UNUSUAL_VOLUME    — 单约 Vol ≥ 3× OI  ← 必须触发才入库
  2. LOW_PUT_CALL_RATIO — Put/Call 成交量比 < 0.5（看涨）
  3. HIGH_PUT_OI       — Put OI / Call OI > 1.5（看跌警示）
  4. HEAVY_CALL_FLOW   — Unusual Call Vol ≥ 3× Unusual Put Vol
  5. DIP_BUY_SIGNAL    — 52周高点跌幅 + 5日跌幅 + 当日跌幅同时满足

综合评分：每个模型触发 +1星，★★★★★ 满分5

依赖: pip install requests
"""

import datetime
import os

import requests

# ─────────────────────────────────────────────────────────────
#  配置
# ─────────────────────────────────────────────────────────────

TRADIER_TOKEN   = os.environ.get("TRADIER_TOKEN", "")
TRADIER_SANDBOX = False  # True=sandbox延迟数据

# ── 信号参数 ──────────────────────────────────────────────────
UV_VOL_OI_RATIO  = 3.0    # 单约 Vol/OI 最低倍数
UV_MIN_VOLUME    = 500    # 单约最低成交量
UV_MIN_OI        = 1      # 单约最低 OI

PC_BULL_THRESHOLD = 0.5   # Put/Call < 此值 → 看涨

HPI_RATIO        = 1.5    # Put OI / Call OI > 此值 → 看跌警示

HCF_RATIO        = 3.0    # Unusual Call Vol / Unusual Put Vol > 此值

DIP_52W_DROP     = -30.0  # 距52周高点跌幅(%)，低于此值触发
DIP_5D_DROP      = -10.0  # 5日跌幅(%)，低于此值触发
DIP_1D_DROP      = -5.0   # 当日跌幅(%)，低于此值触发

# ─────────────────────────────────────────────────────────────
#  股票池（85只股票+ETF，含对应杠杆ETF）
# ─────────────────────────────────────────────────────────────

UNIVERSE = {
    "SPY":  {"name":"标普500",          "2x":"SSO",   "3x":"UPRO",  "inv2x":"SDS",  "inv3x":"SPXU","sector":"大盘指数"},
    "QQQ":  {"name":"纳斯达克100",      "2x":"QLD",   "3x":"TQQQ",  "inv2x":"QID",  "inv3x":"SQQQ","sector":"科技指数"},
    "IWM":  {"name":"罗素2000",         "2x":"UWM",   "3x":"TNA",   "inv2x":"TWM",  "inv3x":"TZA", "sector":"小盘指数"},
    "DIA":  {"name":"道琼斯",           "2x":"DDM",   "3x":"UDOW",  "inv2x":"DXX",  "inv3x":"SDOW","sector":"道指"},
    "IVV":  {"name":"标普500(IVV)",     "2x":"SSO",   "3x":"UPRO",  "inv2x":"SDS",  "inv3x":"SPXU","sector":"大盘指数"},
    "VOO":  {"name":"标普500(VOO)",     "2x":"SSO",   "3x":"UPRO",  "inv2x":"SDS",  "inv3x":"SPXU","sector":"大盘指数"},
    "XLF":  {"name":"金融板块",         "2x":"UYG",   "3x":"FAS",   "inv2x":"SKF",  "inv3x":"FAZ", "sector":"金融"},
    "XLK":  {"name":"科技板块",         "2x":"ROM",   "3x":"TECL",  "inv2x":"REW",  "inv3x":"TECS","sector":"科技"},
    "XLE":  {"name":"能源板块",         "2x":"DIG",   "3x":"ERX",   "inv2x":"DDG",  "inv3x":"ERY", "sector":"能源"},
    "XLV":  {"name":"医疗板块",         "2x":"RXL",   "3x":"CURE",  "inv2x":"RXD",  "inv3x":"-",   "sector":"医疗"},
    "XLI":  {"name":"工业板块",         "2x":"UXI",   "3x":"DUSL",  "inv2x":"SIJ",  "inv3x":"-",   "sector":"工业"},
    "XLB":  {"name":"材料板块",         "2x":"UYM",   "3x":"MATS",  "inv2x":"SMN",  "inv3x":"-",   "sector":"材料"},
    "XLU":  {"name":"公用事业",         "2x":"UPW",   "3x":"UTSL",  "inv2x":"SDP",  "inv3x":"-",   "sector":"公用事业"},
    "XLRE": {"name":"房地产",           "2x":"URE",   "3x":"DRN",   "inv2x":"SRS",  "inv3x":"DRV", "sector":"房地产"},
    "XLY":  {"name":"非必需消费",       "2x":"UCC",   "3x":"WANT",  "inv2x":"SCC",  "inv3x":"-",   "sector":"消费"},
    "XLP":  {"name":"必需消费",         "2x":"UGE",   "3x":"NEED",  "inv2x":"SZK",  "inv3x":"-",   "sector":"消费"},
    "SMH":  {"name":"半导体ETF",        "2x":"USD",   "3x":"SOXL",  "inv2x":"SSG",  "inv3x":"SOXS","sector":"半导体"},
    "SOXX": {"name":"半导体ETF(SOXX)",  "2x":"USD",   "3x":"SOXL",  "inv2x":"SSG",  "inv3x":"SOXS","sector":"半导体"},
    "GLD":  {"name":"黄金",             "2x":"UGL",   "3x":"UGLD",  "inv2x":"GLL",  "inv3x":"-",   "sector":"黄金"},
    "SLV":  {"name":"白银",             "2x":"AGQ",   "3x":"USLV",  "inv2x":"ZSL",  "inv3x":"-",   "sector":"白银"},
    "USO":  {"name":"原油",             "2x":"UCO",   "3x":"OILU",  "inv2x":"SCO",  "inv3x":"-",   "sector":"原油"},
    "UNG":  {"name":"天然气",           "2x":"BOIL",  "3x":"-",     "inv2x":"KOLD", "inv3x":"-",   "sector":"天然气"},
    "TLT":  {"name":"长期国债",         "2x":"UBT",   "3x":"TMF",   "inv2x":"TBF",  "inv3x":"TMV", "sector":"债券"},
    "IEF":  {"name":"中期国债",         "2x":"UST",   "3x":"TYD",   "inv2x":"TBX",  "inv3x":"-",   "sector":"债券"},
    "HYG":  {"name":"高收益债",         "2x":"HYDB",  "3x":"-",     "inv2x":"SJB",  "inv3x":"-",   "sector":"债券"},
    "NVDA": {"name":"英伟达",           "2x":"NVDL",  "3x":"NVDX",  "inv2x":"NVD",  "inv3x":"-",   "sector":"半导体"},
    "AMD":  {"name":"AMD",              "2x":"AMDL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"半导体"},
    "INTC": {"name":"英特尔",           "2x":"INTW",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"半导体"},
    "AVGO": {"name":"博通",             "2x":"AVGU",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"半导体"},
    "TSM":  {"name":"台积电",           "2x":"TSMU",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"半导体"},
    "QCOM": {"name":"高通",             "2x":"QCML",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"半导体"},
    "MU":   {"name":"美光科技",         "2x":"MULL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"半导体"},
    "MRVL": {"name":"Marvell",          "2x":"MVLL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"半导体"},
    "SMCI": {"name":"超微电脑",         "2x":"SMCL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"AI硬件"},
    "ARM":  {"name":"ARM Holdings",     "2x":"ARMU",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"半导体"},
    "IONQ": {"name":"IonQ",             "2x":"IONL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"量子计算"},
    "AAPL": {"name":"苹果",             "2x":"AAPU",  "3x":"AAPB",  "inv2x":"AAPD", "inv3x":"-",   "sector":"科技"},
    "MSFT": {"name":"微软",             "2x":"MSFL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"科技"},
    "GOOGL":{"name":"谷歌A",            "2x":"GGLL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"科技"},
    "GOOG": {"name":"谷歌C",            "2x":"GOOX",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"科技"},
    "META": {"name":"Meta",             "2x":"FBL",   "3x":"METX",  "inv2x":"-",    "inv3x":"-",   "sector":"科技"},
    "AMZN": {"name":"亚马逊",           "2x":"AMZZ",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"科技"},
    "TSLA": {"name":"特斯拉",           "2x":"TSLR",  "3x":"TSLT",  "inv2x":"TSDD", "inv3x":"-",   "sector":"新能源车"},
    "NFLX": {"name":"奈飞",             "2x":"NFLU",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"流媒体"},
    "SNOW": {"name":"Snowflake",        "2x":"SNOU",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"云计算"},
    "CRM":  {"name":"Salesforce",       "2x":"NOWL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"软件"},
    "NOW":  {"name":"ServiceNow",       "2x":"NOWL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"软件"},
    "DELL": {"name":"戴尔",             "2x":"DLLL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"科技"},
    "TTD":  {"name":"The Trade Desk",   "2x":"TTDU",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"广告科技"},
    "CRWV": {"name":"CoreWeave",        "2x":"CRWU",  "3x":"-",     "inv2x":"CORD", "inv3x":"-",   "sector":"AI基础设施"},
    "PLTR": {"name":"Palantir",         "2x":"PTIR",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"AI软件"},
    "APP":  {"name":"Applovin",         "2x":"APPX",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"AI广告"},
    "ACHR": {"name":"Archer Aviation",  "2x":"ARCX",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"eVTOL"},
    "ASTS": {"name":"AST SpaceMobile",  "2x":"ASTX",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"卫星通信"},
    "RDDT": {"name":"Reddit",           "2x":"RDTL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"社交媒体"},
    "HOOD": {"name":"Robinhood",        "2x":"ROBN",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"金融科技"},
    "AFRM": {"name":"Affirm",           "2x":"AFRU",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"金融科技"},
    "AXON": {"name":"Axon Enterprise",  "2x":"AXUP",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"公共安全"},
    "BKNG": {"name":"Booking Holdings", "2x":"BKNU",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"旅游"},
    "DKNG": {"name":"DraftKings",       "2x":"DKUP",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"体育彩票"},
    "MARA": {"name":"Marathon Digital",  "2x":"MRAL",  "3x":"-",    "inv2x":"-",    "inv3x":"-",   "sector":"加密矿"},
    "RIVN": {"name":"Rivian",           "2x":"RVNL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"新能源车"},
    "LCID": {"name":"Lucid Group",      "2x":"LCDL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"新能源车"},
    "GME":  {"name":"GameStop",         "2x":"GMEU",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"游戏零售"},
    "RBLX": {"name":"Roblox",           "2x":"RBLU",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"游戏"},
    "UPST": {"name":"Upstart",          "2x":"UPSX",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"金融科技"},
    "CEG":  {"name":"Constellation Energy","2x":"CEGX","3x":"-",    "inv2x":"-",    "inv3x":"-",   "sector":"核能"},
    "VRT":  {"name":"Vertiv",           "2x":"VRTL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"数据中心"},
    "UBER": {"name":"Uber",             "2x":"UBRL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"出行"},
    "BABA": {"name":"阿里巴巴",         "2x":"BABX",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"中国科技"},
    "PDD":  {"name":"拼多多",           "2x":"PDDL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"中国科技"},
    "JPM":  {"name":"摩根大通",         "2x":"JPML",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"银行"},
    "BAC":  {"name":"美国银行",         "2x":"BACL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"银行"},
    "GS":   {"name":"高盛",             "2x":"GSL",   "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"投行"},
    "MS":   {"name":"摩根士丹利",       "2x":"MSL",   "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"投行"},
    "COIN": {"name":"Coinbase",         "2x":"CONL",  "3x":"-",     "inv2x":"CONI", "inv3x":"-",   "sector":"加密货币"},
    "MSTR": {"name":"MicroStrategy",    "2x":"MSTP",  "3x":"MSTU",  "inv2x":"MSDD", "inv3x":"-",   "sector":"加密货币"},
    "LLY":  {"name":"礼来",             "2x":"LLYX",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"制药"},
    "AMGN": {"name":"安进",             "2x":"AMGX",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"生物科技"},
    "MRNA": {"name":"Moderna",          "2x":"MRNX",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"生物科技"},
    "XOM":  {"name":"埃克森美孚",       "2x":"XOML",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"能源"},
    "CVX":  {"name":"雪佛龙",           "2x":"CVXL",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"能源"},
    "UNH":  {"name":"联合健康",         "2x":"UNHG",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"医疗保险"},
    "NBIS": {"name":"Nebius Group",     "2x":"NBIS",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"AI基础设施"},
    "COPX": {"name":"铜矿ETF",          "2x":"COPZ",  "3x":"-",     "inv2x":"-",    "inv3x":"-",   "sector":"铜矿"},
}

# ─────────────────────────────────────────────────────────────
#  Tradier API helpers
# ─────────────────────────────────────────────────────────────

def _headers() -> dict:
    return {"Authorization": f"Bearer {TRADIER_TOKEN}", "Accept": "application/json"}

def _base() -> str:
    return ("https://sandbox.tradier.com/v1" if TRADIER_SANDBOX
            else "https://api.tradier.com/v1")

def tradier_get(path: str, params: dict) -> dict:
    try:
        r = requests.get(f"{_base()}{path}", headers=_headers(),
                         params=params, timeout=15)
        return r.json() if r.status_code == 200 else {}
    except Exception:
        return {}

def get_quote(ticker: str) -> dict:
    """Returns {price, change_1d, high_52w}"""
    data = tradier_get("/markets/quotes", {"symbols": ticker, "greeks": "false"})
    q = data.get("quotes", {}).get("quote", {})
    if isinstance(q, list):
        q = q[0]
    price   = float(q.get("last",       0) or 0)
    prev    = float(q.get("prevclose",  0) or 0)
    high52  = float(q.get("week_52_high", 0) or 0)
    chg_1d  = ((price - prev) / prev * 100) if prev else 0
    return {"price": price, "change_1d": round(chg_1d, 2), "high_52w": high52}

def get_history_5d(ticker: str) -> float:
    """Returns 5-day price change (%)"""
    try:
        end   = datetime.date.today()
        start = end - datetime.timedelta(days=10)
        data  = tradier_get("/markets/history", {
            "symbol": ticker, "interval": "daily",
            "start": str(start), "end": str(end),
        })
        days = data.get("history", {}).get("day", [])
        if not days or len(days) < 2:
            return 0.0
        if isinstance(days, dict):
            days = [days]
        price_now  = float(days[-1].get("close", 0) or 0)
        price_5ago = float(days[max(0, len(days) - 6)].get("close", 0) or 0)
        return round((price_now - price_5ago) / price_5ago * 100, 2) if price_5ago else 0.0
    except Exception:
        return 0.0

def get_option_expirations(ticker: str) -> list:
    data = tradier_get("/markets/options/expirations",
                       {"symbol": ticker, "includeAllRoots": "true"})
    exps = data.get("expirations", {})
    if not exps or not exps.get("date"):
        return []
    dates = exps["date"]
    return dates if isinstance(dates, list) else [dates]

def get_option_chain(ticker: str, expiration: str) -> list:
    data = tradier_get("/markets/options/chains",
                       {"symbol": ticker, "expiration": expiration, "greeks": "false"})
    opts = data.get("options", {})
    if not opts or not opts.get("option"):
        return []
    o = opts["option"]
    return o if isinstance(o, list) else [o]

# ─────────────────────────────────────────────────────────────
#  Options analysis
# ─────────────────────────────────────────────────────────────

def analyze_options(ticker: str) -> dict:
    """Fetches option chains and returns aggregated stats."""
    exps = get_option_expirations(ticker)
    if not exps:
        return {}

    total_call_vol = total_put_vol = 0
    total_call_oi  = total_put_oi  = 0
    unusual_calls: list = []
    unusual_puts:  list = []

    for exp in exps[:6]:
        contracts = get_option_chain(ticker, exp)
        for c in contracts:
            vol   = int(c.get("volume",        0) or 0)
            oi    = int(c.get("open_interest",  0) or 0)
            ctype = (c.get("option_type") or "").lower()

            if ctype == "call":
                total_call_vol += vol
                total_call_oi  += oi
            else:
                total_put_vol += vol
                total_put_oi  += oi

            # UV filter
            if (vol >= UV_MIN_VOLUME and oi >= UV_MIN_OI
                    and oi > 0 and vol / oi >= UV_VOL_OI_RATIO):
                contract = {
                    "type":   ctype.upper(),
                    "strike": float(c.get("strike",             0) or 0),
                    "expiry": exp,
                    "volume": vol,
                    "oi":     oi,
                    "ratio":  round(vol / oi, 1),
                    "iv":     round(float(c.get("implied_volatility", 0) or 0) * 100, 1),
                    "last":   round(float(c.get("last",                0) or 0), 2),
                }
                if ctype == "call":
                    unusual_calls.append(contract)
                else:
                    unusual_puts.append(contract)

    unusual_call_vol = sum(c["volume"] for c in unusual_calls)
    unusual_put_vol  = sum(c["volume"] for c in unusual_puts)

    return {
        "total_call_vol":   total_call_vol,
        "total_put_vol":    total_put_vol,
        "total_call_oi":    total_call_oi,
        "total_put_oi":     total_put_oi,
        "unusual_calls":    sorted(unusual_calls, key=lambda x: x["volume"], reverse=True),
        "unusual_puts":     sorted(unusual_puts,  key=lambda x: x["volume"], reverse=True),
        "unusual_call_vol": unusual_call_vol,
        "unusual_put_vol":  unusual_put_vol,
    }

# ─────────────────────────────────────────────────────────────
#  Signal models
# ─────────────────────────────────────────────────────────────

def run_signals(ticker: str, quote: dict, change_5d: float, opts: dict) -> dict:
    """Runs all 5 signal models. Returns triggered signals and composite score."""
    price    = quote["price"]
    chg_1d   = quote["change_1d"]
    high_52w = quote["high_52w"]
    signals: list = []

    uv_calls    = opts["unusual_calls"]
    uv_puts     = opts["unusual_puts"]
    uv_call_vol = opts["unusual_call_vol"]
    uv_put_vol  = opts["unusual_put_vol"]

    # M1: UNUSUAL_VOLUME
    if uv_calls or uv_puts:
        if uv_calls and uv_puts:
            direction = "MIXED"
        elif uv_calls:
            direction = "BULLISH"
        else:
            direction = "BEARISH"

        top_contracts = sorted(uv_calls + uv_puts,
                               key=lambda x: x["volume"], reverse=True)[:5]
        signals.append({
            "name":      "UNUSUAL_VOLUME",
            "direction": direction,
            "data": {
                "contracts":   top_contracts,
                "uv_call_vol": uv_call_vol,
                "uv_put_vol":  uv_put_vol,
            },
        })

    # M2: LOW_PUT_CALL_RATIO
    total_call = opts["total_call_vol"]
    total_put  = opts["total_put_vol"]
    if total_call > 0 and total_put > 0:
        pc_ratio = total_put / total_call
        if pc_ratio < PC_BULL_THRESHOLD:
            signals.append({
                "name":      "LOW_PUT_CALL_RATIO",
                "direction": "BULLISH",
                "data": {
                    "pc_ratio":  round(pc_ratio, 2),
                    "threshold": PC_BULL_THRESHOLD,
                    "call_vol":  total_call,
                    "put_vol":   total_put,
                },
            })

    # M3: HIGH_PUT_OI
    call_oi = opts["total_call_oi"]
    put_oi  = opts["total_put_oi"]
    if call_oi > 0 and put_oi > 0:
        oi_ratio = put_oi / call_oi
        if oi_ratio > HPI_RATIO:
            signals.append({
                "name":      "HIGH_PUT_OI",
                "direction": "BEARISH",
                "data": {
                    "put_oi":  put_oi,
                    "call_oi": call_oi,
                    "ratio":   round(oi_ratio, 2),
                },
            })

    # M4: HEAVY_CALL_FLOW / HEAVY_PUT_FLOW
    if uv_put_vol > 0 and uv_call_vol / uv_put_vol >= HCF_RATIO:
        signals.append({
            "name":      "HEAVY_CALL_FLOW",
            "direction": "BULLISH",
            "data": {
                "call_vol": uv_call_vol,
                "put_vol":  uv_put_vol,
                "ratio":    round(uv_call_vol / uv_put_vol, 1),
            },
        })
    elif uv_call_vol > 0 and uv_put_vol / uv_call_vol >= HCF_RATIO:
        signals.append({
            "name":      "HEAVY_PUT_FLOW",
            "direction": "BEARISH",
            "data": {
                "call_vol": uv_call_vol,
                "put_vol":  uv_put_vol,
                "ratio":    round(uv_put_vol / uv_call_vol, 1),
            },
        })

    # M5: DIP_BUY_SIGNAL
    drop_52w = ((price - high_52w) / high_52w * 100) if high_52w else 0
    triggers = []
    if chg_1d    <= DIP_1D_DROP:  triggers.append(f"Intraday drop: {chg_1d:+.1f}%")
    if change_5d <= DIP_5D_DROP:  triggers.append(f"5-day drop: {change_5d:+.1f}%")
    if drop_52w  <= DIP_52W_DROP: triggers.append(f"From 52-week high: {drop_52w:+.1f}%")

    if len(triggers) >= 2:
        parts = []
        if drop_52w  <= DIP_52W_DROP: parts.append("52WK_DROP")
        if change_5d <= DIP_5D_DROP:  parts.append("5D_DROP")
        if chg_1d    <= DIP_1D_DROP:  parts.append("INTRADAY")

        signals.append({
            "name":      "DIP_BUY_SIGNAL:" + "+".join(parts),
            "direction": "BUY_SIGNAL",
            "data": {
                "triggers":     triggers,
                "drop_52w":     round(drop_52w, 1),
                "drop_5d":      change_5d,
                "drop_1d":      chg_1d,
                "pc_ratio":     round(total_put / total_call, 2) if total_call else 0,
                "call_vol":     total_call,
                "put_vol":      total_put,
                "notable_calls": uv_calls[:3],
            },
        })

    # ── Composite star rating ──────────────────────────────────
    uv_bearish = any(
        s["name"] == "UNUSUAL_VOLUME" and s["direction"] == "BEARISH"
        for s in signals
    )

    stars = 0
    if not uv_bearish:
        for s in signals:
            name      = s["name"]
            direction = s["direction"]
            if name == "UNUSUAL_VOLUME":
                if direction == "BULLISH":
                    stars += 2
            elif name == "LOW_PUT_CALL_RATIO":
                stars += 1
            elif name == "HEAVY_CALL_FLOW":
                stars += 1
            elif "DIP_BUY" in name:
                stars += 1
                if len(s["data"]["triggers"]) >= 3:
                    stars += 1   # all 3 conditions → bonus star

    stars = min(stars, 5)

    # ── Overall direction ──────────────────────────────────────
    uv_signal   = next((s for s in signals if s["name"] == "UNUSUAL_VOLUME"), None)
    uv_bearish  = bool(uv_signal and uv_signal["direction"] == "BEARISH")
    hpi_trigger = any(s["name"] == "HIGH_PUT_OI" for s in signals)

    if uv_bearish and hpi_trigger:
        overall = "BEARISH"
    elif stars > 0:
        overall = "BUY"
    elif uv_bearish or hpi_trigger:
        overall = "WARNING"
    else:
        overall = None

    return {
        "signals":  signals,
        "stars":    stars,
        "overall":  overall,
        "drop_52w": round(drop_52w, 1),
        "drop_5d":  change_5d,
        "drop_1d":  chg_1d,
    }

# ─────────────────────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────────────────────

def run_options_scan() -> dict:
    """
    Scans all tickers in UNIVERSE for unusual options activity.
    Only tickers where UNUSUAL_VOLUME triggers are included in results.
    Returns JSON-serializable dict compatible with OptionsScreenerResult.
    """
    import zoneinfo
    now_pst   = datetime.datetime.now(zoneinfo.ZoneInfo("America/Los_Angeles"))
    date_str  = now_pst.strftime("%Y-%m-%d")
    time_str  = now_pst.strftime("%H:%M")

    results = []

    for ticker, info in UNIVERSE.items():
        try:
            quote = get_quote(ticker)
            if not quote["price"]:
                continue

            change_5d = get_history_5d(ticker)
            opts      = analyze_options(ticker)
            if not opts:
                continue

            result = run_signals(ticker, quote, change_5d, opts)

            # Only store tickers where UNUSUAL_VOLUME triggered
            uv_triggered = any(s["name"] == "UNUSUAL_VOLUME"
                               for s in result["signals"])
            if not uv_triggered:
                continue

            results.append({
                "ticker":    ticker,
                "info":      info,
                "price":     quote["price"],
                "change_1d": quote["change_1d"],
                "change_5d": change_5d,
                "high_52w":  quote["high_52w"],
                "drop_52w":  result["drop_52w"],
                "stars":     result["stars"],
                "overall":   result["overall"],
                "signals":   result["signals"],
            })

        except Exception as e:
            print(f"[options] {ticker}: {e}")

    # Sort by stars descending
    results.sort(key=lambda x: x["stars"], reverse=True)

    return {
        "date":   date_str,
        "scan_time": time_str,
        "stocks": results,
        "params": {
            "uv_vol_oi_ratio":   UV_VOL_OI_RATIO,
            "uv_min_volume":     UV_MIN_VOLUME,
            "pc_bull_threshold": PC_BULL_THRESHOLD,
            "hpi_ratio":         HPI_RATIO,
            "hcf_ratio":         HCF_RATIO,
            "dip_52w_drop":      DIP_52W_DROP,
            "dip_5d_drop":       DIP_5D_DROP,
            "dip_1d_drop":       DIP_1D_DROP,
        },
    }
