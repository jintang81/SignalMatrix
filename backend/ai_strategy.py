"""
AI Strategy Generator

Collects SPY/QQQ/VIX/sector ETF market data and calls Claude claude-opus-4-6 to
produce a daily trading strategy brief in structured JSON.

Entry point: run_ai_strategy() → dict
"""

import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import anthropic
import yfinance as yf

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# Sector ETFs tracked
SECTOR_MAP = {
    "XLK":  "科技",
    "XLF":  "金融",
    "XLE":  "能源",
    "XLV":  "医疗",
    "XLI":  "工业",
    "XLY":  "消费可选",
    "XLC":  "通信服务",
    "XLB":  "材料",
    "XLRE": "房地产",
}


# ─── Market Data Collection ────────────────────────────────────────

def _fetch_ticker(ticker: str, period: str = "6mo") -> dict:
    """Fetch OHLCV history and compute common metrics for one ticker."""
    try:
        hist = yf.Ticker(ticker).history(period=period)
        if hist.empty:
            return {}
        closes = hist["Close"].tolist()
        n = len(closes)
        price = closes[-1]

        def pct(a, b):
            return round((b - a) / a * 100, 2) if a else 0

        ma50 = sum(closes[-50:]) / min(50, n)
        ma200 = sum(closes[-200:]) / min(200, n)

        return {
            "price": round(price, 2),
            "change_1d": pct(closes[-2], closes[-1]) if n >= 2 else 0,
            "change_5d": pct(closes[-6], closes[-1]) if n >= 6 else 0,
            "change_20d": pct(closes[-21], closes[-1]) if n >= 21 else 0,
            "vs_ma50": pct(ma50, price),
            "vs_ma200": pct(ma200, price),
        }
    except Exception as exc:
        return {"error": str(exc)}


def collect_market_data() -> dict:
    """Collect all market data needed for AI analysis."""
    spy = _fetch_ticker("SPY")
    qqq = _fetch_ticker("QQQ")
    iwm = _fetch_ticker("IWM")
    vix_raw = _fetch_ticker("^VIX", period="3mo")

    sectors: dict = {}
    for tk, name in SECTOR_MAP.items():
        d = _fetch_ticker(tk, period="3mo")
        if d and "error" not in d:
            sectors[tk] = {**d, "name": name}

    return {
        "spy": spy,
        "qqq": qqq,
        "iwm": iwm,
        "vix": vix_raw.get("price", 0),
        "vix_change_1d": vix_raw.get("change_1d", 0),
        "vix_change_5d": vix_raw.get("change_5d", 0),
        "sectors": sectors,
    }


# ─── Claude Prompt Templates ───────────────────────────────────────

_SYSTEM = (
    "你是 SignalMatrix 平台的专业量化交易策略分析师。"
    "你的任务是根据美股实时市场数据，生成一份简洁、专业的每日操盘策略简报。"
    "你只输出 JSON，不输出任何其他内容。"
)

_USER_TMPL = """\
分析以下美股市场数据，生成每日策略简报。

市场数据 ({date}):
{market_data}

可用筛选器说明:
- bottom-divergence: 底背离（MACD/RSI 底背离，底部反转信号）
- bottom-volume-surge: 底部放量（低位异常放量，主力建仓信号）
- duck-bill: 正鸭嘴（MACD 趋势加速零轴上方，强势多头信号）
- top-divergence: 顶背离（MACD/RSI 顶背离，顶部反转信号）
- top-volume-surge: 顶部放量（高位异常放量，主力出货信号）
- unusual-options: 异常期权信号（期权异常成交，机构方向）

筛选器选择逻辑参考:
- BULL 环境: 优先 duck-bill, bottom-divergence, bottom-volume-surge
- BEAR 环境: 优先 top-divergence, top-volume-surge
- NEUTRAL/CHOPPY: 侧重 unusual-options，谨慎使用方向性筛选器
- VIX > 20 时始终将 unusual-options 列入推荐

返回以下 JSON 结构（只输出 JSON，不要任何其他文字）:
{{
  "environment": "BULL 或 BEAR 或 NEUTRAL 或 CHOPPY",
  "confidence": 0 到 1 之间的数字（保留两位小数）,
  "risk_level": "LOW 或 MEDIUM 或 HIGH 或 EXTREME",
  "summary": "2-3 句中文执行摘要，点明当前市场环境和操盘重点",
  "recommended_screeners": ["按优先级排序的筛选器 ID 列表"],
  "avoid_screeners": ["当前环境下应避免的筛选器 ID 列表"],
  "key_levels": {{
    "spy_support": 关键支撑位（数字）,
    "spy_resistance": 关键压力位（数字）,
    "vix_warning": VIX 警戒线（数字）
  }},
  "strategy_notes": "详细策略分析，200-300 字，中文，涵盖板块轮动、关键风险与操盘建议"
}}"""


# ─── Main Entry Point ──────────────────────────────────────────────

def run_ai_strategy() -> dict:
    """Collect market data, call Claude, return structured strategy result."""
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")

    now_la = datetime.now(ZoneInfo("America/Los_Angeles"))
    tz_abbr = "PDT" if now_la.dst() else "PST"

    market_data = collect_market_data()

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    prompt = _USER_TMPL.format(
        date=now_la.strftime("%Y-%m-%d"),
        market_data=json.dumps(market_data, ensure_ascii=False, indent=2),
    )

    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1500,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = message.content[0].text.strip()
    # Strip ```json ... ``` fences if Claude wraps in markdown
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        response_text = "\n".join(lines[1:-1]).strip()

    ai_result: dict = json.loads(response_text)

    spy = market_data["spy"]
    qqq = market_data["qqq"]

    return {
        **ai_result,
        "market_metrics": {
            "spy_price":    spy.get("price", 0),
            "spy_change_1d": spy.get("change_1d", 0),
            "spy_change_5d": spy.get("change_5d", 0),
            "spy_vs_ma50":  spy.get("vs_ma50", 0),
            "spy_vs_ma200": spy.get("vs_ma200", 0),
            "qqq_price":    qqq.get("price", 0),
            "qqq_change_1d": qqq.get("change_1d", 0),
            "qqq_change_5d": qqq.get("change_5d", 0),
            "vix":          market_data["vix"],
            "vix_change_1d": market_data["vix_change_1d"],
            "iwm_change_5d": market_data["iwm"].get("change_5d", 0),
        },
        "sectors": market_data.get("sectors", {}),
        "scan_time": now_la.strftime(f"%Y-%m-%d %H:%M:%S {tz_abbr}"),
    }
