/** Common TypeScript types for SignalMatrix */

export type SignalType = "bull" | "bear" | "neutral";

export type TimeRange = "1D" | "1W" | "1M" | "3M" | "1Y";

export type ScreenerResult = {
  ticker: string;
  signal_type: SignalType;
  signal_strength: number;
  trigger_date: string;
  details: Record<string, unknown>;
};

// ─── Yahoo Finance raw field wrapper ─────────────────────────────
export type YFRaw<T> = { raw: T; fmt: string } | undefined;

// ─── /v8/finance/chart meta → quote shape ────────────────────────
export type YFQuoteResult = {
  symbol: string;
  shortName: string;
  longName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketOpen: number | null;
  regularMarketDayHigh: number | null;
  regularMarketDayLow: number | null;
  regularMarketPreviousClose: number;
  regularMarketVolume: number | null;
  marketCap: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  preMarketPrice?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChangePercent?: number;
  fullExchangeName: string;
  sector?: string;
  currency: string;
};

// ─── /v10/finance/quoteSummary modules ───────────────────────────
export type YFSummaryModule = {
  financialData?: {
    currentPrice?: YFRaw<number>;
    revenueGrowth?: YFRaw<number>;
    earningsGrowth?: YFRaw<number>;
    grossMargins?: YFRaw<number>;
    operatingMargins?: YFRaw<number>;
    profitMargins?: YFRaw<number>;
    freeCashflow?: YFRaw<number>;
    totalRevenue?: YFRaw<number>;
    totalDebt?: YFRaw<number>;
    totalCash?: YFRaw<number>;
    debtToEquity?: YFRaw<number>;
    currentRatio?: YFRaw<number>;
    returnOnEquity?: YFRaw<number>;
    returnOnAssets?: YFRaw<number>;
    targetMeanPrice?: YFRaw<number>;
    targetHighPrice?: YFRaw<number>;
    targetLowPrice?: YFRaw<number>;
    recommendationKey?: string;
    numberOfAnalystOpinions?: YFRaw<number>;
  };
  defaultKeyStatistics?: {
    trailingEps?: YFRaw<number>;
    forwardEps?: YFRaw<number>;
    priceToBook?: YFRaw<number>;
    priceToSalesTrailingTwelveMonths?: YFRaw<number>;
    pegRatio?: YFRaw<number>;
    enterpriseValue?: YFRaw<number>;
    enterpriseToRevenue?: YFRaw<number>;
    enterpriseToEbitda?: YFRaw<number>;
    beta?: YFRaw<number>;
    sharesOutstanding?: YFRaw<number>;
    floatShares?: YFRaw<number>;
    heldPercentInsiders?: YFRaw<number>;
    heldPercentInstitutions?: YFRaw<number>;
    shortRatio?: YFRaw<number>;
    shortPercentOfFloat?: YFRaw<number>;
    bookValue?: YFRaw<number>;
    "52WeekChange"?: YFRaw<number>;
  };
  summaryDetail?: {
    trailingPE?: YFRaw<number>;
    forwardPE?: YFRaw<number>;
    dividendYield?: YFRaw<number>;
    dividendRate?: YFRaw<number>;
    trailingAnnualDividendYield?: YFRaw<number>;
    exDividendDate?: YFRaw<number>;
    payoutRatio?: YFRaw<number>;
    fiveYearAvgDividendYield?: YFRaw<number>;
    fiftyTwoWeekLow?: YFRaw<number>;
    fiftyTwoWeekHigh?: YFRaw<number>;
    averageVolume?: YFRaw<number>;
    volume?: YFRaw<number>;
    earningsTimestamp?: number;
  };
};

