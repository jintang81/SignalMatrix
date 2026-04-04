"""
异常期权信号扫描器 v2
==================
数据源: Tradier API
入口:   run_options_scan() → dict

v2 核心升级：
  ① 买方主动性 (Ask-Side Aggression): last >= bid/ask 中点 → 买方主动扫单
  ② 美元权利金门槛: vol × last × 100 ≥ $20k 入池，$100k → 机构级
  ③ OTM 方向性过滤: Call strike > 当前价，Put strike < 当前价
  ④ DTE 分组: 投机(0-7天) / 短期(8-30天) / 机构(31-90天) / 战略(90+天)
  ⑤ 次日 OI 对比: 开仓 vs 平仓识别 (Redis OI 快照)
  ⑥ 5日滚动权利金: 持续方向性资金流追踪 (Redis 历史)
  ⑦ 按美元权利金加权评分，非信号触发数量

信号模型 (v2):
  M1. SMART_MONEY_SWEEP  — above_mid + OTM + premium≥$100k + DTE 8–90天
  M2. PREMIUM_BIAS       — 全市场 Call vs Put 净权利金比率
  M3. SUSTAINED_FLOW     — 5日累计净权利金 > $300k（连续方向性押注）
  M4. OPENING_POSITION   — OI 次日增加 → 确认开新仓（非平仓）
  M5. HIGH_PUT_OI        — Put OI / Call OI > 1.5（保留）
  M6. DIP_BUY_SIGNAL     — 多重跌幅触发（保留）

依赖: pip install requests
"""

import datetime
import os

import requests

from redis_client import (
    get_options_oi_snapshot, set_options_oi_snapshot,
    get_options_flow_history, set_options_flow_history,
)

# ─────────────────────────────────────────────────────────────
#  配置
# ─────────────────────────────────────────────────────────────

TRADIER_TOKEN   = os.environ.get("TRADIER_TOKEN", "")
TRADIER_SANDBOX = False

# ── 入池门槛 ──────────────────────────────────────────────────
UV_VOL_OI_RATIO         = 3.0       # vol/OI 最低倍数
UV_MIN_VOLUME           = 500       # 单约最低成交量
UV_MIN_OI               = 1         # 单约最低 OI
UV_MIN_PREMIUM          = 20_000    # 入池最低美元权利金 ($20k)
SMART_MONEY_MIN_PREMIUM = 100_000   # 机构级权利金 ($100k)

# ── 各信号参数 ────────────────────────────────────────────────
SUSTAINED_FLOW_THRESHOLD = 300_000  # 5日净权利金绝对值 ($300k)
HPI_RATIO                = 1.5      # Put OI / Call OI 看跌警戒
DIP_52W_DROP             = -30.0    # 距52周高点跌幅
DIP_5D_DROP              = -10.0    # 5日跌幅
DIP_1D_DROP              = -5.0     # 当日跌幅

# ── DTE 分组边界 ──────────────────────────────────────────────
DTE_SPECULATIVE   = 7    # 0–7天：投机/事件驱动（参考价值低）
DTE_SHORT_TERM    = 30   # 8–30天：短期方向性
DTE_INSTITUTIONAL = 90   # 31–90天：机构建仓（权重最高）
                          # 90+天：战略/LEAPS

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
#  Tradier API helpers (unchanged)
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
    data = tradier_get("/markets/quotes", {"symbols": ticker, "greeks": "false"})
    q = data.get("quotes", {}).get("quote", {})
    if isinstance(q, list):
        q = q[0]
    price  = float(q.get("last",         0) or 0)
    prev   = float(q.get("prevclose",    0) or 0)
    high52 = float(q.get("week_52_high", 0) or 0)
    chg_1d = ((price - prev) / prev * 100) if prev else 0
    return {"price": price, "change_1d": round(chg_1d, 2), "high_52w": high52}

def get_history_5d(ticker: str) -> float:
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
#  Helpers
# ─────────────────────────────────────────────────────────────

def _dte_bucket(dte: int) -> str:
    if dte <= DTE_SPECULATIVE:   return "SPECULATIVE"
    if dte <= DTE_SHORT_TERM:    return "SHORT_TERM"
    if dte <= DTE_INSTITUTIONAL: return "INSTITUTIONAL"
    return "STRATEGIC"

