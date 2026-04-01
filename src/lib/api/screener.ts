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
  VolumeSurgeScreenerResult,
  VolumeSurgeStock,
  VolumeSurgeChartData,
  DuckScreenerResult,
  DuckStock,
  DuckChartData,
  OptionsScreenerResult,
  TopDivScreenerResult,
  TopDivStock,
  TopDivDetail,
  TopVolumeSurgeScreenerResult,
  TopVolumeSurgeStock,
  TopVolumeSurgeChartData,
  AIStrategyResult,
} from "@/types";

// ─── Backend URLs ─────────────────────────────────────────────────
const _envUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
// If env var is missing or points to localhost, use the production Render URL
const BACKEND_URL = (_envUrl && !_envUrl.startsWith("http://localhost"))
  ? _envUrl
  : "https://signalmatrix-api.onrender.com";
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
    const res = await fetch(`${BACKEND_URL}/api/screener/divergence`);
    if (!res.ok) throw new Error(`Screener API error: ${res.status}`);
    return res.json();
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

// ─── Volume Surge Public API ──────────────────────────────────────

export async function fetchVolumeSurgeScreener(): Promise<VolumeSurgeScreenerResult> {
  if (BACKEND_URL) {
    const res = await fetch(`${BACKEND_URL}/api/screener/volume`);
    // 404 = no scan run yet, or endpoint not deployed — fall back to mock data
    if (res.status === 404) return MOCK_VOLUME_SURGE_DATA;
    if (!res.ok) throw new Error(`Volume screener API error: ${res.status}`);
    return res.json();
  }
  await new Promise((r) => setTimeout(r, 600));
  return MOCK_VOLUME_SURGE_DATA;
}

export async function fetchVolumeSurgeStatus(): Promise<ScanStatus> {
  if (!BACKEND_URL) return { status: "idle" };
  try {
    const res = await fetch(`${BACKEND_URL}/api/screener/volume/status`);
    if (!res.ok) return { status: "idle" };
    return res.json();
  } catch {
    return { status: "idle" };
  }
}

export async function triggerVolumeScan(): Promise<void> {
  if (!BACKEND_URL) return;
  const res = await fetch(`${BACKEND_URL}/api/screener/volume/run`, {
    method: "POST",
    headers: { "X-API-Key": SCAN_API_KEY },
  });
  if (!res.ok && res.status !== 202) throw new Error(`Volume trigger error: ${res.status}`);
}

// ─── Duck Bill Public API ─────────────────────────────────────────

export async function fetchDuckScreener(): Promise<DuckScreenerResult> {
  if (BACKEND_URL) {
    const res = await fetch(`${BACKEND_URL}/api/screener/duck`);
    // 404 = no scan run yet — fall back to mock data
    if (res.status === 404) return MOCK_DUCK_DATA;
    if (!res.ok) throw new Error(`Duck screener API error: ${res.status}`);
    return res.json();
  }
  await new Promise((r) => setTimeout(r, 600));
  return MOCK_DUCK_DATA;
}

export async function fetchDuckStatus(): Promise<ScanStatus> {
  if (!BACKEND_URL) return { status: "idle" };
  try {
    const res = await fetch(`${BACKEND_URL}/api/screener/duck/status`);
    if (!res.ok) return { status: "idle" };
    return res.json();
  } catch {
    return { status: "idle" };
  }
}

export async function triggerDuckScan(): Promise<void> {
  if (!BACKEND_URL) return;
  const res = await fetch(`${BACKEND_URL}/api/screener/duck/run`, {
    method: "POST",
    headers: { "X-API-Key": SCAN_API_KEY },
  });
  if (!res.ok && res.status !== 202) throw new Error(`Duck trigger error: ${res.status}`);
}

// ─── Mock Data ────────────────────────────────────────────────────

