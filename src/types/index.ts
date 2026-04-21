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
  scan_time?: string;
  stocks: DivergenceStock[];
}

// ─── Volume Surge Screener Types ──────────────────────────────────

export interface VolumeSurgeChartData {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  ma50: (number | null)[];
  vol_ma20: (number | null)[];
}

export interface VolumeSurgeStock {
  ticker: string;
  last_close: number;
  ma50: number;
  ytd_return: number;      // percentage, e.g. -19.1
  last_vol: number;
  prev_vol: number;
  vol_ma20: number;
  vol_ratio: number;       // today vol / vol_ma20
  vol_ratio2: number;      // yesterday vol / vol_ma20
  market_cap: number;
  chart: VolumeSurgeChartData;
}

export interface VolumeSurgeScreenerResult {
  date: string;
  scan_time: string;
  results: VolumeSurgeStock[];
  params: {
    volume_multiplier: number;
    ma50_period: number;
    vol_ma_period: number;
    min_market_cap_b: number;
  };
}

// ─── Duck Bill Screener Types ──────────────────────────────────────

export interface DuckChartData {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  diff: number[];
  dea: number[];
  hist: number[];
}

export interface DuckDetail {
  diff_latest: number;
  dea_latest: number;
  hist_latest: number;
  gap_ratio_min: number;        // % price-relative proximity to DEA at Phase B
  bars_since_reversal: number;  // bars since Phase C started (≤3)
  diverge_angle: number;        // duck bill opening angle in degrees
  reversal_date: string;
}

export interface DuckStock {
  ticker: string;
  is_etf: boolean;
  price: number;
  pct_change: number;
  mktcap_b: number | null;
  ma5: number;
  ma10: number;
  ma20: number;
  vol_ratio: number;
  duck: DuckDetail;
  chart: DuckChartData;
}

export interface DuckScreenerResult {
  date: string;
  scan_time?: string;
  stocks: DuckStock[];
}

// ─── Inverted Duck Bill Screener Types ────────────────────────────
// Same data shape as duck bill, semantic difference is bearish (0 axis below)

export type InvertedDuckChartData = DuckChartData;
export type InvertedDuckDetail    = DuckDetail;

export interface InvertedDuckStock {
  ticker: string;
  is_etf: boolean;
  price: number;
  pct_change: number;
  mktcap_b: number | null;
  ma5: number;
  ma10: number;
  ma20: number;
  vol_ratio: number;
  duck: InvertedDuckDetail;
  chart: InvertedDuckChartData;
}

export interface InvertedDuckScreenerResult {
  date: string;
  scan_time?: string;
  stocks: InvertedDuckStock[];
}

// ─── Top Divergence Screener Types ────────────────────────────────

export interface TopDivDetail {
  p1: number; p2: number;
  price_p1: number; price_p2: number;
  indic_p1: number; indic_p2: number;
  gap_bars: number; price_rise_pct: number;
  indic_drop: number; bars_ago: number;
  hist_p1?: number; hist_p2?: number; hist_shrink_pct?: number;
  label: "MACD" | "RSI";
}

export interface TopDivStock {
  ticker: string;
  is_etf: boolean;
  price: number;
  pct_change: number;
  mktcap_b: number | null;
  vol_ratio: number;
  rsi_latest: number;
  triggered: ("MACD" | "RSI")[];
  details: { macd?: TopDivDetail; rsi?: TopDivDetail };
  chart: DivergenceChartData;
}

export interface TopDivScreenerResult {
  date: string;
  scan_time?: string;
  stocks: TopDivStock[];
}

// ─── Unusual Options Screener Types ───────────────────────────────

export interface OptionsContract {
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  dte: number;
  dte_bucket: "SPECULATIVE" | "SHORT_TERM" | "INSTITUTIONAL" | "STRATEGIC";
  volume: number;
  oi: number;
  ratio: number;
  bid: number;
  ask: number;
  last: number;
  mid: number;
  above_mid: boolean;
  premium: number;
  iv: number;
  otm: boolean;
  smart_money: boolean;
  position_type: "OPENING" | "CLOSING" | "UNCHANGED" | "UNKNOWN";
}

export interface OptionsSignal {
  name: string;
  direction: "BULLISH" | "BEARISH" | "BUY_SIGNAL" | "MIXED";
  data: Record<string, unknown>;
}

export interface OptionsStockInfo {
  name: string;
  sector: string;
  "2x": string;
  "3x": string;
  inv2x: string;
  inv3x: string;
}

export interface OptionsStock {
  ticker: string;
  info: OptionsStockInfo;
  price: number;
  change_1d: number;
  change_5d: number;
  high_52w: number;
  drop_52w: number;
  stars: number;
  overall: "BUY" | "BEARISH" | "WARNING" | "WATCH" | null;
  signals: OptionsSignal[];
  flow_5d?: { net_premium: number; days: number };
}

export interface OptionsScreenerResult {
  date: string;
  scan_time: string;
  stocks: OptionsStock[];
  params: Record<string, number>;
}

// ─── Top Volume Surge ─────────────────────────────────────────────

export interface TopVolumeSurgeChartData {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  ma50: (number | null)[];
  vol_ma30: (number | null)[];
}

export interface TopVolumeSurgeStock {
  ticker: string;
  last_close: number;
  ma50: number;
  ytd_return: number;      // positive percentage (above MA50, YTD > 0)
  last_vol: number;
  prev_vol: number;
  vol_ma30: number;
  vol_ratio: number;       // today vol / vol_ma30
  vol_ratio2: number;      // yesterday vol / vol_ma30
  market_cap: number;
  chart: TopVolumeSurgeChartData;
}

