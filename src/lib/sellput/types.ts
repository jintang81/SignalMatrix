// ─── Raw data ─────────────────────────────────────────────────────────────

export interface ChartData {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  timestamps: number[];
  meta: Record<string, unknown>;
}

export interface Greeks {
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

export interface PutContract {
  symbol?: string;
  strike: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number;
  open_interest: number;
  iv: number | null;
  greeks: Greeks | null;
  expiration: string;
  // computed by Gate 3
  otmPct?: number;
  mid?: number;
  premium?: number;
  cashSecured?: number;
  totalROI?: number;
  annualROI?: number;
  costBasis?: number;
  strikeToLRSDist?: number;
  bidAskSpread?: number | null;
  bidAskSpreadPct?: number | null;
  openInterest?: number;
  checks?: ContractChecks;
  qualifyCount?: number;
}

export interface ContractChecks {
  inRange: boolean;
  deltaOk: boolean;
  gammaOk: boolean;
  thetaOk: boolean;
  annualOk: boolean;
  liquidityOk: boolean;
  lrsSafe: boolean;
}

// ─── Gate results ─────────────────────────────────────────────────────────

export interface Gate0Result {
  status: "green" | "yellow" | "red" | "unknown";
  message: string;
  canEvaluate: boolean;
  currentPE?: number;
  medianPE?: number;
  threshold13x?: number;
  ratio?: number;
  sampleSize?: number;
  historicalPEs?: { date: string; price: number; eps: number; pe: number }[];
}

export interface GateCheckItem {
  name: string;
  rule: string;
  value: string;
  pass: boolean;
  critical: boolean;
  note?: string;
}

export interface Gate1Result {
  pass: boolean;
  passCount: number;
  totalCount: number;
  items: GateCheckItem[];
  ivHvExtraOTM: number;
  failedNames: string[];
  hv: number | null;
  ivHv: number | null;
  ivr: number | null;
  rsi: number | null;
  vixDayChg: number | null;
}

export interface EarningsInfo {
  ticker: string;
  date: string;
}

export interface EventDetail {
  label: string;
  boost: number;
  date: string;
  type: string;
}

export interface BlockerInfo {
  type: string;
  ticker?: string;
  date: string;
  msg: string;
}

export interface Gate2Result {
  totalOTM: number;
  details: EventDetail[];
  blockers: BlockerInfo[];
  resonanceDates: { date: string; count: number; events: EventDetail[] }[];
  hasBlocker: boolean;
  eventCount: number;
}

export interface Gate3Result {
  atr: number | null;
  atrPct: number | null;
  baseOTM: number;
  multiplier: number;
  dteScale: number;
  finalOTMLow: number;
  finalOTMHigh: number;
  targetLowStrike: number;
  targetHighStrike: number;
  candidates: PutContract[];
  bestCandidate: PutContract | null;
  parentMA200DistPct: number;
  estETFAtParentMA200: number;
}

export interface Gate4Item {
  name: string;
  rule: string;
  value: string;
  pass: boolean;
}

export interface Gate4Result {
  items: Gate4Item[];
  margin: number;
  contractsByCash: number;
  limitPrice: number;
  parentMA200DistPct: number;
}

export interface Gate5Rule {
  num: string;
  title: string;
  trigger: string;
  action: string;
  type: "ok" | "warn" | "bad";
}

export interface Gate5Result {
  rules: Gate5Rule[];
  profitClosePrice: number;
  stopLossPrice: number;
}

export interface Reflection {
  level: "bad" | "warn" | "info";
  title: string;
  body: string;
}

export interface ScoreBreakdown {
  name: string;
  max: number | string;
  val: number | string;
}

// ─── Full analysis result ─────────────────────────────────────────────────

export interface AnalysisResult {
  ticker: string;
  parentTicker: string;
  currentPrice: number;
  parentPrice: number;
  parentMA200: number;
  parentMA200Dist: number;
  chosenDTE: number;
  chosenExpDate: string;
  atmIV: number | null;
  puts: PutContract[];
  gate0: Gate0Result;
  gate1: Gate1Result;
  gate2: Gate2Result;
  gate3: Gate3Result;
  gate4: Gate4Result | null;
  gate5: Gate5Result | null;
  reflections: Reflection[];
  score: number;
  breakdown: ScoreBreakdown[];
  noCandidate: boolean;
  trendStrength: number | null;
  vixCur: number | null;
  vixPrev: number | null;
}

export interface AnalysisError {
  ticker: string;
  error: string;
}

export type AnalysisResultOrError = AnalysisResult | AnalysisError;

// ─── Form params ──────────────────────────────────────────────────────────

export type EntryMode = "strong" | "neutral" | "cautious";
export type DataSource = "mock" | "backend";

export interface ScanParams {
  tickers: string[];
  cash: number;
  dteMin: number;
  dteMax: number;
  entryMode: EntryMode;
  dataSource: DataSource;
}

// ─── Valuation data (from backend) ───────────────────────────────────────

export interface AnnualEPS {
  date: string;
  eps: number;
}

export interface ValuationData {
  ticker: string;
  forward_pe: number | null;
  trailing_pe: number | null;
  annual_eps: AnnualEPS[];
  ok: boolean;
}