export const MOCK_DIVERGENCE_DATA: DivergenceScreenerResult = {
  date: "2026-03-29",
  scan_time: "2026-03-29 17:30:00 PDT",
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

// ─── Volume Surge Mock Data ───────────────────────────────────────

export const MOCK_VOLUME_SURGE_DATA: VolumeSurgeScreenerResult = {
  date: "2026-03-29",
  scan_time: "2026-03-29 17:35:00 PDT",
  results: [
    makeMockVolumeStock("META",  525.72, 643.11, -19.1, 28975085, 35780100, 12863405, 2.25, 2.78, 1329837768704),
    makeMockVolumeStock("AMD",   104.50, 148.20, -22.4, 58432100, 62100300, 24560000, 2.38, 2.53, 168900000000),
    makeMockVolumeStock("NVDA",  865.30, 950.40,  -8.9, 42100500, 48750200, 18340000, 2.30, 2.66, 2130000000000),
    makeMockVolumeStock("INTC",   21.80,  28.50, -15.2, 87650400, 91230100, 36800000, 2.38, 2.48,  93500000000),
    makeMockVolumeStock("SOXX",  178.40, 220.10, -18.9, 12340200, 14120600,  5240000, 2.36, 2.69, null),
  ].filter(Boolean) as VolumeSurgeStock[],
  params: {
    volume_multiplier: 1.5,
    ma50_period:       50,
    vol_ma_period:     20,
    min_market_cap_b:  5.0,
  },
};

function makeMockVolumeStock(
  ticker: string,
  lastClose: number,
  ma50: number,
  ytdReturn: number,
  lastVol: number,
  prevVol: number,
  volMa20: number,
  volRatio: number,
  volRatio2: number,
  marketCap: number | null,
): VolumeSurgeStock {
  const N = 60;
  // Generate a declining price series ending at lastClose, starting ~ma50 level
  const startPrice = ma50 * (1 + Math.abs(ytdReturn) / 100 * 0.5);
  const closes = generateVolumePriceSeries(startPrice, lastClose, N);

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
    // Surge on last 2 bars
    if (i >= N - 2) {
      volume.push(i === N - 1 ? lastVol : prevVol);
    } else {
      volume.push(Math.round(volMa20 * (0.6 + Math.random() * 0.8)));
    }
  }

  // MA50 series (using actual full close series)
  const ma50Series: (number | null)[] = closes.map((_, i) => {
    if (i < 49) return null;
    return closes.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;
  });

  // Vol MA20 series
  const volMa20Series: (number | null)[] = volume.map((_, i) => {
    if (i < 19) return null;
    return volume.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
  });

  const dates = generateDates(N);

  const chart: VolumeSurgeChartData = {
    dates,
    open,
    high,
    low,
    close: closes.map((v) => +v.toFixed(2)),
    volume,
    ma50:     ma50Series.map((v) => v === null ? null : +v.toFixed(2)),
    vol_ma20: volMa20Series.map((v) => v === null ? null : +v.toFixed(0)),
  };

  return {
    ticker,
    last_close: lastClose,
    ma50,
    ytd_return: ytdReturn,
    last_vol:   lastVol,
    prev_vol:   prevVol,
    vol_ma20:   volMa20,
    vol_ratio:  volRatio,
    vol_ratio2: volRatio2,
    market_cap: marketCap ?? 0,
    chart,
  };
}

function generateVolumePriceSeries(startPrice: number, endPrice: number, n: number): number[] {
  // Linear drift + noise from start to end
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = startPrice + (endPrice - startPrice) * t;
    const noise = base * (Math.random() - 0.5) * 0.02;
    arr.push(Math.max(base + noise, 0.01));
  }
  // Normalize so last = endPrice
  const scale = endPrice / arr[arr.length - 1];
  return arr.map((v) => v * scale);
}

// ─── Duck Bill Mock Data ──────────────────────────────────────────

export const MOCK_DUCK_DATA: DuckScreenerResult = {
  date: "2026-03-29",
  scan_time: "2026-03-29 18:02:45 PDT",
  stocks: [
    makeMockDuckStock("NVDA",  875.40, +2.31, 2150.0, 1.8, false, 38.5, 0.021, 2),
    makeMockDuckStock("MSFT",  378.90, +0.87, 2810.0, 1.6, false, 31.2, 0.035, 1),
    makeMockDuckStock("AAPL",  172.50, +1.15, 2680.0, 1.4, false, 28.9, 0.018, 3),
    makeMockDuckStock("SMH",   196.20, +0.78, null,   2.1, true,  44.3, 0.028, 2),
    makeMockDuckStock("QQQ",   432.60, +1.02, null,   1.3, true,  29.7, 0.022, 1),
  ],
};