# ─────────────────────────────────────────────────────────────
#  Options analysis (v2)
# ─────────────────────────────────────────────────────────────

def analyze_options(ticker: str, price: float, prev_oi_snap: dict) -> dict:
    """
    Fetches option chains and returns enriched stats.
    prev_oi_snap: { 'strike|expiry|type' → oi } from previous scan
    Returns new_oi_snap alongside analysis results.
    """
    exps = get_option_expirations(ticker)
    if not exps:
        return {}

    today = datetime.date.today()
    total_call_vol = total_put_vol = 0
    total_call_oi  = total_put_oi  = 0
    total_call_premium = total_put_premium = 0.0
    unusual_calls: list = []
    unusual_puts:  list = []
    new_oi_snap:   dict = {}

    for exp in exps[:8]:
        try:
            exp_date = datetime.date.fromisoformat(exp)
        except ValueError:
            continue
        dte    = max(0, (exp_date - today).days)
        bucket = _dte_bucket(dte)

        contracts = get_option_chain(ticker, exp)
        for c in contracts:
            vol    = int(c.get("volume",          0) or 0)
            oi     = int(c.get("open_interest",   0) or 0)
            ctype  = (c.get("option_type") or "").lower()
            strike = float(c.get("strike",        0) or 0)
            last   = float(c.get("last",          0) or 0)
            bid    = float(c.get("bid",           0) or 0)
            ask    = float(c.get("ask",           0) or 0)
            iv     = float(c.get("implied_volatility", 0) or 0)

            # ── OI snapshot for opening/closing detection ──
            snap_key = f"{strike}|{exp}|{ctype}"
            new_oi_snap[snap_key] = oi
            prev_oi = prev_oi_snap.get(snap_key)
            if prev_oi is None:
                position_type = "UNKNOWN"
            elif oi > prev_oi:
                position_type = "OPENING"
            elif oi < prev_oi:
                position_type = "CLOSING"
            else:
                position_type = "UNCHANGED"

            # ── Dollar premium ──────────────────────────────
            premium = vol * last * 100

            # ── Aggregate totals (before unusual filter) ────
            if ctype == "call":
                total_call_vol += vol
                total_call_oi  += oi
                total_call_premium += premium
            else:
                total_put_vol += vol
                total_put_oi  += oi
                total_put_premium += premium

            # ── Above-mid (buyer-initiated) detection ───────
            mid = (bid + ask) / 2.0 if (bid + ask) > 0 else last
            above_mid = (last >= mid) if mid > 0 and last > 0 else False

            # ── OTM check ───────────────────────────────────
            otm = (strike > price) if ctype == "call" else (strike < price)

            # ── Unusual entry gate ──────────────────────────
            if not (vol >= UV_MIN_VOLUME and oi >= UV_MIN_OI and oi > 0
                    and vol / oi >= UV_VOL_OI_RATIO and premium >= UV_MIN_PREMIUM):
                continue

            # ── Smart money classification ──────────────────
            smart_money = (
                above_mid
                and otm
                and premium >= SMART_MONEY_MIN_PREMIUM
                and bucket in ("SHORT_TERM", "INSTITUTIONAL")
            )

            contract = {
                "type":          ctype.upper(),
                "strike":        strike,
                "expiry":        exp,
                "dte":           dte,
                "dte_bucket":    bucket,
                "volume":        vol,
                "oi":            oi,
                "ratio":         round(vol / oi, 1),
                "bid":           bid,
                "ask":           ask,
                "last":          last,
                "mid":           round(mid, 2),
                "above_mid":     above_mid,
                "premium":       round(premium),
                "iv":            round(iv * 100, 1),
                "otm":           otm,
                "smart_money":   smart_money,
                "position_type": position_type,
            }
            if ctype == "call":
                unusual_calls.append(contract)
            else:
                unusual_puts.append(contract)

    # Sort by premium descending
    unusual_calls.sort(key=lambda x: x["premium"], reverse=True)
    unusual_puts.sort(key=lambda x: x["premium"],  reverse=True)

    sm_calls = [c for c in unusual_calls if c["smart_money"]]
    sm_puts  = [c for c in unusual_puts  if c["smart_money"]]

    return {
        "total_call_vol":    total_call_vol,
        "total_put_vol":     total_put_vol,
        "total_call_oi":     total_call_oi,
        "total_put_oi":      total_put_oi,
        "total_call_premium": round(total_call_premium),
        "total_put_premium":  round(total_put_premium),
        "unusual_calls":     unusual_calls,
        "unusual_puts":      unusual_puts,
        "unusual_call_vol":  sum(c["volume"]  for c in unusual_calls),
        "unusual_put_vol":   sum(c["volume"]  for c in unusual_puts),
        "sm_calls":          sm_calls,
        "sm_puts":           sm_puts,
        "sm_call_premium":   sum(c["premium"] for c in sm_calls),
        "sm_put_premium":    sum(c["premium"] for c in sm_puts),
        "new_oi_snap":       new_oi_snap,
    }

