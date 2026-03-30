/**
 * Screener API Layer
 * Set NEXT_PUBLIC_BACKEND_URL + NEXT_PUBLIC_SCAN_API_KEY to connect to the
 * Render backend. Without those vars, mock data is used automatically.
 */

import type {
  DivergenceScreenerResult,
  DivergenceStock,
  DivergenceChartData,
  DivergenceDetail,
} from "@/types";

// ─── Backend URLs ─────────────────────────────────────────────────
const BACKEND_URL  = process.env.NEXT_PUBLIC_BACKEND_URL  ?? "";
const SCAN_API_KEY = process.env.NEXT_PUBLIC_SCAN_API_KEY ?? "";

// ─── Types ────────────────────────────────────────────────────────

export type ScanStatus = {
  status: "idle" | "running" | "done" | "error";
  started_at?: string;
  updated_at?: string;
  error?: string;
};

// ─── Public API ───────────────────────────────────────────────────

export async function fetchDivergenceScreener(): Promise<DivergenceScreenerResult> {
  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/screener/divergence`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (e) {
      throw new Error(`${(e as Error).message} [URL: ${BACKEND_URL}]`);
    }
  }
  // Mock: simulate network delay
  await new Promise((r) => setTimeout(r, 600));
  return MOCK_DIVERGENCE_DATA;
}

export async function fetchScanStatus(): Promise<ScanStatus> {
  if (!BACKEND_URL) return { status: "idle" };
  const res = await fetch(`${BACKEND_URL}/api/screener/status`);
  if (!res.ok) throw new Error(`Status API error: ${res.status}`);
  return res.json();
}

export async function triggerScan(): Promise<void> {
  if (!BACKEND_URL) return;
  const res = await fetch(`${BACKEND_URL}/api/screener/run`, {
    method: "POST",
    headers: { "X-API-Key": SCAN_API_KEY },
  });
  if (!res.ok && res.status !== 202) throw new Error(`Trigger error: ${res.status}`);
}

// ─── Mock Data ────────────────────────────────────────────────────

export const MOCK_DIVERGENCE_DATA: DivergenceScreenerResult = {
  date: "2026-03-29",
  stocks: [
    makeMockStock("NVDA",  "MACD+RSI", 875.40, +2.31, 2150.0, 1.8, 31.2, false),
    makeMockStock("AAPL",  "MACD",     172.50, -0.45, 2680.0, 1.2, 38.5, false),
    makeMockStock("AMD",   "RSI",       162.80, +1.05, 263.0,  2.3, 28.4, false),
    makeMockStock("SOXX",  "MACD",      196.20, +0.78, null,   1.5, 41.0, true),
    makeMockStock("MSFT",  "MACD+RSI", 378.90, -1.12, 2810.0, 1.6, 33.7, false),
  ],
};

// ─── Mock Stock Generator ─────────────────────────────────────────

type TriggerMode = "MACD" | "RSI" | "MACD+RSI";

function makeMockStock(
  ticker: string,
  mode: TriggerMode,
  price: number,
  pctChange: number,
  mktcapB: number | null,
  volRatio: number,
  rsiLatest: number,
  isEtf: boolean,
): DivergenceStock {
  const N = 120;

  // Generate a plausible price series ending at `price`
  const closes = generatePriceSeries(price, N);

  // Compute OHLCV from closes
  const open:   number[] = [];
  const high:   number[] = [];
  const low:    number[] = [];
  const volume: number[] = [];

  for (let i = 0; i < N; i++) {
    const c = closes[i];
    const range = c * (0.008 + Math.random() * 0.012);
    const o = c + (Math.random() - 0.5) * range;
    open.push(+o.toFixed(2));
    high.push(+(Math.max(c, o) + Math.random() * range * 0.5).toFixed(2));
    low.push( +(Math.min(c, o) - Math.random() * range * 0.5).toFixed(2));
    volume.push(Math.round(5e6 + Math.random() * 20e6));
  }

  // Compute indicators
  const macdRes = calcMACDArr(closes);
  const rsiArr  = calcRSIArr(closes);

  // Build chart data
  const dates = generateDates(N);
  const chart: DivergenceChartData = {
    dates,
    open, high, low,
    close: closes.map((v) => +v.toFixed(2)),
    volume,
    diff: macdRes.diff.map((v) => +(v ?? 0).toFixed(4)),
    dea:  macdRes.dea.map((v)  => +(v ?? 0).toFixed(4)),
    hist: macdRes.hist.map((v) => +(v ?? 0).toFixed(4)),
    rsi:  rsiArr.map((v)        => +(v ?? 50).toFixed(2)),
  };

  // Build divergence details
  const triggered: ("MACD" | "RSI")[] = [];
  const details: DivergenceStock["details"] = {};

  // Place b1 ~60 bars ago, b2 ~3 bars ago
  const b2 = N - 1 - 3;
  if (mode === "MACD" || mode === "MACD+RSI") {
    triggered.push("MACD");
    const gapBars = 45;
    const b1 = b2 - gapBars;
    details.macd = makeMacdDetail(closes, macdRes, b1, b2, gapBars);
  }
  if (mode === "RSI" || mode === "MACD+RSI") {
    triggered.push("RSI");
    const gapBars = 20;
    const b1 = b2 - gapBars;
    details.rsi = makeRsiDetail(closes, rsiArr, b1, b2, gapBars);
  }

  return {
    ticker, is_etf: isEtf, price, pct_change: pctChange,
    mktcap_b: mktcapB, vol_ratio: volRatio, rsi_latest: rsiLatest,
    triggered, details, chart,
  };
}

// ─── Price Series Generator ───────────────────────────────────────

function generatePriceSeries(endPrice: number, n: number): number[] {
  // Random walk backwards from endPrice, then reverse
  const arr: number[] = [endPrice];
  for (let i = 1; i < n; i++) {
    const prev = arr[arr.length - 1];
    const drift = (Math.random() - 0.49) * prev * 0.015;
    arr.push(Math.max(prev * 0.85, prev + drift));
  }
  arr.reverse();

  // Normalize so last value = endPrice exactly
  const scale = endPrice / arr[arr.length - 1];
  return arr.map((v) => v * scale);
}

// ─── Divergence Detail Builders ───────────────────────────────────

function makeMacdDetail(
  closes: number[],
  macd: { diff: (number | null)[]; hist: (number | null)[] },
  b1: number, b2: number, gapBars: number,
): DivergenceDetail {
  const priceDrop = ((closes[b1] - closes[b2]) / closes[b1]) * 100;
  const d1 = macd.diff[b1] ?? -0.5;
  const d2 = macd.diff[b2] ?? -0.3;
  const h1 = Math.abs(macd.hist[b1] ?? 0.8);
  const h2 = Math.abs(macd.hist[b2] ?? 0.5);
  return {
    b1, b2,
    price_b1: +closes[b1].toFixed(2),
    price_b2: +closes[b2].toFixed(2),
    indic_b1: +d1.toFixed(4),
    indic_b2: +d2.toFixed(4),
    gap_bars: gapBars,
    price_drop_pct: +priceDrop.toFixed(2),
    indic_rise: +(d2 - d1).toFixed(4),
    bars_ago: 3,
    hist_b1: +h1.toFixed(4),
    hist_b2: +h2.toFixed(4),
    hist_shrink_pct: +((1 - h2 / h1) * 100).toFixed(1),
    label: "MACD",
  };
}

function makeRsiDetail(
  closes: number[],
  rsi: (number | null)[],
  b1: number, b2: number, gapBars: number,
): DivergenceDetail {
  const priceDrop = ((closes[b1] - closes[b2]) / closes[b1]) * 100;
  const r1 = rsi[b1] ?? 28;
  const r2 = rsi[b2] ?? 25;
  return {
    b1, b2,
    price_b1: +closes[b1].toFixed(2),
    price_b2: +closes[b2].toFixed(2),
    indic_b1: +(r1 as number).toFixed(2),
    indic_b2: +(r2 as number).toFixed(2),
    gap_bars: gapBars,
    price_drop_pct: +priceDrop.toFixed(2),
    indic_rise: +((r2 as number) - (r1 as number)).toFixed(2),
    bars_ago: 3,
    label: "RSI",
  };
}

// ─── Date Generator ───────────────────────────────────────────────

function generateDates(n: number): string[] {
  const today = new Date("2026-03-29");
  let d = new Date(today);
  // walk backwards n trading days
  const arr: string[] = [];
  while (arr.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      arr.push(d.toISOString().slice(0, 10));
    }
    d.setDate(d.getDate() - 1);
  }
  return arr.reverse();
}

// ─── Inline indicator calculations (no import needed) ────────────

function calcEMAArr(arr: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) { result.push(arr[0]); continue; }
    result.push(arr[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcMACDArr(closes: number[]): {
  diff: (number | null)[];
  dea:  (number | null)[];
  hist: (number | null)[];
} {
  const fast = calcEMAArr(closes, 12);
  const slow = calcEMAArr(closes, 26);
  const diffArr = fast.map((v, i) => v - slow[i]);
  const deaArr  = calcEMAArr(diffArr, 9);
  return {
    diff: diffArr.map((v) => v),
    dea:  deaArr.map((v)  => v),
    hist: diffArr.map((v, i) => (v - deaArr[i]) * 2),
  };
}

function calcRSIArr(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(period).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain += d > 0 ? d : 0;
    avgLoss += d < 0 ? -d : 0;
  }
  avgGain /= period; avgLoss /= period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}