export interface TopVolumeSurgeScreenerResult {
  date: string;
  scan_time?: string;
  results: TopVolumeSurgeStock[];
  params: {
    volume_multiplier: number;
    ma50_period: number;
    vol_ma_period: number;
    min_market_cap_b: number;
  };
}

// ─── AI Strategy ─────────────────────────────────────────────────

export type AIStrategyEnvironment = "BULL" | "BEAR" | "NEUTRAL" | "CHOPPY";
export type AIStrategyRiskLevel  = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export interface AIStrategyMarketMetrics {
  spy_price:     number;
  spy_change_1d: number;
  spy_change_5d: number;
  spy_vs_ma50:   number;
  spy_vs_ma200:  number;
  qqq_price:     number;
  qqq_change_1d: number;
  qqq_change_5d: number;
  vix:           number;
  vix_change_1d: number;
  iwm_change_5d: number;
}

export interface AIStrategySector {
  name:       string;
  price:      number;
  change_1d:  number;
  change_5d:  number;
  change_20d?: number;
  vs_ma50?:   number;
}

export interface AIStrategyKeyLevels {
  spy_support:    number;
  spy_resistance: number;
  vix_warning:    number;
}

export interface AIStrategyResult {
  environment:           AIStrategyEnvironment;
  confidence:            number;
  risk_level:            AIStrategyRiskLevel;
  summary:               string;
  recommended_screeners: string[];
  avoid_screeners:       string[];
  key_levels:            AIStrategyKeyLevels;
  strategy_notes:        string;
  market_metrics:        AIStrategyMarketMetrics;
  sectors:               Record<string, AIStrategySector>;
  scan_time?:            string;
}

// ─── NL Stock Screener Types ──────────────────────────────────────

export interface NLStock {
  ticker:          string;
  name:            string;
  sector:          string | null;
  industry:        string | null;
  market_cap:      number | null;
  pe_ratio:        number | null;
  forward_pe:      number | null;
  pb_ratio:        number | null;
  revenue_growth:  number | null;
  profit_margin:   number | null;
  debt_to_equity:  number | null;
  dividend_yield:  number | null;
  week52_high:     number | null;
  week52_low:      number | null;
  price:           number | null;
  roe:             number | null;
  earnings_growth: number | null;
}

export interface NLFilters {
  sector?:               string;
  industry?:             string;
  market_cap_min?:       number;
  market_cap_max?:       number;
  pe_ratio_min?:         number;
  pe_ratio_max?:         number;
  pb_ratio_min?:         number;
  pb_ratio_max?:         number;
  revenue_growth_min?:   number;
  revenue_growth_max?:   number;
  profit_margin_min?:    number;
  profit_margin_max?:    number;
  debt_to_equity_max?:   number;
  dividend_yield_min?:   number;
  week52_position_min?:  number;
  roe_min?:              number;
}

export interface NLSearchResult {
  query:              string;
  display_name:       string;
  reasoning:          string;
  filters:            NLFilters;
  sort_by:            string;
  total_matched:      number;
  stocks:             NLStock[];
  fundamentals_date:  string;
  scan_time:          string;
}

// ─── Overnight Arbitrage Screener Types ───────────────────────────

export interface OvernightChartData {
  dates:  string[];
  open:   number[];
  high:   number[];
  low:    number[];
  close:  number[];
  volume: number[];
}

export interface OvernightStock {
  ticker:        string;
  price:         number;
  pct_change:    number;       // 盘中涨幅 %（实时价 vs 昨收）
  volume_ratio:  number;       // 量比
  max_gain_20d:  number;       // 过去 20 日最大单日涨幅 %
  mktcap_b:      number;       // 市值（B 美元）
  today_volume:  number;
  avg_vol_20d:   number;
  float_shares:  number | null;
  turnover_rate: number | null; // 换手率 %（null = 无流通股数据）
  vwap:          number | null; // 分时 VWAP（null = 无 Tradier 数据）
  above_vwap:    boolean | null;
  chart:         OvernightChartData;
}

export interface OvernightMarketEnv {
  spx_price: number;
  spx_ma20:  number;
  suitable:  boolean;          // SPX > MA20 = 牛市环境
  signal:    "bull" | "bear" | "unknown";
}

export interface OvernightScreenerResult {
  date:       string;
  scan_time?: string;
  market_env: OvernightMarketEnv;
  stocks:     OvernightStock[];
}

// 次日早盘出场分析
export type OvernightExitScenario =
  | "washout"      // 先涨后跌，未破开盘价 → 洗盘，持有
  | "flee"         // 先涨后跌，跌破开盘价 → 出逃，立即卖
  | "weak_bounce"  // 先跌后涨，未超开盘价 → 弱反弹，立即卖
  | "fake_drop"    // 先跌后涨，超过开盘价 → 假摔，持有
  | "steady_rise"  // 小幅稳健拉升 → 可继续持有
  | "weak";        // 开盘走弱 → 立即卖

export type OvernightExitAction = "hold" | "hold_strong" | "sell_asap";

export interface OvernightTimesalesBar {
  time:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface OvernightExitAnalysis {
  ticker:        string;
  date:          string;
  status:        "analyzed" | "waiting";
  message?:      string;       // set when status="waiting"
  open_price?:   number;
  current_price?: number;
  gain_pct?:     number;
  scenario?:     OvernightExitScenario;
  action?:       OvernightExitAction;
  detail?:       string;
  color?:        "green" | "red" | "blue";
  bars:          OvernightTimesalesBar[];
}
