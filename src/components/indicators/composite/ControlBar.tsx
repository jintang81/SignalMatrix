"use client";

import { useState } from "react";

export type CInterval = "1h" | "1d" | "1wk" | "1mo";

export interface OverlayToggles {
  macd: boolean;
  rsi: boolean;
  kdj: boolean;
  mcdx: boolean;
  bollinger: boolean;
  supertrend: boolean;
  ma5: boolean;
  ma10: boolean;
  ma20: boolean;
  ma50: boolean;
  ma200: boolean;
  ma240: boolean;
  gmma: boolean;
}

export interface IndicatorParams {
  rsiPeriod: number;
  bbPeriod: number;
  bbStdDev: number;
  stPrd: number;
  stFactor: number;
  stAtrPd: number;
  macdFast: number;
  macdSlow: number;
  macdSig: number;
  kdjPeriod: number;
}

export const DEFAULT_OVERLAYS: OverlayToggles = {
  macd: true,
  rsi: true,
  kdj: false,
  mcdx: false,
  bollinger: false,
  supertrend: false,
  ma5: false,
  ma10: false,
  ma20: true,
  ma50: true,
  ma200: false,
  ma240: false,
  gmma: false,
};

export const DEFAULT_PARAMS: IndicatorParams = {
  rsiPeriod: 14,
  bbPeriod: 20,
  bbStdDev: 2,
  stPrd: 2,
  stFactor: 3,
  stAtrPd: 10,
  macdFast: 12,
  macdSlow: 26,
  macdSig: 9,
  kdjPeriod: 9,
};

const INTERVALS: { label: string; value: CInterval }[] = [
  { label: "时", value: "1h" },
  { label: "日", value: "1d" },
  { label: "周", value: "1wk" },
  { label: "月", value: "1mo" },
];

const QUICK_SYMBOLS = ["AAPL", "TSLA", "NVDA", "AMZN", "MSFT", "SPY", "QQQ", "BTC-USD", "GLD"];

interface Props {
  interval: CInterval;
  loading: boolean;
  overlays: OverlayToggles;
  params: IndicatorParams;
  onAnalyze: (symbol: string, interval: CInterval) => void;
  onOverlaysChange: (o: OverlayToggles) => void;
  onParamsChange: (p: IndicatorParams) => void;
}

