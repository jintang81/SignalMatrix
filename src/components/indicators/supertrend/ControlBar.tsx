"use client";

import { useState } from "react";

export type STInterval = "1h" | "1d" | "1wk" | "1mo";
export type STRange = "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

export type STParams = { prd: number; factor: number; atrPd: number };
export type STToggles = {
  showPivots: boolean;
  showLabels: boolean;
  showCenter: boolean;
  showSR: boolean;
};

const INTERVALS: { label: string; value: STInterval }[] = [
  { label: "小时", value: "1h" },
  { label: "日线", value: "1d" },
  { label: "周线", value: "1wk" },
  { label: "月线", value: "1mo" },
];

const RANGES: { label: string; value: STRange }[] = [
  { label: "5d", value: "5d" },
  { label: "1mo", value: "1mo" },
  { label: "3mo", value: "3mo" },
  { label: "6mo", value: "6mo" },
  { label: "1y", value: "1y" },
  { label: "2y", value: "2y" },
  { label: "5y", value: "5y" },
];

const QUICK_SYMBOLS = ["AAPL", "TSLA", "NVDA", "AMZN", "MSFT", "META", "GOOGL", "SPY", "QQQ", "BTC-USD"];

interface ControlBarProps {
  interval: STInterval;
  displayRange: STRange;
  params: STParams;
  toggles: STToggles;
  loading: boolean;
  onAnalyze: (symbol: string, interval: STInterval) => void;
  onRangeChange: (range: STRange) => void;
  onParamsChange: (params: STParams) => void;
  onTogglesChange: (toggles: STToggles) => void;
}

export default function ControlBar({
  interval,
  displayRange,
  params,
  toggles,
  loading,
  onAnalyze,
  onRangeChange,
  onParamsChange,
  onTogglesChange,
}: ControlBarProps) {
  const [symbol, setSymbol] = useState("AAPL");
  const [currentInterval, setCurrentInterval] = useState<STInterval>(interval);

  function handleAnalyze() {
    const sym = symbol.trim().toUpperCase();
    if (sym) onAnalyze(sym, currentInterval);
  }

  function handleIntervalChange(iv: STInterval) {
    setCurrentInterval(iv);
    // Auto-adjust range for hourly
    if (iv === "1h" && !["5d", "1mo", "3mo"].includes(displayRange)) {
      onRangeChange("1mo");
    } else if (iv !== "1h" && ["5d", "1mo", "3mo"].includes(displayRange)) {
      onRangeChange("1y");
    }
  }

  return (
    <div className="panel p-4 space-y-3">
      {/* Search row */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex bg-bg-3 border border-border rounded overflow-hidden focus-within:border-up/60 transition-colors">
          <span className="flex items-center px-3 text-muted/50 text-xs border-r border-border font-trading select-none">
            $
          </span>
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

        {/* Interval buttons */}
        <div className="flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              className={`btn text-xs py-1.5 px-3 ${currentInterval === iv.value ? "btn-active" : ""}`}
              onClick={() => handleIntervalChange(iv.value)}
            >
              {iv.label}
            </button>
          ))}
        </div>

        {/* Range buttons */}
        <div className="flex gap-1 flex-wrap">
          {RANGES.map((r) => (
            <button
              key={r.value}
              className={`btn text-xs py-1.5 px-2.5 ${displayRange === r.value ? "btn-active" : ""}`}
              onClick={() => onRangeChange(r.value)}
            >
              {r.label}
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
            "⚡ 分析趋势"
          )}
        </button>
      </div>

      {/* Quick symbols */}
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

      {/* Params row */}
      <div className="flex flex-wrap gap-3 items-center bg-bg-3/50 rounded px-3 py-2 border border-border/60">
        <span className="text-[10px] text-muted/60">参数：</span>
        {[
          { label: "PP周期", key: "prd" as const, min: 1, max: 50, step: 1 },
          { label: "ATR系数", key: "factor" as const, min: 0.5, max: 20, step: 0.5 },
          { label: "ATR周期", key: "atrPd" as const, min: 1, max: 100, step: 1 },
        ].map((p) => (
          <div key={p.key} className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted/60 whitespace-nowrap">{p.label}</span>
            <input
              type="number"
              min={p.min}
              max={p.max}
              step={p.step}
              value={params[p.key]}
              onChange={(e) =>
                onParamsChange({ ...params, [p.key]: parseFloat(e.target.value) || params[p.key] })
              }
              className="w-12 bg-bg border border-border rounded px-2 py-0.5 text-xs text-txt text-center font-trading focus:outline-none focus:border-gold/50"
            />
          </div>
        ))}

        <div className="w-px h-4 bg-border mx-1" />

        {[
          { label: "枢轴点", key: "showPivots" as const },
          { label: "买卖标签", key: "showLabels" as const },
          { label: "中轴线", key: "showCenter" as const },
          { label: "支撑阻力", key: "showSR" as const },
        ].map((t) => (
          <label key={t.key} className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={toggles[t.key]}
              onChange={(e) => onTogglesChange({ ...toggles, [t.key]: e.target.checked })}
              className="accent-gold w-3 h-3"
            />
            <span className="text-[10px] text-muted/70 whitespace-nowrap">{t.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