export type YFProfileModule = {
  summaryProfile?: {
    longBusinessSummary?: string;
    industry?: string;
    sector?: string;
    fullTimeEmployees?: number;
    website?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  recommendationTrend?: {
    trend?: Array<{
      period: string;
      strongBuy: number;
      buy: number;
      hold: number;
      sell: number;
      strongSell: number;
    }>;
  };
};

// ─── Chart history ────────────────────────────────────────────────
export type YFChartResult = {
  timestamps: number[];
  opens: (number | null)[];
  highs: (number | null)[];
  lows: (number | null)[];
  closes: (number | null)[];
  volumes: (number | null)[];
};

// ─── News ─────────────────────────────────────────────────────────
export type YFNewsItem = {
  title: string;
  link: string;
  publisher: string;
  providerPublishTime: number;
  type: string;
  uuid: string;
};

export type NewsSentiment = "positive" | "negative" | "neutral";

// ─── Aggregated page data ─────────────────────────────────────────
export type StockQueryData = {
  quote: YFQuoteResult;
  summary: YFSummaryModule;
  profile: YFProfileModule;
  chart: YFChartResult;
  news: YFNewsItem[];
};

// ─── AI Score ─────────────────────────────────────────────────────
export type AIScoreResponse = {
  score: number;
  signal: "BUY" | "HOLD" | "SELL";
  reasoning: string;
  keyFactors: string[];
};

// ─── Technical indicators ─────────────────────────────────────────
export type MACDResult = {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
};

export type KDJResult = {
  k: number[];
  d: number[];
  j: number[];
};

// ─── MCDX (六彩神龙) result ───────────────────────────────────────
export type MCDXResult = {
  banker:   (number | null)[];  // RSI50-based, 0~20
  hotMoney: (number | null)[];  // RSI40-based, 0~20
  bankerMA: (number | null)[];  // SMA(banker, 10)
};

// ─── GMMA (顾比均线加强版) result ─────────────────────────────────
export type GMMAResult = {
  short: Array<(number | null)[]>;  // [ema3, ema5, ema8, ema10, ema12, ema15]
  long:  Array<(number | null)[]>;  // [ema30, ema35, ema40, ema45, ema50, ema60]
};

export type GMMASignals = {
  tripleCross: boolean[];  // close crossed EMA3/5/8 from below + long bullish aligned
  break12:     boolean[];  // close crossed all 12 EMAs from below in one bar
  smiley:      boolean[];  // EMA3<EMA15 + close<EMA15 + gap>ATR*1.5, peak-of-segment
  kdCross:     boolean[];  // K crosses above D after a smiley signal (entry trigger)
  longBull:    boolean[];  // EMA30 > EMA35 > EMA40 > EMA45 > EMA50 > EMA60
  longBear:    boolean[];  // EMA30 < EMA35 < EMA40 < EMA45 < EMA50 < EMA60
};

// ─── PP SuperTrend result ─────────────────────────────────────────
// Missing values are NaN (not null) for canvas rendering efficiency
export type PPSTResult = {
  st: number[];
  trend: number[];    // 1=bull, -1=bear, 0=uninitialized
  center: number[];
  support: number[];
  resistance: number[];
  ph: number[];       // NaN where no pivot high
  pl: number[];       // NaN where no pivot low
};

// OHLCV + chart meta for flexible fetches (SuperTrend page)
export type OHLCVData = YFChartResult & {
  symbol: string;
  shortName: string;
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
};

export type TechnicalSnapshot = {
  rsi14: number | null;
  kdj: { k: number; d: number; j: number } | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  maTrend: "above" | "below" | "mixed";
  volRatio: number | null;
  weekPos52: number | null;
  support: number | null;
  resist: number | null;
  mas: { period: number; value: number | null; distancePct: number | null }[];
  maLines: {
    ma20: (number | null)[];
    ma50: (number | null)[];
    ma200: (number | null)[];
    volMa20: (number | null)[];
  };
};

// ─── Screener Types ───────────────────────────────────────────────

export interface DivergenceDetail {
  b1: number; b2: number;
  price_b1: number; price_b2: number;
  indic_b1: number; indic_b2: number;
  gap_bars: number; price_drop_pct: number;
  indic_rise: number; bars_ago: number;
  hist_b1?: number; hist_b2?: number; hist_shrink_pct?: number;
  label: "MACD" | "RSI";
}

export interface DivergenceChartData {
  dates: string[];
  open: number[]; high: number[]; low: number[]; close: number[];
  volume: number[];
  diff: number[]; dea: number[]; hist: number[]; rsi: number[];
}

export interface DivergenceStock {
  ticker: string;
  is_etf: boolean;
  price: number;
  pct_change: number;
  mktcap_b: number | null;
  vol_ratio: number;
  rsi_latest: number;
  triggered: ("MACD" | "RSI")[];
  details: { macd?: DivergenceDetail; rsi?: DivergenceDetail };
  chart: DivergenceChartData;
}

export interface DivergenceScreenerResult {
  date: string;
  stocks: DivergenceStock[];
}