function makeMockDuckStock(
  ticker: string,
  price: number,
  pctChange: number,
  mktcapB: number | null,
  volRatio: number,
  isEtf: boolean,
  divergeAngle: number,
  gapRatioMin: number,
  barsSinceReversal: number,
): DuckStock {
  const N = 60;
  // Generate a rising price series for a bullish duck bill stock
  const closes = generateDuckPriceSeries(price, N);
  const open:   number[] = [];
  const high:   number[] = [];
  const low:    number[] = [];
  const volume: number[] = [];

  for (let i = 0; i < N; i++) {
    const c = closes[i];
    const range = c * (0.008 + Math.random() * 0.012);
    const o = c + (Math.random() - 0.52) * range; // slight bull bias
    open.push(+o.toFixed(2));
    high.push(+(Math.max(c, o) + Math.random() * range * 0.5).toFixed(2));
    low.push( +(Math.min(c, o) - Math.random() * range * 0.5).toFixed(2));
    volume.push(Math.round(5e6 + Math.random() * 20e6));
  }

  // Build MACD that exhibits the duck bill pattern above zero
  const macdRes = calcMACDArr(closes);

  // Shift MACD series upward to simulate "above zero axis" condition
  const diffShift = Math.max(0, -Math.min(...macdRes.diff.map(v => v ?? 0))) + price * 0.002;
  const diff = macdRes.diff.map(v => +((v ?? 0) + diffShift).toFixed(4));
  const dea  = macdRes.dea.map(v  => +((v ?? 0) + diffShift * 0.7).toFixed(4));
  const hist = diff.map((v, i) => +((v - dea[i]) * 2).toFixed(4));

  const dates = generateDates(N);
  const chart: DuckChartData = {
    dates,
    open, high, low,
    close: closes.map((v) => +v.toFixed(2)),
    volume,
    diff, dea, hist,
  };

  // Compute MA values from price series
  const ma5  = +closes.slice(-5).reduce((a,b)=>a+b,0)/5;
  const ma10 = +closes.slice(-10).reduce((a,b)=>a+b,0)/10;
  const ma20 = +closes.slice(-20).reduce((a,b)=>a+b,0)/20;

  const reversal_date = generateDates(N)[N - 1 - barsSinceReversal] ?? "2026-03-28";

  return {
    ticker, is_etf: isEtf, price, pct_change: pctChange,
    mktcap_b: mktcapB, ma5: +ma5.toFixed(2), ma10: +ma10.toFixed(2), ma20: +ma20.toFixed(2),
    vol_ratio: volRatio,
    duck: {
      diff_latest:         diff[diff.length - 1],
      dea_latest:          dea[dea.length - 1],
      hist_latest:         hist[hist.length - 1],
      gap_ratio_min:       +(gapRatioMin * 100).toFixed(3),
      bars_since_reversal: barsSinceReversal,
      diverge_angle:       divergeAngle,
      reversal_date,
    },
    chart,
  };
}

function generateDuckPriceSeries(endPrice: number, n: number): number[] {
  // Rising trend with a brief pullback in the middle (duck bill shape)
  const arr: number[] = [];
  const startPrice = endPrice * 0.88;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // base trend up, with a dip around 60-70% of the way
    const dip = Math.exp(-((t - 0.65) ** 2) / 0.01) * 0.03;
    const base = startPrice + (endPrice - startPrice) * t - endPrice * dip;
    const noise = base * (Math.random() - 0.48) * 0.015;
    arr.push(Math.max(base + noise, endPrice * 0.5));
  }
  const scale = endPrice / arr[arr.length - 1];
  return arr.map((v) => v * scale);
}

// ─── Options Flow Public API ──────────────────────────────────────

export async function fetchOptionsScreener(): Promise<OptionsScreenerResult> {
  if (BACKEND_URL) {
    const res = await fetch(`${BACKEND_URL}/api/screener/options`);
    if (res.status === 404) return MOCK_OPTIONS_DATA;
    if (!res.ok) throw new Error(`Options screener API error: ${res.status}`);
    return res.json();
  }
  await new Promise((r) => setTimeout(r, 600));
  return MOCK_OPTIONS_DATA;
}

