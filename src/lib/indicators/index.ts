/**
 * Technical Indicator Calculations — pure functions, no side effects
 */
import type { YFChartResult, MACDResult, KDJResult, TechnicalSnapshot, PPSTResult, MCDXResult, GMMAResult, GMMASignals } from "@/types";

export type OHLCV = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// ─── Simple Moving Average ────────────────────────────────────────
export function calcMA(closes: (number | null)[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    if (slice.some((v) => v == null)) return null;
    return (slice as number[]).reduce((a, b) => a + b, 0) / period;
  });
}

// ─── EMA ─────────────────────────────────────────────────────────
export function calcEMA(closes: number[], period: number): (number | null)[] {
  if (closes.length < period) return new Array(closes.length).fill(null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(period - 1).fill(null);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// ─── RSI (Wilder smoothing) ───────────────────────────────────────
export function calcRSI(closes: (number | null)[], period = 14): (number | null)[] {
  const clean = closes.filter((v): v is number => v != null);
  if (clean.length < period + 1) return new Array(closes.length).fill(null);

  const result: (number | null)[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const d = clean[i] - clean[i - 1];
    avgGain += d > 0 ? d : 0;
    avgLoss += d < 0 ? -d : 0;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = 0; i < period; i++) result.push(null);
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < clean.length; i++) {
    const d = clean[i] - clean[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

// ─── MACD ────────────────────────────────────────────────────────
export function calcMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MACDResult {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);

  const macdLine: (number | null)[] = emaFast.map((v, i) =>
    v != null && emaSlow[i] != null ? v - (emaSlow[i] as number) : null
  );

  const nonNullMacd = macdLine.filter((v): v is number => v != null);
  const signalArr = calcEMA(nonNullMacd, signalPeriod);

  const nullCount = macdLine.findIndex((v) => v != null);
  const fullSignal: (number | null)[] = [
    ...new Array(nullCount >= 0 ? nullCount : 0).fill(null),
    ...signalArr,
  ];

  const histogram: (number | null)[] = macdLine.map((v, i) =>
    v != null && fullSignal[i] != null ? v - (fullSignal[i] as number) : null
  );

  return { macd: macdLine, signal: fullSignal, histogram };
}

// ─── KDJ (同花顺风格, 9,3,3) ──────────────────────────────────────
export function calcKDJ(
  highs: (number | null)[],
  lows: (number | null)[],
  closes: (number | null)[],
  period = 9
): KDJResult {
  const k: number[] = [];
  const d: number[] = [];
  const j: number[] = [];
  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < closes.length; i++) {
    const start = Math.max(0, i - period + 1);
    const hSlice = highs.slice(start, i + 1).filter((v): v is number => v != null);
    const lSlice = lows.slice(start, i + 1).filter((v): v is number => v != null);
    const c = (closes[i] as number) ?? prevK;

    const hh = hSlice.length ? Math.max(...hSlice) : c;
    const ll = lSlice.length ? Math.min(...lSlice) : c;
    const rsv = hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100;

    const kv = (1 / 3) * rsv + (2 / 3) * prevK;
    const dv = (1 / 3) * kv + (2 / 3) * prevD;
    const jv = 3 * kv - 2 * dv;

    k.push(kv);
    d.push(dv);
    j.push(jv);
    prevK = kv;
    prevD = dv;
  }
  return { k, d, j };
}

// ─── Volume MA ───────────────────────────────────────────────────
export function calcVolMA(volumes: (number | null)[], period: number): (number | null)[] {
  return volumes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = volumes.slice(i - period + 1, i + 1).filter((v): v is number => v != null);
    if (slice.length < period) return null;
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

// ─── ATR (Wilder's RMA) ──────────────────────────────────────────
export function calcATR(
  highs: (number | null)[],
  lows: (number | null)[],
  closes: (number | null)[],
  period: number
): number[] {
  const n = closes.length;
  const tr = new Array<number>(n).fill(NaN);
  const atr = new Array<number>(n).fill(NaN);

  for (let i = 1; i < n; i++) {
    const h = highs[i], l = lows[i], c = closes[i], cp = closes[i - 1];
    if (h == null || l == null || c == null || cp == null) continue;
    tr[i] = Math.max(h - l, Math.abs(h - cp), Math.abs(l - cp));
  }

  let seed = 0, cnt = 0;
  for (let i = 1; i < n; i++) {
    if (isNaN(tr[i])) continue;
    if (cnt < period) {
      seed += tr[i];
      cnt++;
      if (cnt === period) atr[i] = seed / period;
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }
  }
  return atr;
}

// ─── Pivot High / Low ────────────────────────────────────────────
export function calcPivots(
  highs: (number | null)[],
  lows: (number | null)[],
  prd: number
): { ph: number[]; pl: number[] } {
  const n = highs.length;
  const ph = new Array<number>(n).fill(NaN);
  const pl = new Array<number>(n).fill(NaN);

  for (let c = prd; c < n - prd; c++) {
    let isHigh = highs[c] != null;
    let isLow = lows[c] != null;
    for (let j = c - prd; j <= c + prd && (isHigh || isLow); j++) {
      if (j === c) continue;
      if (isHigh && (highs[j] == null || (highs[j] as number) > (highs[c] as number))) isHigh = false;
      if (isLow && (lows[j] == null || (lows[j] as number) < (lows[c] as number))) isLow = false;
    }
    if (isHigh) ph[c] = highs[c] as number;
    if (isLow) pl[c] = lows[c] as number;
  }
  return { ph, pl };
}

// ─── Pivot Point SuperTrend ───────────────────────────────────────
export function calcPPSuperTrend(
  highs: (number | null)[],
  lows: (number | null)[],
  closes: (number | null)[],
  prd: number,
  factor: number,
  atrPd: number
): PPSTResult {
  const n = closes.length;
  const atr = calcATR(highs, lows, closes, atrPd);
  const { ph, pl } = calcPivots(highs, lows, prd);

  // Center: weighted pivot average  (cval = isNaN(cval) ? lastpp : (cval*2+lastpp)/3)
  const center = new Array<number>(n).fill(NaN);
  const support = new Array<number>(n).fill(NaN);
  const resistance = new Array<number>(n).fill(NaN);
  let cval = NaN, lastSup = NaN, lastRes = NaN;

  for (let i = 0; i < n; i++) {
    const lastpp = !isNaN(ph[i]) ? ph[i] : !isNaN(pl[i]) ? pl[i] : NaN;
    if (!isNaN(lastpp)) cval = isNaN(cval) ? lastpp : (cval * 2 + lastpp) / 3;
    center[i] = cval;
    if (!isNaN(ph[i])) lastRes = ph[i];
    if (!isNaN(pl[i])) lastSup = pl[i];
    support[i] = lastSup;
    resistance[i] = lastRes;
  }

  // TUp / TDown trailing stops + trend
  const TUp = new Array<number>(n).fill(NaN);
  const TDown = new Array<number>(n).fill(NaN);
  const trend = new Array<number>(n).fill(0);
  const st = new Array<number>(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    const c = closes[i];
    if (isNaN(center[i]) || isNaN(atr[i]) || c == null) continue;
    const Up = center[i] - factor * atr[i];
    const Dn = center[i] + factor * atr[i];

    if (i === 0 || isNaN(TUp[i - 1])) {
      TUp[i] = Up;
      TDown[i] = Dn;
      trend[i] = c >= center[i] ? 1 : -1;
    } else {
      const prevC = closes[i - 1] ?? c;
      TUp[i] = prevC > TUp[i - 1] ? Math.max(Up, TUp[i - 1]) : Up;
      TDown[i] = prevC < TDown[i - 1] ? Math.min(Dn, TDown[i - 1]) : Dn;
      if (c > TDown[i - 1]) trend[i] = 1;
      else if (c < TUp[i - 1]) trend[i] = -1;
      else trend[i] = trend[i - 1] !== 0 ? trend[i - 1] : 1;
    }
    st[i] = trend[i] === 1 ? TUp[i] : TDown[i];
  }

  return { st, trend, center, support, resistance, ph, pl };
}

// ─── Bollinger Bands ─────────────────────────────────────────────
export function calcBollingerBands(
  closes: (number | null)[],
  period = 20,
  stdDev = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const n = closes.length;
  const upper: (number | null)[] = new Array(n).fill(null);
  const middle: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);

  for (let i = period - 1; i < n; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    if (slice.some((v) => v == null)) continue;
    const vals = slice as number[];
    const mean = vals.reduce((a, b) => a + b, 0) / period;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sigma = Math.sqrt(variance);
    middle[i] = mean;
    upper[i] = mean + stdDev * sigma;
    lower[i] = mean - stdDev * sigma;
  }
  return { upper, middle, lower };
}

// ─── SMA helper (for RSI MA) ──────────────────────────────────────
export function calcSMA(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (!isNaN(arr[j])) { sum += arr[j]; cnt++; }
    }
    if (cnt === period) out[i] = sum / period;
  }
  return out;
}