export default function ControlBar({
  interval,
  loading,
  overlays,
  params,
  onAnalyze,
  onOverlaysChange,
  onParamsChange,
}: Props) {
  const [symbol, setSymbol] = useState("AAPL");
  const [currentInterval, setCurrentInterval] = useState<CInterval>(interval);
  const [showParams, setShowParams] = useState(false);

  function handleAnalyze() {
    const sym = symbol.trim().toUpperCase();
    if (sym) onAnalyze(sym, currentInterval);
  }

  function toggle(key: keyof OverlayToggles) {
    onOverlaysChange({ ...overlays, [key]: !overlays[key] });
  }

  function setParam(key: keyof IndicatorParams, val: string) {
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) onParamsChange({ ...params, [key]: n });
  }

  const SubToggle = ({ k, label, color }: { k: keyof OverlayToggles; label: string; color?: string }) => (
    <button
      onClick={() => toggle(k)}
      className={`btn text-[10px] py-1 px-2.5 ${overlays[k] ? "btn-active" : ""}`}
      style={overlays[k] && color ? { borderColor: color + "80", color } : undefined}
    >
      {label}
    </button>
  );

  return (
    <div className="panel p-4 space-y-3">
      {/* Row 1: Symbol + Interval + Analyze */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex bg-bg-3 border border-border rounded overflow-hidden focus-within:border-bull/60 transition-colors">
          <span className="flex items-center px-3 text-muted/50 text-xs border-r border-border font-trading select-none">$</span>
          <input
            className="w-28 bg-transparent px-3 py-2 text-sm text-txt placeholder:text-muted/40 focus:outline-none font-trading tracking-widest uppercase"
            placeholder="AAPL"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              className={`btn text-xs py-1.5 px-3 ${currentInterval === iv.value ? "btn-active" : ""}`}
              onClick={() => setCurrentInterval(iv.value)}
            >
              {iv.label}
            </button>
          ))}
        </div>

        <button
          className="btn text-xs py-1.5 px-4 border-bull/50 text-bull bg-bull/8 hover:bg-bull/15"
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border border-bull/40 border-t-bull rounded-full animate-spin" />
              加载中
            </span>
          ) : (
            "📊 分析"
          )}
        </button>
      </div>

      {/* Row 2: Quick symbols */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_SYMBOLS.map((sym) => (
          <button
            key={sym}
            className="tag tag-muted text-[10px] cursor-pointer hover:border-bull/50 hover:text-bull transition-colors"
            onClick={() => {
              setSymbol(sym);
              onAnalyze(sym, currentInterval);
            }}
          >
            {sym}
          </button>
        ))}
      </div>

      {/* Row 3a: Sub-panel toggles */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] text-muted/50 mr-1">副图</span>
        <SubToggle k="macd" label="MACD" color="#f0e040" />
        <SubToggle k="rsi" label="RSI" color="#a78bfa" />
        <SubToggle k="kdj" label="KDJ" color="#f0e040" />
        <SubToggle k="mcdx" label="六彩神龙" color="#5b9cf6" />
      </div>

      {/* Row 3b: Main panel overlays */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] text-muted/50 mr-1">叠加</span>
        <SubToggle k="bollinger" label="布林带" color="#5b9cf6" />
        <SubToggle k="supertrend" label="SuperTrend" color="#00e676" />
        <SubToggle k="gmma" label="GMMA+" color="#00c853" />
      </div>

      {/* Row 3c: MA toggles */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] text-muted/50 mr-1">均线</span>
        {(
          [
            { k: "ma5" as const, label: "MA5", color: "#f0e040" },
            { k: "ma10" as const, label: "MA10", color: "#ff9800" },
            { k: "ma20" as const, label: "MA20", color: "#e040fb" },
            { k: "ma50" as const, label: "MA50", color: "#29b6f6" },
            { k: "ma200" as const, label: "MA200", color: "#ff5252" },
            { k: "ma240" as const, label: "MA240", color: "#ff8a80" },
          ] as const
        ).map(({ k, label, color }) => (
          <button
            key={k}
            onClick={() => toggle(k)}
            className={`btn text-[10px] py-1 px-2.5 ${overlays[k] ? "btn-active" : ""}`}
            style={overlays[k] ? { borderColor: color + "80", color } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Row 4: Params toggle */}
      <div>
        <button
          className="text-[10px] text-muted/50 hover:text-muted transition-colors flex items-center gap-1"
          onClick={() => setShowParams(!showParams)}
        >
          <span>{showParams ? "▾" : "▸"}</span>
          参数设置
        </button>

        {showParams && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label: "RSI 周期", key: "rsiPeriod" as const },
              { label: "BB 周期", key: "bbPeriod" as const },
              { label: "BB 倍数", key: "bbStdDev" as const },
              { label: "ST Prd", key: "stPrd" as const },
              { label: "ST Factor", key: "stFactor" as const },
              { label: "ST ATR", key: "stAtrPd" as const },
              { label: "MACD Fast", key: "macdFast" as const },
              { label: "MACD Slow", key: "macdSlow" as const },
              { label: "MACD Signal", key: "macdSig" as const },
              { label: "KDJ 周期", key: "kdjPeriod" as const },
            ].map(({ label, key }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[9px] text-muted/50">{label}</label>
                <input
                  type="number"
                  className="bg-bg-3 border border-border rounded px-2 py-1 text-xs text-txt font-trading w-full focus:outline-none focus:border-bull/40"
                  value={params[key]}
                  onChange={(e) => setParam(key, e.target.value)}
                  min={1}
                  step={key === "bbStdDev" || key === "stFactor" ? 0.1 : 1}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