export async function fetchOptionsStatus(): Promise<ScanStatus> {
  if (!BACKEND_URL) return { status: "idle" };
  try {
    const res = await fetch(`${BACKEND_URL}/api/screener/options/status`);
    if (!res.ok) return { status: "idle" };
    return res.json();
  } catch {
    return { status: "idle" };
  }
}

export async function triggerOptionsScan(): Promise<void> {
  if (!BACKEND_URL) return;
  const res = await fetch(`${BACKEND_URL}/api/screener/options/run`, {
    method: "POST",
    headers: { "X-API-Key": SCAN_API_KEY },
  });
  if (!res.ok && res.status !== 202) throw new Error(`Options trigger error: ${res.status}`);
}

// ─── Options Mock Data ────────────────────────────────────────────

export const MOCK_OPTIONS_DATA: OptionsScreenerResult = {
  date: "2026-03-29",
  scan_time: "07:00",
  stocks: [
    {
      ticker: "NVDA",
      info: { name: "英伟达", sector: "半导体", "2x": "NVDL", "3x": "NVDX", inv2x: "NVD", inv3x: "-" },
      price: 865.30, change_1d: -3.2, change_5d: -9.5,
      high_52w: 974.00, drop_52w: -11.2,
      stars: 4, overall: "BUY",
      signals: [
        {
          name: "UNUSUAL_VOLUME", direction: "BULLISH",
          data: {
            contracts: [
              { type: "CALL", strike: 900, expiry: "2026-04-17", volume: 8420, oi: 1850, ratio: 4.6, iv: 52.3, last: 12.50 },
              { type: "CALL", strike: 880, expiry: "2026-04-17", volume: 6100, oi: 980,  ratio: 6.2, iv: 48.1, last: 18.90 },
              { type: "PUT",  strike: 820, expiry: "2026-04-17", volume: 3200, oi: 740,  ratio: 4.3, iv: 55.6, last: 9.30  },
            ],
            uv_call_vol: 14520, uv_put_vol: 3200,
          },
        },
        {
          name: "LOW_PUT_CALL_RATIO", direction: "BULLISH",
          data: { pc_ratio: 0.38, threshold: 0.5, call_vol: 42800, put_vol: 16300 },
        },
        {
          name: "HEAVY_CALL_FLOW", direction: "BULLISH",
          data: { call_vol: 14520, put_vol: 3200, ratio: 4.5 },
        },
      ],
    },
    {
      ticker: "SPY",
      info: { name: "标普500", sector: "大盘指数", "2x": "SSO", "3x": "UPRO", inv2x: "SDS", inv3x: "SPXU" },
      price: 512.40, change_1d: -1.8, change_5d: -5.2,
      high_52w: 578.00, drop_52w: -11.3,
      stars: 2, overall: "BUY",
      signals: [
        {
          name: "UNUSUAL_VOLUME", direction: "BULLISH",
          data: {
            contracts: [
              { type: "CALL", strike: 530, expiry: "2026-04-03", volume: 52000, oi: 14500, ratio: 3.6, iv: 22.1, last: 3.80 },
              { type: "CALL", strike: 520, expiry: "2026-04-03", volume: 38500, oi: 9800,  ratio: 3.9, iv: 20.4, last: 6.50 },
            ],
            uv_call_vol: 90500, uv_put_vol: 0,
          },
        },
        {
          name: "LOW_PUT_CALL_RATIO", direction: "BULLISH",
          data: { pc_ratio: 0.44, threshold: 0.5, call_vol: 285000, put_vol: 126000 },
        },
      ],
    },
    {
      ticker: "TSLA",
      info: { name: "特斯拉", sector: "新能源车", "2x": "TSLR", "3x": "TSLT", inv2x: "TSDD", inv3x: "-" },
      price: 172.80, change_1d: -6.4, change_5d: -18.2,
      high_52w: 358.64, drop_52w: -51.8,
      stars: 2, overall: "WARNING",
      signals: [
        {
          name: "UNUSUAL_VOLUME", direction: "BEARISH",
          data: {
            contracts: [
              { type: "PUT", strike: 160, expiry: "2026-04-17", volume: 18500, oi: 4200, ratio: 4.4, iv: 78.5, last: 8.40 },
              { type: "PUT", strike: 150, expiry: "2026-04-17", volume: 12300, oi: 3100, ratio: 4.0, iv: 82.1, last: 5.60 },
            ],
            uv_call_vol: 0, uv_put_vol: 30800,
          },
        },
        {
          name: "HIGH_PUT_OI", direction: "BEARISH",
          data: { put_oi: 285000, call_oi: 142000, ratio: 2.01 },
        },
        {
          name: "DIP_BUY_SIGNAL:52WK_DROP+5D_DROP+INTRADAY", direction: "BUY_SIGNAL",
          data: {
            triggers: ["Intraday drop: -6.4%", "5-day drop: -18.2%", "From 52-week high: -51.8%"],
            drop_52w: -51.8, drop_5d: -18.2, drop_1d: -6.4,
            pc_ratio: 1.82, call_vol: 98000, put_vol: 178000,
            notable_calls: [
              { type: "CALL", strike: 180, expiry: "2026-04-17", volume: 6200, oi: 1450, ratio: 4.3, iv: 75.2, last: 5.10 },
            ],
          },
        },
      ],
    },
  ],
  params: {
    uv_vol_oi_ratio: 3.0,
    uv_min_volume: 500,
    pc_bull_threshold: 0.5,
    hpi_ratio: 1.5,
    hcf_ratio: 3.0,
    dip_52w_drop: -30.0,
    dip_5d_drop: -10.0,
    dip_1d_drop: -5.0,
  },
};