// ─── MCDX 六彩神龙 (Smart Money Detector) ────────────────────────
export function calcMCDX(closes: (number | null)[]): MCDXResult {
  // Forward-fill nulls so RSI works on a clean series
  let last = 0;
  const C: (number | null)[] = closes.map((v) => {
    if (v != null && !isNaN(v as number)) last = v;
    return last;
  });

  const rsi50 = calcRSI(C, 50);
  const rsi40 = calcRSI(C, 40);

  const banker = rsi50.map((v) =>
    v === null ? null : Math.max(0, Math.min(20, 1.5 * (v - 50)))
  );
  const hotMoney = rsi40.map((v) =>
    v === null ? null : Math.max(0, Math.min(20, 0.7 * (v - 30)))
  );

  // SMA(10) on banker, treating null as NaN
  const bankerNaN = banker.map((v) => (v === null ? NaN : v));
  const bankerMA = calcSMA(bankerNaN, 10).map((v) => (isNaN(v) ? null : v));

  return { banker, hotMoney, bankerMA };
}

// ─── GMMA (顾比均线加强版) ────────────────────────────────────────
const GMMA_SHORT_P = [3, 5, 8, 10, 12, 15] as const;
const GMMA_LONG_P  = [30, 35, 40, 45, 50, 60] as const;

