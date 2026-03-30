/**
 * Data Gateway — unified market data access layer
 *
 * All market data (frontend Yahoo Finance proxy + backend FastAPI) must
 * go through this module to prevent frontend/backend data source divergence.
 *
 * CF Proxy: ALL endpoints use ?url=encodeURIComponent(YF_BASE + path) wrapping.
 * Path-based routing does NOT work — confirmed from Python screener reference.
 */

import type {
  YFQuoteResult,
  YFSummaryModule,
  YFProfileModule,
  YFChartResult,
  YFNewsItem,
  StockQueryData,
  OHLCVData,
} from "@/types";

const CF = "https://yahoo-proxy.hejintang.workers.dev";
const YF = "https://query1.finance.yahoo.com";

/** Wrap Yahoo Finance URL for v10/v1 endpoints */
function yf(path: string): string {
  return `${CF}?url=${encodeURIComponent(YF + path)}`;
}

// ─── Legacy: used by existing pages ──────────────────────────────
export async function fetchChart(symbol: string, interval = "1d", range = "5d") {
  const url = yf(`/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchChart failed: ${res.status}`);
  return res.json();
}

// ─── Quote (from v8 chart meta) ───────────────────────────────────
export async function fetchQuote(symbol: string): Promise<YFQuoteResult> {
  const url = yf(`/v8/finance/chart/${symbol}?interval=1d&range=5d`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Symbol not found: ${symbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Symbol not found: ${symbol}`);
  const meta = result.meta;
  // Use second-to-last close from data array as prev (chartPreviousClose = pre-window, not yesterday)
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const price = (lastClose != null ? lastClose : meta.regularMarketPrice) as number;
  const prev = (prevClose != null ? prevClose : meta.chartPreviousClose ?? price) as number;
  return {
    symbol: meta.symbol,
    shortName: meta.shortName ?? meta.symbol,
    longName: meta.longName ?? meta.shortName ?? meta.symbol,
    regularMarketPrice: price,
    regularMarketChange: price - prev,
    regularMarketChangePercent: ((price - prev) / prev) * 100,
    regularMarketOpen: meta.regularMarketOpen ?? null,
    regularMarketDayHigh: meta.regularMarketDayHigh ?? null,
    regularMarketDayLow: meta.regularMarketDayLow ?? null,
    regularMarketPreviousClose: prev,
    regularMarketVolume: meta.regularMarketVolume ?? null,
    marketCap: meta.marketCap ?? null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
    preMarketPrice: meta.preMarketPrice,
    preMarketChangePercent: meta.preMarketChangePercent,
    postMarketPrice: meta.postMarketPrice,
    postMarketChangePercent: meta.postMarketChangePercent,
    fullExchangeName: meta.fullExchangeName ?? meta.exchangeName ?? "",
    sector: meta.sector,
    currency: meta.currency ?? "USD",
  };
}

// ─── Fundamentals ─────────────────────────────────────────────────
export async function fetchSummary(symbol: string): Promise<YFSummaryModule> {
  const modules = "financialData,defaultKeyStatistics,summaryDetail";
  const res = await fetch(yf(`/v10/finance/quoteSummary/${symbol}?modules=${modules}`));
  if (!res.ok) throw new Error(`fetchSummary failed: ${res.status}`);
  const json = await res.json();
  return (json?.quoteSummary?.result?.[0] ?? {}) as YFSummaryModule;
}

// ─── Company profile + analyst recommendations ─────────────────────
export async function fetchProfile(symbol: string): Promise<YFProfileModule> {
  const modules = "summaryProfile,recommendationTrend";
  const res = await fetch(yf(`/v10/finance/quoteSummary/${symbol}?modules=${modules}`));
  if (!res.ok) throw new Error(`fetchProfile failed: ${res.status}`);
  const json = await res.json();
  return (json?.quoteSummary?.result?.[0] ?? {}) as YFProfileModule;
}

// ─── Price history (300 days for indicator calculations) ───────────
export async function fetchHistory(symbol: string): Promise<YFChartResult> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 300 * 86400;
  const url = yf(`/v8/finance/chart/${symbol}?interval=1d&period1=${start}&period2=${end}&events=history`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchHistory failed: ${res.status}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(`No chart data for: ${symbol}`);
  const q = r.indicators.quote[0];
  const ac = r.indicators?.adjclose?.[0]?.adjclose;

  // De-duplicate last bar (Yahoo sometimes duplicates the current trading day)
  let ts: number[] = r.timestamp ?? [];
  let closes: (number | null)[] = ac?.length ? ac : (q.close ?? []);
  let opens: (number | null)[] = q.open ?? [];
  let highs: (number | null)[] = q.high ?? [];
  let lows: (number | null)[] = q.low ?? [];
  let volumes: (number | null)[] = q.volume ?? [];

  if (ts.length >= 2) {
    const toDay = (t: number) => {
      const d = new Date(t * 1000);
      return d.getUTCFullYear() * 10000 + d.getUTCMonth() * 100 + d.getUTCDate();
    };
    if (toDay(ts[ts.length - 1]) === toDay(ts[ts.length - 2])) {
      ts = ts.slice(0, -1);
      closes = closes.slice(0, -1);
      opens = opens.slice(0, -1);
      highs = highs.slice(0, -1);
      lows = lows.slice(0, -1);
      volumes = volumes.slice(0, -1);
    }
  }

  return { timestamps: ts, opens, highs, lows, closes, volumes };
}

// ─── Flexible OHLCV fetch (SuperTrend / Indicators pages) ─────────
// range: '5d'|'1mo'|'3mo'|'6mo'|'1y'|'2y'|'5y'|'60d'
// interval: '1h'|'1d'|'1wk'|'1mo'
export async function fetchOHLCV(
  symbol: string,
  range: string,
  interval: string
): Promise<OHLCVData> {
  const url = yf(`/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includeAdjustedClose=true`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchOHLCV failed: ${res.status}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(`No data for: ${symbol}`);

  const meta = r.meta;
  const q = r.indicators.quote[0];

  let ts: number[] = r.timestamp ?? [];
  // Use raw close (q.close) — matches HTML prototype; adjclose can have extra nulls
  // that silently skip signal detection days
  let closes: (number | null)[] = q.close ?? [];
  let opens: (number | null)[] = q.open ?? [];
  let highs: (number | null)[] = q.high ?? [];
  let lows: (number | null)[] = q.low ?? [];
  let volumes: (number | null)[] = q.volume ?? [];

  // De-duplicate last bar (skip for hourly — no date-level duplicates)
  if (interval !== "1h" && ts.length >= 2) {
    const toDay = (t: number) => {
      const d = new Date(t * 1000);
      return d.getUTCFullYear() * 10000 + d.getUTCMonth() * 100 + d.getUTCDate();
    };
    if (toDay(ts[ts.length - 1]) === toDay(ts[ts.length - 2])) {
      ts = ts.slice(0, -1);
      closes = closes.slice(0, -1);
      opens = opens.slice(0, -1);
      highs = highs.slice(0, -1);
      lows = lows.slice(0, -1);
      volumes = volumes.slice(0, -1);
    }
  }

  // Use second-to-last close for day-over-day change (matches HTML prototype)
  // meta.chartPreviousClose = close before chart start (2y ago) — wrong for change%
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const marketPrice = (lastClose != null ? lastClose : meta.regularMarketPrice) as number;
  const prevForChange = (prevClose != null ? prevClose : marketPrice) as number;
  return {
    timestamps: ts,
    opens,
    highs,
    lows,
    closes,
    volumes,
    symbol: meta.symbol ?? symbol,
    shortName: meta.shortName ?? meta.longName ?? symbol,
    regularMarketPrice: marketPrice,
    regularMarketPreviousClose: prevForChange,
    fiftyTwoWeekHigh: (meta.fiftyTwoWeekHigh ?? null) as number | null,
    fiftyTwoWeekLow:  (meta.fiftyTwoWeekLow  ?? null) as number | null,
  };
}

// ─── News ─────────────────────────────────────────────────────────
export async function fetchNews(symbol: string): Promise<YFNewsItem[]> {
  const res = await fetch(yf(`/v1/finance/search?q=${symbol}&newsCount=5&quotesCount=0`));
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.news ?? []).slice(0, 5) as YFNewsItem[];
}

// ─── Aggregated fetch (parallel) ──────────────────────────────────
export async function fetchStockQueryData(symbol: string): Promise<StockQueryData> {
  const [quote, [summary, profile], history, news] = await Promise.all([
    fetchQuote(symbol),
    Promise.all([fetchSummary(symbol), fetchProfile(symbol)]),
    fetchHistory(symbol),
    fetchNews(symbol),
  ]);
  return { quote, summary, profile, chart: history, news };
}