// ─── Top Divergence Public API ────────────────────────────────────

export async function fetchTopDivScreener(): Promise<TopDivScreenerResult> {
  if (BACKEND_URL) {
    const res = await fetch(`${BACKEND_URL}/api/screener/top-divergence`);
    if (res.status === 404) return MOCK_TOP_DIV_DATA;
    if (!res.ok) throw new Error(`Top divergence screener API error: ${res.status}`);
    return res.json();
  }
  await new Promise((r) => setTimeout(r, 600));
  return MOCK_TOP_DIV_DATA;
}

export async function fetchTopDivStatus(): Promise<ScanStatus> {
  if (!BACKEND_URL) return { status: "idle" };
  try {
    const res = await fetch(`${BACKEND_URL}/api/screener/top-divergence/status`);
    if (!res.ok) return { status: "idle" };
    return res.json();
  } catch {
    return { status: "idle" };
  }
}

export async function triggerTopDivScan(): Promise<void> {
  if (!BACKEND_URL) return;
  const res = await fetch(`${BACKEND_URL}/api/screener/top-divergence/run`, {
    method: "POST",
    headers: { "X-API-Key": SCAN_API_KEY },
  });
  if (!res.ok && res.status !== 202) throw new Error(`Top divergence trigger error: ${res.status}`);
}

// ─── Top Divergence Mock Data ─────────────────────────────────────

export const MOCK_TOP_DIV_DATA: TopDivScreenerResult = {
  date: "2026-03-29",
  scan_time: "2026-03-29 17:45:00 PDT",
  stocks: [
    makeMockTopDivStock("AAPL",  "MACD+RSI", 172.50, -1.25, 2680.0, 1.2, 74.5, false),
    makeMockTopDivStock("TSLA",  "MACD",     182.40, -2.15, 1200.0, 1.5, 71.2, false),
    makeMockTopDivStock("AMZN",  "RSI",      185.30, -0.95, 1800.0, 1.3, 72.8, false),
    makeMockTopDivStock("QQQ",   "MACD",     432.60, -1.02, null,   1.6, 68.4, true),
  ],
};

