"use client";

import { useState } from "react";

export type MCDXInterval = "1d" | "1wk" | "1mo";
export type MCDXRange = "3mo" | "6mo" | "1y" | "2y";

const INTERVALS: { label: string; value: MCDXInterval }[] = [
  { label: "日线", value: "1d" },
  { label: "周线", value: "1wk" },
  { label: "月线", value: "1mo" },
];

const RANGES: { label: string; value: MCDXRange }[] = [
  { label: "3mo", value: "3mo" },
  { label: "6mo", value: "6mo" },
  { label: "1y", value: "1y" },
  { label: "2y", value: "2y" },
];

const QUICK_SYMBOLS = ["AAPL", "TSLA", "NVDA", "AMZN", "MSFT", "MCD", "SPY", "QQQ", "BTC-USD", "GLD"];

interface ControlBarProps {
  interval: MCDXInterval;
  displayRange: MCDXRange;
  loading: boolean;
  onAnalyze: (symbol: string, interval: MCDXInterval) => void;
  onRangeChange: (range: MCDXRange) => void;
}

export default function ControlBar({
  interval,
  displayRange,
  loading,
  onAnalyze,
  onRangeChange,
}: ControlBarProps) {
  const [symbol, setSymbol] = useState("AAPL");
  const [currentInterval, setCurrentInterval] = useState<MCDXInterval>(interval);

  function handleAnalyze() {
    const sym = symbol.trim().toUpperCase();
    if (sym) onAnalyze(sym, currentInterval);
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
              onClick={() => setCurrentInterval(iv.value)}
            >
              {iv.label}
            </button>
          ))}
        </div>

        {/* Range buttons */}
        <div className="flex gap-1">
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
          className="btn text-xs py-1.5 px-4 border-bear/50 text-bear bg-bear/8 hover:bg-bear/15"
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border border-bear/40 border-t-bear rounded-full animate-spin" />
              加载中
            </span>
          ) : (
            "🐉 分析龙脉"
          )}
        </button>
      </div>

      {/* Quick symbols */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_SYMBOLS.map((sym) => (
          <button
            key={sym}
            className="tag tag-muted text-[10px] cursor-pointer hover:border-bear/50 hover:text-bear transition-colors"
            onClick={() => {
              setSymbol(sym);
              onAnalyze(sym, currentInterval);
            }}
          >
            {sym}
          </button>
        ))}
      </div>
    </div>
  );
}