export function calcGMMA(closes: (number | null)[]): GMMAResult {
  // Forward-fill nulls; seed with first valid close (not 0) to match HTML prototype
  const firstValid = closes.find((v): v is number => v != null && !isNaN(v)) ?? 0;
  let last = firstValid;
  const C: number[] = closes.map((v) => {
    if (v != null && !isNaN(v as number)) last = v;
    return last;
  });
  return {
    short: GMMA_SHORT_P.map((p) => calcEMA(C, p)),
    long:  GMMA_LONG_P.map((p)  => calcEMA(C, p)),
  };
}

export function calcGMMASignals(
  closes: (number | null)[],
  highs: (number | null)[],
  lows: (number | null)[],
  gmma: GMMAResult
): GMMASignals {
  const n = closes.length;
  const longBull    = new Array<boolean>(n).fill(false);
  const longBear    = new Array<boolean>(n).fill(false);
  const tripleCross = new Array<boolean>(n).fill(false);
  const break12     = new Array<boolean>(n).fill(false);
  const smiley      = new Array<boolean>(n).fill(false);

  // Simple rolling ATR(14) per bar — matches HTML prototype (not Wilder RMA)
  const simpleATR = new Array<number>(n).fill(NaN);
  for (let i = 14; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - 13; j <= i; j++) {
      const h = highs[j], l = lows[j], cp = closes[j - 1];
      if (h == null || l == null || cp == null) continue;
      sum += Math.max(h - l, Math.abs(h - (cp as number)), Math.abs(l - (cp as number)));
      cnt++;
    }
    if (cnt === 14) simpleATR[i] = sum / 14;
  }

  for (let i = 0; i < n; i++) {
    // Long-term alignment
    const lv = gmma.long.map((arr) => arr[i]);
    if (lv.every((v) => v != null)) {
      let bull = true, bear = true;
      for (let j = 0; j < lv.length - 1; j++) {
        if ((lv[j] as number) <= (lv[j + 1] as number)) bull = false;
        if ((lv[j] as number) >= (lv[j + 1] as number)) bear = false;
      }
      longBull[i] = bull;
      longBear[i] = bear;
    }

    if (i < 1) continue;
    const prev = closes[i - 1], curr = closes[i];
    if (prev == null || curr == null) continue;

    // Triple cross: close crossed EMA3/5/8 from below + long bullish
    const [e3p, e5p, e8p] = [gmma.short[0][i-1], gmma.short[1][i-1], gmma.short[2][i-1]];
    const [e3, e5, e8]    = [gmma.short[0][i],   gmma.short[1][i],   gmma.short[2][i]];
    if (e3p != null && e5p != null && e8p != null && e3 != null && e5 != null && e8 != null) {
      if (prev < e3p && prev < e5p && prev < e8p && curr > e3 && curr > e5 && curr > e8 && longBull[i]) {
        tripleCross[i] = true;
      }
    }

    // Break12: close crossed all 12 EMAs from below in one bar
    const allArrs  = [...gmma.short, ...gmma.long];
    const prevVals = allArrs.map((arr) => arr[i - 1]);
    const currVals = allArrs.map((arr) => arr[i]);
    if (prevVals.every((v) => v != null) && currVals.every((v) => v != null)) {
      if (prevVals.every((pv, j) => (prev as number) < (pv as number) && (curr as number) > (currVals[j] as number))) {
        break12[i] = true;
      }
    }
  }

  // Smiley: ATR-based dip signal with peak-of-segment filtering
  // Conditions: EMA3 < EMA15 (bearish fan) + close < EMA15 + gap > ATR(14)*1.5
  const scores = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const c = closes[i];
    if (c == null) continue;
    const sv = gmma.short.map((arr) => arr[i]);
    if (sv.some((v) => v == null)) continue;
    const e3 = sv[0] as number, e15 = sv[5] as number;
    if (e3 >= e15) continue;      // EMA3 must be < EMA15 (short band bearish)
    if (c >= e15) continue;       // close below EMA15 (slowest short EMA)
    const atr = simpleATR[i];
    if (isNaN(atr) || atr === 0) continue;
    scores[i] = (e15 - c) / atr;
  }
  // Peak-of-segment: gap=3 zero bars ends a segment; threshold=1.5
  const GAP = 3;
  let segMaxScore = 0, segMaxIdx = -1, zeroCount = 0;
  const flushSeg = () => {
    if (segMaxIdx >= 0 && segMaxScore >= 1.5) smiley[segMaxIdx] = true;
    segMaxScore = 0; segMaxIdx = -1;
  };
  for (let i = 0; i < n; i++) {
    const s = scores[i];
    if (s > 0) {
      zeroCount = 0;
      if (s > segMaxScore) { segMaxScore = s; segMaxIdx = i; }
    } else {
      zeroCount++;
      if (zeroCount >= GAP) flushSeg();
    }
  }
  flushSeg();

  // kdCross: K crosses above D after a smiley (entry trigger)
  const kdj = calcKDJ(highs, lows, closes, 9);
  const kdCross = new Array<boolean>(n).fill(false);
  let waitKD = false;
  for (let i = 1; i < n; i++) {
    if (smiley[i]) { waitKD = true; continue; }
    if (waitKD && kdj.k[i - 1] <= kdj.d[i - 1] && kdj.k[i] > kdj.d[i]) {
      kdCross[i] = true;
      waitKD = false;
    }
  }

  return { tripleCross, break12, smiley, kdCross, longBull, longBear };
}