function makeMockTopDivStock(
  ticker: string,
  mode: TriggerMode,
  price: number,
  pctChange: number,
  mktcapB: number | null,
  volRatio: number,
  rsiLatest: number,
  isEtf: boolean,
): TopDivStock {
  const N = 120;
  // Generate a declining price series ending at `price` (bearish)
  const closes = generateTopDivPriceSeries(price, N);

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

  const macdRes = calcMACDArr(closes);
  const rsiArr  = calcRSIArr(closes);

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

  // Place p1 ~45-65 bars ago (depending on mode), p2 ~3 bars ago
  const triggered: ("MACD" | "RSI")[] = [];
  const details: TopDivStock["details"] = {};

  const p2 = N - 1 - 3;
  if (mode === "MACD" || mode === "MACD+RSI") {
    triggered.push("MACD");
    const gapBars = 45;
    const p1 = p2 - gapBars;
    details.macd = makeMockMacdTopDetail(closes, macdRes, p1, p2, gapBars);
  }
  if (mode === "RSI" || mode === "MACD+RSI") {
    triggered.push("RSI");
    const gapBars = 20;
    const p1 = p2 - gapBars;
    details.rsi = makeMockRsiTopDetail(closes, p1, p2, gapBars);
  }

  return {
    ticker, is_etf: isEtf, price, pct_change: pctChange,
    mktcap_b: mktcapB, vol_ratio: volRatio, rsi_latest: rsiLatest,
    triggered, details, chart,
  };
}

function generateTopDivPriceSeries(endPrice: number, n: number): number[] {
  // Peak near 80% through, then declining to endPrice (top divergence shape)
  const arr: number[] = [];
  const startPrice = endPrice * 0.90;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const peak = Math.exp(-((t - 0.75) ** 2) / 0.025) * endPrice * 0.12;
    const base = startPrice + (endPrice - startPrice) * t + peak;
    const noise = base * (Math.random() - 0.5) * 0.015;
    arr.push(Math.max(base + noise, endPrice * 0.5));
  }
  const scale = endPrice / arr[arr.length - 1];
  return arr.map((v) => v * scale);
}

function makeMockMacdTopDetail(
  closes: number[],
  macd: { diff: (number | null)[]; hist: (number | null)[] },
  p1: number, p2: number, gapBars: number,
): TopDivDetail {
  const priceRise = ((closes[p2] - closes[p1]) / closes[p1]) * 100;
  const d1 = Math.abs(macd.diff[p1] ?? 0.6);
  const d2 = d1 * 0.65;  // indicator drops (top divergence)
  const h1 = Math.abs(macd.hist[p1] ?? 0.9);
  const h2 = h1 * 0.55;
  return {
    p1, p2,
    price_p1: +closes[p1].toFixed(2),
    price_p2: +closes[p2].toFixed(2),
    indic_p1: +d1.toFixed(4),
    indic_p2: +d2.toFixed(4),
    gap_bars: gapBars,
    price_rise_pct: +priceRise.toFixed(2),
    indic_drop: +(d1 - d2).toFixed(4),
    bars_ago: 3,
    hist_p1: +h1.toFixed(4),
    hist_p2: +h2.toFixed(4),
    hist_shrink_pct: +((1 - h2 / h1) * 100).toFixed(1),
    label: "MACD",
  };
}

// ─── Top Volume Surge Public API ─────────────────────────────────

export async function fetchTopVolumeScreener(): Promise<TopVolumeSurgeScreenerResult> {
  if (BACKEND_URL) {
    const res = await fetch(`${BACKEND_URL}/api/screener/top-volume`);
    if (res.status === 404) return MOCK_TOP_VOLUME_DATA;
    if (!res.ok) throw new Error(`Top volume screener API error: ${res.status}`);
    return res.json();
  }
  await new Promise((r) => setTimeout(r, 600));
  return MOCK_TOP_VOLUME_DATA;
}

export async function fetchTopVolumeStatus(): Promise<ScanStatus> {
  if (!BACKEND_URL) return { status: "idle" };
  try {
    const res = await fetch(`${BACKEND_URL}/api/screener/top-volume/status`);
    if (!res.ok) return { status: "idle" };
    return res.json();
  } catch {
    return { status: "idle" };
  }
}

export async function triggerTopVolumeScan(): Promise<void> {
  if (!BACKEND_URL) return;
  const res = await fetch(`${BACKEND_URL}/api/screener/top-volume/run`, {
    method: "POST",
    headers: { "X-API-Key": SCAN_API_KEY },
  });
  if (!res.ok && res.status !== 202) throw new Error(`Top volume trigger error: ${res.status}`);
}

// ─── Top Volume Surge Mock Data ───────────────────────────────────