# ─────────────────────────────────────────────────────────────
#  Signal models (v2)
# ─────────────────────────────────────────────────────────────

def run_signals(ticker: str, quote: dict, change_5d: float,
                opts: dict, flow_5d: dict) -> dict:
    """
    Runs all 6 signal models (v2).
    flow_5d: { net_call_premium_5d, days } from Redis history.
    Returns triggered signals + composite score.
    """
    price    = quote["price"]
    chg_1d   = quote["change_1d"]
    high_52w = quote["high_52w"]
    signals: list = []

    sm_calls         = opts["sm_calls"]
    sm_puts          = opts["sm_puts"]
    sm_call_premium  = opts["sm_call_premium"]
    sm_put_premium   = opts["sm_put_premium"]
    unusual_calls    = opts["unusual_calls"]
    unusual_puts     = opts["unusual_puts"]

    # ── M1: SMART_MONEY_SWEEP ─────────────────────────────────
    # Above-mid + OTM + $100k+ premium + DTE 8-90 days
    has_sm = bool(sm_calls or sm_puts)
    if has_sm:
        if sm_calls and sm_puts:
            if sm_call_premium >= sm_put_premium * 2:
                sm_direction = "BULLISH"
            elif sm_put_premium >= sm_call_premium * 2:
                sm_direction = "BEARISH"
            else:
                sm_direction = "MIXED"
        elif sm_calls:
            sm_direction = "BULLISH"
        else:
            sm_direction = "BEARISH"

        top_contracts = sorted(sm_calls + sm_puts,
                                key=lambda x: x["premium"], reverse=True)[:5]
        opening_count = sum(1 for c in top_contracts if c["position_type"] == "OPENING")

        signals.append({
            "name":      "SMART_MONEY_SWEEP",
            "direction": sm_direction,
            "data": {
                "contracts":       top_contracts,
                "sm_call_premium": sm_call_premium,
                "sm_put_premium":  sm_put_premium,
                "opening_count":   opening_count,
                # Legacy fields for backward-compat with frontend rendering
                "uv_call_vol":     opts["unusual_call_vol"],
                "uv_put_vol":      opts["unusual_put_vol"],
            },
        })
    else:
        sm_direction = None

    # ── M2: PREMIUM_BIAS ──────────────────────────────────────
    # Replaces LOW_PUT_CALL_RATIO: use dollar premium ratio, not volume ratio
    call_p = opts["total_call_premium"]
    put_p  = opts["total_put_premium"]
    if call_p > 0 and put_p > 0:
        if call_p >= put_p * 2:
            signals.append({
                "name":      "PREMIUM_BIAS",
                "direction": "BULLISH",
                "data": {
                    "call_premium": call_p,
                    "put_premium":  put_p,
                    "ratio":        round(call_p / put_p, 2),
                },
            })
        elif put_p >= call_p * 2:
            signals.append({
                "name":      "PREMIUM_BIAS",
                "direction": "BEARISH",
                "data": {
                    "call_premium": call_p,
                    "put_premium":  put_p,
                    "ratio":        round(put_p / call_p, 2),
                },
            })

    # ── M3: SUSTAINED_FLOW ────────────────────────────────────
    # Consecutive multi-day directional premium build-up
    net_5d   = flow_5d.get("net_call_premium_5d", 0)
    days_trk = flow_5d.get("days", 0)
    if days_trk >= 2:
        if net_5d > SUSTAINED_FLOW_THRESHOLD:
            signals.append({
                "name":      "SUSTAINED_CALL_FLOW",
                "direction": "BULLISH",
                "data": {
                    "net_call_premium_5d": net_5d,
                    "days_tracked":        days_trk,
                    "threshold":           SUSTAINED_FLOW_THRESHOLD,
                },
            })
        elif net_5d < -SUSTAINED_FLOW_THRESHOLD:
            signals.append({
                "name":      "SUSTAINED_PUT_FLOW",
                "direction": "BEARISH",
                "data": {
                    "net_put_premium_5d": abs(net_5d),
                    "days_tracked":       days_trk,
                    "threshold":          SUSTAINED_FLOW_THRESHOLD,
                },
            })

    # ── M4: OPENING_POSITION ─────────────────────────────────
    # OI next-day confirmation: new position vs. closing existing one
    all_sm    = sm_calls + sm_puts
    opening_sm = [c for c in all_sm if c["position_type"] == "OPENING"]
    if opening_sm and has_sm:
        op_call_p = sum(c["premium"] for c in opening_sm if c["type"] == "CALL")
        op_put_p  = sum(c["premium"] for c in opening_sm if c["type"] == "PUT")
        if op_call_p > 0 or op_put_p > 0:
            op_dir = "BULLISH" if op_call_p >= op_put_p else "BEARISH"
            signals.append({
                "name":      "OPENING_POSITION",
                "direction": op_dir,
                "data": {
                    "contracts":           sorted(opening_sm, key=lambda x: x["premium"], reverse=True)[:3],
                    "opening_call_premium": op_call_p,
                    "opening_put_premium":  op_put_p,
                },
            })

    # ── M5: HIGH_PUT_OI (unchanged) ───────────────────────────
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

    # ── M6: DIP_BUY_SIGNAL (unchanged logic) ─────────────────
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
                "triggers":        triggers,
                "drop_52w":        round(drop_52w, 1),
                "drop_5d":         change_5d,
                "drop_1d":         chg_1d,
                "sm_call_premium": sm_call_premium,
                "notable_calls":   sm_calls[:3],
            },
        })

    # ── Premium-weighted star rating (direction-agnostic) ──────
    # Stars driven by dominant SM premium size, not signal count
    stars = 0

    if sm_direction == "BULLISH":
        if   sm_call_premium >= 1_000_000: stars += 3
        elif sm_call_premium >=   500_000: stars += 2
        elif sm_call_premium >=   100_000: stars += 1
    elif sm_direction == "BEARISH":
        if   sm_put_premium  >= 1_000_000: stars += 3
        elif sm_put_premium  >=   500_000: stars += 2
        elif sm_put_premium  >=   100_000: stars += 1
    # MIXED: no stars — directional conviction is unclear

    # Confirmation signals only add stars when SM has a clear direction (not MIXED)
    if sm_direction in ("BULLISH", "BEARISH"):
        pb_dir  = sm_direction
        sf_name = "SUSTAINED_CALL_FLOW" if sm_direction == "BULLISH" else "SUSTAINED_PUT_FLOW"
        if any(s["name"] == "PREMIUM_BIAS"     and s["direction"] == pb_dir for s in signals):
            stars += 1
        if any(s["name"] == sf_name                                         for s in signals):
            stars += 1
        if any(s["name"] == "OPENING_POSITION" and s["direction"] == pb_dir for s in signals):
            stars += 1

    # M6 only adds stars when M1 is BULLISH (confirms smart money buying the dip)
    if sm_direction == "BULLISH":
        dip = next((s for s in signals if "DIP_BUY" in s["name"]), None)
        if dip:
            stars += 1
            if len(dip["data"]["triggers"]) >= 3:
                stars += 1

    stars = min(5, stars)

    # ── Overall direction ──────────────────────────────────────
    hpi_trigger = any(s["name"] == "HIGH_PUT_OI" for s in signals)
    sm_bearish  = sm_direction == "BEARISH"
    sm_bullish  = sm_direction == "BULLISH"

    if   sm_bearish and (sm_put_premium >= 500_000 or hpi_trigger): overall = "BEARISH"
    elif sm_bearish:                                                  overall = "WARNING"
    elif sm_bullish and stars >= 3:                                   overall = "BUY"
    elif hpi_trigger:                                                 overall = "WARNING"
    elif stars >= 1:                                                  overall = "WATCH"
    else:                                                             overall = None

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
    Scans all tickers in UNIVERSE for smart money options activity.
    Entry condition: SMART_MONEY_SWEEP or DIP_BUY_SIGNAL must trigger.
    Reads/writes OI snapshot + flow history from Redis for P2 signals.
    """
    import zoneinfo
    now_pst  = datetime.datetime.now(zoneinfo.ZoneInfo("America/Los_Angeles"))
    date_str = now_pst.strftime("%Y-%m-%d")
    time_str = now_pst.strftime("%H:%M")
    tz_abbr  = "PDT" if now_pst.dst() else "PST"

    # ── Load Redis history ────────────────────────────────────
    prev_oi_snap_full = get_options_oi_snapshot()   # { ticker → { snap_key → oi } }
    flow_history      = get_options_flow_history()   # { ticker → [{ date, net_call_premium }] }

    results:          list = []
    new_oi_snap_full: dict = {}

    for ticker, info in UNIVERSE.items():
        try:
            quote = get_quote(ticker)
            if not quote["price"]:
                continue
            price = quote["price"]

            change_5d    = get_history_5d(ticker)
            prev_oi_snap = prev_oi_snap_full.get(ticker, {})
            opts         = analyze_options(ticker, price, prev_oi_snap)
            if not opts:
                continue

            # Collect new OI snapshot for this ticker
            new_oi_snap_full[ticker] = opts.pop("new_oi_snap", {})

            # ── OI delta vs previous scan ──────────────────────
            prev_call_oi  = sum(v for k, v in prev_oi_snap.items() if k.endswith("|call"))
            prev_put_oi   = sum(v for k, v in prev_oi_snap.items() if k.endswith("|put"))
            call_oi_delta = opts["total_call_oi"] - prev_call_oi if prev_oi_snap else 0
            put_oi_delta  = opts["total_put_oi"]  - prev_put_oi  if prev_oi_snap else 0

            # ── Update 5-day rolling flow history ─────────────
            today_net = opts["total_call_premium"] - opts["total_put_premium"]
            history   = flow_history.get(ticker, [])
            history   = [h for h in history if h["date"] != date_str]
            history.append({
                "date":             date_str,
                "net_call_premium": round(today_net),
                "call_oi_delta":    call_oi_delta,
                "put_oi_delta":     put_oi_delta,
            })
            history   = sorted(history, key=lambda x: x["date"])[-5:]
            flow_history[ticker] = history

            net_5d   = sum(h["net_call_premium"] for h in history)
            flow_5d  = {"net_call_premium_5d": net_5d, "days": len(history)}

            result = run_signals(ticker, quote, change_5d, opts, flow_5d)

            # ── Entry gate: must have SM sweep ────────────────
            has_sm = any(s["name"] == "SMART_MONEY_SWEEP" for s in result["signals"])
            if not has_sm:
                continue

            results.append({
                "ticker":    ticker,
                "info":      info,
                "price":     price,
                "change_1d": quote["change_1d"],
                "change_5d": change_5d,
                "high_52w":  quote["high_52w"],
                "drop_52w":  result["drop_52w"],
                "stars":     result["stars"],
                "overall":   result["overall"],
                "signals":   result["signals"],
                "flow_5d":   {"net_premium": net_5d, "days": len(history)},
            })

        except Exception as e:
            print(f"[options-v2] {ticker}: {e}")

    # Sort: stars desc, then sm_call_premium desc
    def _sort_key(x):
        sm = next((s for s in x["signals"] if s["name"] == "SMART_MONEY_SWEEP"), None)
        return (x["stars"], sm["data"]["sm_call_premium"] if sm else 0)

    results.sort(key=_sort_key, reverse=True)

    # ── Persist updated Redis state ───────────────────────────
    set_options_oi_snapshot(new_oi_snap_full)
    set_options_flow_history(flow_history)

    return {
        "date":      date_str,
        "scan_time": f"{time_str} {tz_abbr}",
        "stocks":    results,
        "params": {
            "uv_vol_oi_ratio":          UV_VOL_OI_RATIO,
            "uv_min_volume":            UV_MIN_VOLUME,
            "uv_min_premium":           UV_MIN_PREMIUM,
            "smart_money_min_premium":  SMART_MONEY_MIN_PREMIUM,
            "sustained_flow_threshold": SUSTAINED_FLOW_THRESHOLD,
            "hpi_ratio":                HPI_RATIO,
            "dip_52w_drop":             DIP_52W_DROP,
            "dip_5d_drop":              DIP_5D_DROP,
            "dip_1d_drop":              DIP_1D_DROP,
        },
    }
