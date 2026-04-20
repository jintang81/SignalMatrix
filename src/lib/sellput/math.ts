import type { Greeks, PutContract } from "./types";

// ─── Moving average ───────────────────────────────────────────────────────

export function calcSMA(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ─── RSI ──────────────────────────────────────────────────────────────────

export function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgG = gains / period;
  const avgL = losses / period;
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

// ─── ATR ──────────────────────────────────────────────────────────────────

export function calcATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number | null {
  if (closes.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
    );
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ─── Historical volatility ────────────────────────────────────────────────

export function calcHV(closes: number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

// ─── IV Rank (approximated via rolling HV) ───────────────────────────────

export function calcIVRank(currentIV: number, closes: number[]): number | null {
  if (closes.length < 252 + 20) return null;
  const hvs: number[] = [];
  for (let i = 20; i < closes.length; i++) {
    const w = closes.slice(i - 20, i + 1);
    const rets: number[] = [];
    for (let j = 1; j < w.length; j++) rets.push(Math.log(w[j] / w[j - 1]));
    const m = rets.reduce((a, b) => a + b, 0) / rets.length;
    const v =
      rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1);
    hvs.push(Math.sqrt(v) * Math.sqrt(252));
  }
  const last252 = hvs.slice(-252);
  const mn = Math.min(...last252);
  const mx = Math.max(...last252);
  if (mx === mn) return 50;
  return Math.max(0, Math.min(100, ((currentIV - mn) / (mx - mn)) * 100));
}

// ─── Trend strength ───────────────────────────────────────────────────────
//
// 趋势强度 (Trend Efficiency Ratio)，范围 0–1。
//
// 算法：取最近 period 根 K线（默认 20 根），
//   Trend = |净移动| / Σ|每日振幅|
//         = |close[N] - close[N-period]| / Σ|close[i] - close[i-1]|
//
// 直觉理解：
//   · 1.0 = 完美单向直线上涨/下跌（每天都同向，无反复）
//   · 0.0 = 完全震荡横盘（每天涨跌相互抵消，净移动≈0）
//   · 典型值：趋势行情 0.4–0.7，强趋势 > 0.7，震荡 < 0.3
//
// 在 Sell Put 策略中的含义：
//   · 趋势强度高（> 0.5）= 标的正在单向运动，方向性明确，
//     对于 Sell Put 来说，若同时是上升趋势则有利（卖方赚权利金的概率更高）
//   · 趋势强度低（< 0.3）= 震荡盘整，价格无序，
//     Sell Put 仍可操作，但需更宽的 OTM 以应对随机波动
//   · Gate1 中此指标作为市场环境评估的参考项之一
//
export function calcTrendStrength(closes: number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const start = closes[closes.length - period - 1];
  const end = closes[closes.length - 1];
  const net = Math.abs(end - start);
  let sumAbs = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    sumAbs += Math.abs(closes[i] - closes[i - 1]);
  }
  return sumAbs > 0 ? net / sumAbs : 0;
}

// ─── Normal CDF ───────────────────────────────────────────────────────────

export function normCdf(x: number): number {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741;
  const a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// ─── Black-Scholes Greeks ─────────────────────────────────────────────────

export function estimateGreeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: "put" | "call" = "put"
): Greeks | null {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return null;
  const d1 =
    (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) /
    (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const nd1 = Math.exp((-d1 * d1) / 2) / Math.sqrt(2 * Math.PI);
  let delta: number, theta: number;
  if (type === "call") {
    delta = normCdf(d1);
    theta =
      ((-S * nd1 * sigma) / (2 * Math.sqrt(T)) -
        r * K * Math.exp(-r * T) * normCdf(d2)) /
      365;
  } else {
    delta = normCdf(d1) - 1;
    theta =
      ((-S * nd1 * sigma) / (2 * Math.sqrt(T)) +
        r * K * Math.exp(-r * T) * normCdf(-d2)) /
      365;
  }
  return {
    delta,
    theta,
    gamma: nd1 / (S * sigma * Math.sqrt(T)),
    vega: (S * nd1 * Math.sqrt(T)) / 100,
  };
}

// ─── Synthetic puts (mock mode) ───────────────────────────────────────────

export function generateMockPuts(
  currentPrice: number,
  iv: number,
  dte: number
): PutContract[] {
  const puts: PutContract[] = [];
  const T = dte / 365;
  const r = 0.045;
  for (let pct = 0.8; pct <= 1.0; pct += 0.01) {
    const K = Math.round(currentPrice * pct * 2) / 2;
    const greeks = estimateGreeks(currentPrice, K, T, r, iv, "put");
    if (!greeks) continue;
    const d1 =
      (Math.log(currentPrice / K) + (r + iv * iv * 0.5) * T) /
      (iv * Math.sqrt(T));
    const d2 = d1 - iv * Math.sqrt(T);
    const putPrice =
      K * Math.exp(-r * T) * normCdf(-d2) - currentPrice * normCdf(-d1);
    const mid = Math.max(0.05, putPrice);
    const spread = mid * 0.02 + 0.02;
    const expDate = new Date(Date.now() + dte * 86400000)
      .toISOString()
      .slice(0, 10);
    puts.push({
      strike: K,
      bid: Math.max(0.01, mid - spread / 2),
      ask: mid + spread / 2,
      last: mid,
      volume: Math.round(500 * Math.exp(-Math.abs(pct - 0.9) * 10)),
      open_interest: Math.round(5000 * Math.exp(-Math.abs(pct - 0.9) * 5)),
      greeks,
      iv,
      expiration: expDate,
    });
  }
  return puts;
}

// ─── Formatters (shared across components) ───────────────────────────────

export const fmt = (n: number | null | undefined, d = 2): string =>
  n == null || isNaN(n as number) ? "–" : (+n).toFixed(d);

export const fmtPct = (n: number | null | undefined, d = 1): string =>
  n == null || isNaN(n as number) ? "–" : ((+n) * 100).toFixed(d) + "%";

export const fmtSignedPct = (n: number | null | undefined, d = 1): string => {
  if (n == null || isNaN(n as number)) return "–";
  const v = (+n) * 100;
  return (v >= 0 ? "+" : "") + v.toFixed(d) + "%";
};

export const todayStr = (): string => new Date().toISOString().slice(0, 10);