export const MOCK_TOP_VOLUME_DATA: TopVolumeSurgeScreenerResult = {
  date: "2026-03-29",
  scan_time: "2026-03-29 17:40:00 PDT",
  results: [
    makeMockTopVolumeStock("NVDA",  865.30, 780.20, +12.5, 82100500, 91230100, 28340000, 2.90, 3.22, 2130000000000),
    makeMockTopVolumeStock("META",  525.72, 460.80, +14.1, 38975085, 42780100, 16863405, 2.31, 2.54, 1329837768704),
    makeMockTopVolumeStock("TSLA",  255.40, 221.80,  +8.3, 98432100, 103100300, 39560000, 2.49, 2.61, 812000000000),
    makeMockTopVolumeStock("AAPL",  228.90, 198.60, +10.5, 52340200, 61120600, 22840000, 2.29, 2.68, 3480000000000),
    makeMockTopVolumeStock("SMH",   238.40, 208.10, +11.6, 18340200, 21120600,  7540000, 2.43, 2.80, null),
  ].filter(Boolean) as TopVolumeSurgeStock[],
  params: {
    volume_multiplier: 2.0,
    ma50_period:       50,
    vol_ma_period:     20,
    min_market_cap_b:  0.3,
  },
};

function makeMockTopVolumeStock(
  ticker: string,
  lastClose: number,
  ma50: number,
  ytdReturn: number,
  lastVol: number,
  prevVol: number,
  volMa30: number,
  volRatio: number,
  volRatio2: number,
  marketCap: number | null,
): TopVolumeSurgeStock {
  const N = 60;
  const startPrice = ma50 * (1 - Math.abs(ytdReturn) / 100 * 0.4);
  const closes = generateTopVolPriceSeries(startPrice, lastClose, N);

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
    if (i >= N - 2) {
      volume.push(i === N - 1 ? lastVol : prevVol);
    } else {
      volume.push(Math.round(volMa30 * (0.6 + Math.random() * 0.8)));
    }
  }

  const ma50Series: (number | null)[] = closes.map((_, i) => {
    if (i < 49) return null;
    return closes.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;
  });

  const volMa30Series: (number | null)[] = volume.map((_, i) => {
    if (i < 19) return null;
    return volume.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
  });

  const dates = generateDates(N);
  const chart: TopVolumeSurgeChartData = {
    dates, open, high, low,
    close:    closes.map((v) => +v.toFixed(2)),
    volume,
    ma50:     ma50Series.map((v) => v === null ? null : +v.toFixed(2)),
    vol_ma30: volMa30Series.map((v) => v === null ? null : +v.toFixed(0)),
  };

  return {
    ticker,
    last_close: lastClose,
    ma50,
    ytd_return: ytdReturn,
    last_vol:   lastVol,
    prev_vol:   prevVol,
    vol_ma30:   volMa30,
    vol_ratio:  volRatio,
    vol_ratio2: volRatio2,
    market_cap: marketCap ?? 0,
    chart,
  };
}

function generateTopVolPriceSeries(startPrice: number, endPrice: number, n: number): number[] {
  // Rising trend ending at endPrice (above MA50)
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = startPrice + (endPrice - startPrice) * t;
    const noise = base * (Math.random() - 0.5) * 0.02;
    arr.push(Math.max(base + noise, 0.01));
  }
  const scale = endPrice / arr[arr.length - 1];
  return arr.map((v) => v * scale);
}

// ─── AI Strategy Public API ───────────────────────────────────────

export async function fetchAIStrategy(): Promise<AIStrategyResult> {
  if (BACKEND_URL) {
    const res = await fetch(`${BACKEND_URL}/api/strategy`);
    if (res.status === 404) return MOCK_AI_STRATEGY_DATA;
    if (!res.ok) throw new Error(`AI strategy API error: ${res.status}`);
    return res.json();
  }
  await new Promise((r) => setTimeout(r, 600));
  return MOCK_AI_STRATEGY_DATA;
}

export async function fetchAIStrategyStatus(): Promise<ScanStatus> {
  if (!BACKEND_URL) return { status: "idle" };
  try {
    const res = await fetch(`${BACKEND_URL}/api/strategy/status`);
    if (!res.ok) return { status: "idle" };
    return res.json();
  } catch {
    return { status: "idle" };
  }
}