// ─── Snapshot (last-bar values for display + AI payload) ─────────
export function computeTechnicalSnapshot(chart: YFChartResult): TechnicalSnapshot {
  const { highs, lows, closes, volumes } = chart;
  const last = closes.length - 1;
  const price = (closes[last] ?? 0) as number;

  const cleanCloses = closes.filter((v): v is number => v != null);

  // RSI
  const rsiArr = calcRSI(closes, 14);
  const rsi14 = (rsiArr[rsiArr.length - 1] ?? null) as number | null;

  // KDJ
  const kdjResult = calcKDJ(highs, lows, closes, 9);
  const kdj =
    kdjResult.k.length > 0
      ? {
          k: kdjResult.k[kdjResult.k.length - 1],
          d: kdjResult.d[kdjResult.d.length - 1],
          j: kdjResult.j[kdjResult.j.length - 1],
        }
      : null;

  // MACD
  let macdSnap = null;
  if (cleanCloses.length >= 35) {
    const macdResult = calcMACD(cleanCloses, 12, 26, 9);
    const idx = macdResult.macd.length - 1;
    if (macdResult.macd[idx] != null) {
      macdSnap = {
        macd: macdResult.macd[idx] as number,
        signal: (macdResult.signal[idx] ?? 0) as number,
        histogram: (macdResult.histogram[idx] ?? 0) as number,
      };
    }
  }

  // MA full series
  const ma20Full = calcMA(closes, 20);
  const ma50Full = calcMA(closes, 50);
  const ma200Full = calcMA(closes, 200);
  const volMa20Full = calcVolMA(volumes, 20);

  // Last 60 bars for chart rendering
  const ma20 = ma20Full.slice(-60);
  const ma50 = ma50Full.slice(-60);
  const ma200 = ma200Full.slice(-60);
  const volMa20 = volMa20Full.slice(-60);

  // MA snapshot (last bar, for MA reference table)
  const masPeriods = [5, 10, 20, 50, 200] as const;
  const mas = masPeriods.map((p) => {
    const arr = calcMA(closes, p);
    const val = (arr[last] ?? null) as number | null;
    return {
      period: p,
      value: val,
      distancePct: val != null && price ? ((price - val) / val) * 100 : null,
    };
  });

  // MA trend
  const ma20Last = ma20Full[last];
  const ma50Last = ma50Full[last];
  let maTrend: "above" | "below" | "mixed" = "mixed";
  if (ma20Last != null && ma50Last != null) {
    if (price > ma20Last && price > ma50Last) maTrend = "above";
    else if (price < ma20Last && price < ma50Last) maTrend = "below";
  }

  // Volume ratio
  const volMa20Last = volMa20Full[last];
  const currentVol = volumes[last];
  const volRatio =
    volMa20Last != null && currentVol != null && volMa20Last > 0
      ? currentVol / volMa20Last
      : null;

  // 52-week position
  const yearCloses = closes
    .slice(Math.max(0, last - 251), last + 1)
    .filter((v): v is number => v != null);
  const high52 = yearCloses.length ? Math.max(...yearCloses) : null;
  const low52 = yearCloses.length ? Math.min(...yearCloses) : null;
  const weekPos52 =
    high52 != null && low52 != null && high52 !== low52
      ? ((price - low52) / (high52 - low52)) * 100
      : null;

  // Support / Resist (20-day)
  const recent20 = closes.slice(-20).filter((v): v is number => v != null);
  const support = recent20.length ? Math.min(...recent20) : null;
  const resist = recent20.length ? Math.max(...recent20) : null;

  return {
    rsi14,
    kdj,
    macd: macdSnap,
    maTrend,
    volRatio,
    weekPos52,
    support,
    resist,
    mas,
    maLines: { ma20, ma50, ma200, volMa20 },
  };
}
