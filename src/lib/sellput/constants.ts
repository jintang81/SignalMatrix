// ─── Parent asset mapping ─────────────────────────────────────────────────

export const PARENT_MAP: Record<string, string> = {
  TQQQ: "QQQ",  QLD: "QQQ",  SQQQ: "QQQ", PSQ: "QQQ",
  UPRO: "SPY",  SSO: "SPY",  SPXU: "SPY", SDS: "SPY",
  TNA: "IWM",   URTY: "IWM", TZA: "IWM",
  SOXL: "SOXX", SOXS: "SOXX",
  NVDL: "NVDA", NVDX: "NVDA", NVDK: "NVDA", NVDU: "NVDA", NVD: "NVDA",
  TSLL: "TSLA", TSLQ: "TSLA", TSLZ: "TSLA",
  AAPU: "AAPL", AAPD: "AAPL",
  MSFU: "MSFT", MSFD: "MSFT",
  GGLL: "GOOGL", GGLS: "GOOGL",
  AMZU: "AMZN", AMZD: "AMZN",
  METU: "META", METD: "META",
  CONL: "COIN", CONS: "COIN",
  FNGU: "QQQ",  FNGD: "QQQ",
};

// ─── Leverage multipliers ─────────────────────────────────────────────────

export const LEVERAGE_MAP: Record<string, number> = {
  TQQQ: 3, SQQQ: -3, QLD: 2, PSQ: -1,
  UPRO: 3, SPXU: -3, SSO: 2, SDS: -2,
  TNA: 3, TZA: -3, URTY: 3,
  SOXL: 3, SOXS: -3,
  NVDL: 2, NVDX: 2, NVDK: 2, NVDU: 2, NVD: -1,
  TSLL: 2, TSLQ: -1, TSLZ: -2,
  AAPU: 2, AAPD: -2, MSFU: 2, MSFD: -2,
  GGLL: 2, GGLS: -2, AMZU: 2, AMZD: -2,
  METU: 2, METD: -2, CONL: 2, CONS: -2,
  FNGU: 3, FNGD: -3,
};

// ─── Earnings watch by parent ─────────────────────────────────────────────

export const PARENT_EARNINGS_MAP: Record<string, string[]> = {
  QQQ:  ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA"],
  SPY:  ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA"],
  IWM:  [],
  SOXX: ["NVDA", "AVGO", "TSM", "AMD", "QCOM", "ASML"],
  SMH:  ["NVDA", "AVGO", "TSM", "AMD", "QCOM", "ASML"],
  NVDA: ["NVDA"],
  TSLA: ["TSLA"],
  AAPL: ["AAPL"],
  MSFT: ["MSFT"],
  GOOGL: ["GOOGL"],
  AMZN: ["AMZN"],
  META: ["META"],
  COIN: ["COIN"],
};

// ─── Macro events calendar ────────────────────────────────────────────────

export interface MacroEvent {
  date: string;  // YYYY-MM-DD
  type: "fomc" | "cpi" | "pce" | "nfp" | "tariff";
  label: string;
}

export const MACRO_EVENTS: MacroEvent[] = [
  { date: "2026-04-29", type: "fomc", label: "FOMC 议息会议" },
  { date: "2026-04-30", type: "fomc", label: "FOMC 议息会议" },
  { date: "2026-05-12", type: "cpi",  label: "CPI 数据" },
  { date: "2026-05-29", type: "pce",  label: "PCE 数据" },
  { date: "2026-05-02", type: "nfp",  label: "非农就业" },
  { date: "2026-06-06", type: "nfp",  label: "非农就业" },
  { date: "2026-06-11", type: "cpi",  label: "CPI 数据" },
  { date: "2026-06-16", type: "fomc", label: "FOMC 议息会议" },
  { date: "2026-06-17", type: "fomc", label: "FOMC 议息会议" },
  { date: "2026-06-26", type: "pce",  label: "PCE 数据" },
  { date: "2026-07-28", type: "fomc", label: "FOMC 议息会议" },
  { date: "2026-07-29", type: "fomc", label: "FOMC 议息会议" },
];

// ─── Default tickers ──────────────────────────────────────────────────────

export const DEFAULT_TICKERS = "TQQQ,SOXL,TSLL,NVDL";