export async function triggerAIStrategy(): Promise<void> {
  if (!BACKEND_URL) return;
  const res = await fetch(`${BACKEND_URL}/api/strategy/run`, {
    method: "POST",
    headers: { "X-API-Key": SCAN_API_KEY },
  });
  if (!res.ok && res.status !== 202) throw new Error(`AI strategy trigger error: ${res.status}`);
}

// ─── AI Strategy Mock Data ────────────────────────────────────────

export const MOCK_AI_STRATEGY_DATA: AIStrategyResult = {
  environment: "NEUTRAL",
  confidence: 0.62,
  risk_level: "HIGH",
  summary:
    "市场处于高度不确定状态，SPY 在 200 日均线下方震荡，VIX 维持在 22 以上高位。板块轮动分散、缺乏主线，建议以期权异常信号为主要参考，严控仓位，等待方向明朗。",
  recommended_screeners: ["unusual-options", "bottom-divergence", "bottom-volume-surge"],
  avoid_screeners: ["duck-bill", "top-divergence"],
  key_levels: {
    spy_support: 452.0,
    spy_resistance: 475.0,
    vix_warning: 25.0,
  },
  strategy_notes:
    "当前市场处于技术性修正阶段，SPY 已跌破 50 日均线，距 200 日均线支撑约 2%。QQQ 表现略弱于大盘，科技板块承压明显。VIX 在 22 附近震荡，尚未达到恐慌性抛售的极值区域（30+），说明市场仍在有序调整而非恐慌出逃。\n\n板块层面，能源（XLE）和医疗（XLV）相对抗跌，具有防御价值。金融（XLF）随利率预期波动较大。科技（XLK）短期超卖但趋势尚未逆转。\n\n操盘建议：降低主动方向性仓位，重点关注异常期权信号捕捉机构暗注方向。若 SPY 有效守住 452 支撑并伴随缩量，可考虑小仓位布局底背离标的。日内交易者可参考 VIX 波动择机，避免在 VIX 快速拉升时追空。",
  market_metrics: {
    spy_price: 462.5,
    spy_change_1d: -1.2,
    spy_change_5d: -3.8,
    spy_vs_ma50: -2.1,
    spy_vs_ma200: 0.8,
    qqq_price: 387.2,
    qqq_change_1d: -1.9,
    qqq_change_5d: -5.3,
    vix: 22.4,
    vix_change_1d: 4.8,
    iwm_change_5d: -4.1,
  },
  sectors: {
    XLK:  { name: "科技",     price: 215.3, change_1d: -1.8, change_5d: -5.2, vs_ma50: -3.1 },
    XLF:  { name: "金融",     price:  45.8, change_1d: -0.9, change_5d: -2.1, vs_ma50: -1.2 },
    XLE:  { name: "能源",     price:  87.2, change_1d:  0.4, change_5d:  1.8, vs_ma50:  2.3 },
    XLV:  { name: "医疗",     price: 138.5, change_1d:  0.2, change_5d:  0.5, vs_ma50:  0.8 },
    XLI:  { name: "工业",     price: 120.1, change_1d: -0.6, change_5d: -2.8, vs_ma50: -1.9 },
    XLY:  { name: "消费可选", price: 178.4, change_1d: -2.1, change_5d: -6.4, vs_ma50: -4.2 },
    XLC:  { name: "通信服务", price:  82.6, change_1d: -1.4, change_5d: -4.1, vs_ma50: -2.6 },
    XLRE: { name: "房地产",   price:  37.9, change_1d: -0.3, change_5d: -1.5, vs_ma50: -0.9 },
  },
  scan_time: "2026-03-31 09:15:00 PDT",
};

function makeMockRsiTopDetail(
  closes: number[],
  p1: number, p2: number, gapBars: number,
): TopDivDetail {
  const priceRise = ((closes[p2] - closes[p1]) / closes[p1]) * 100;
  const r1 = 78;
  const r2 = 72;  // overbought but lower than first peak
  return {
    p1, p2,
    price_p1: +closes[p1].toFixed(2),
    price_p2: +closes[p2].toFixed(2),
    indic_p1: r1,
    indic_p2: r2,
    gap_bars: gapBars,
    price_rise_pct: +priceRise.toFixed(2),
    indic_drop: +(r1 - r2).toFixed(2),
    bars_ago: 3,
    label: "RSI",
  };
}
