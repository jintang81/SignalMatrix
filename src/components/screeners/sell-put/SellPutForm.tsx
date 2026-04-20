"use client";

import { useState } from "react";
import type { DataSource, EntryMode, ScanParams } from "@/lib/sellput/types";
import { DEFAULT_TICKERS } from "@/lib/sellput/constants";

// ─── TickerInput (keeps trailing comma so user can keep typing) ───────────

function TickerInput({ value, onChange, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [raw, setRaw] = useState(value.join(","));
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase();
    setRaw(v);
    onChange(v.split(",").map(t => t.trim()).filter(Boolean));
  };
  // On blur, clean up trailing commas / whitespace
  const handleBlur = () => setRaw(value.join(","));
  return (
    <input
      type="text"
      value={raw}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className="w-full bg-bg-3 border border-border rounded px-2 py-1.5 text-xs font-trading text-txt focus:outline-none focus:border-gold/60 placeholder:text-muted/30"
    />
  );
}

// ─── Props ────────────────────────────────────────────────────────────────

interface Props {
  params: ScanParams;
  onChange: (p: ScanParams) => void;
  onScan: () => void;
  scanning: boolean;
  scanTicker?: string;
  scanProgress?: number;
  scanTotal?: number;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function SellPutForm({
  params,
  onChange,
  onScan,
  scanning,
  scanTicker,
  scanProgress,
  scanTotal,
}: Props) {
  function set<K extends keyof ScanParams>(k: K, v: ScanParams[K]) {
    onChange({ ...params, [k]: v });
  }

  return (
    <div className="panel p-3 space-y-3">
      {/* Row 1: Tickers + Cash */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10px] text-muted/60 mb-1 tracking-widest">
            TICKERS (逗号分隔)
          </label>
          <TickerInput
            value={params.tickers}
            onChange={v => set("tickers", v)}
            placeholder={DEFAULT_TICKERS}
          />
        </div>

        <div className="w-32">
          <label className="block text-[10px] text-muted/60 mb-1 tracking-widest">
            保证金 ($)
          </label>
          <input
            type="number"
            value={params.cash}
            min={1000}
            step={1000}
            onChange={e => set("cash", +e.target.value)}
            className="w-full bg-bg-3 border border-border rounded px-2 py-1.5 text-xs font-trading text-txt focus:outline-none focus:border-gold/60"
          />
        </div>
      </div>

      {/* Row 2: DTE + Entry Mode + Data Source */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex gap-2 items-end">
          <div className="w-20">
            <label className="block text-[10px] text-muted/60 mb-1 tracking-widest">
              DTE 最小
            </label>
            <input
              type="number"
              value={params.dteMin}
              min={7}
              max={params.dteMax - 1}
              onChange={e => set("dteMin", +e.target.value)}
              className="w-full bg-bg-3 border border-border rounded px-2 py-1.5 text-xs font-trading text-txt focus:outline-none focus:border-gold/60"
            />
          </div>
          <div className="w-20">
            <label className="block text-[10px] text-muted/60 mb-1 tracking-widest">
              DTE 最大
            </label>
            <input
              type="number"
              value={params.dteMax}
              min={params.dteMin + 1}
              max={120}
              onChange={e => set("dteMax", +e.target.value)}
              className="w-full bg-bg-3 border border-border rounded px-2 py-1.5 text-xs font-trading text-txt focus:outline-none focus:border-gold/60"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-muted/60 mb-1 tracking-widest">
            入场模式
          </label>
          <div className="flex gap-1">
            {(["strong", "neutral", "cautious"] as EntryMode[]).map(m => (
              <button
                key={m}
                onClick={() => set("entryMode", m)}
                className={`px-2 py-1 text-[10px] tracking-wider rounded border transition-colors ${
                  params.entryMode === m
                    ? "bg-gold/15 border-gold/50 text-gold"
                    : "bg-bg-3 border-border text-muted/50 hover:border-border/80"
                }`}
              >
                {m === "strong" ? "激进" : m === "neutral" ? "中性" : "保守"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-muted/60 mb-1 tracking-widest">
            数据源
          </label>
          <div className="flex gap-1">
            {(["backend", "mock"] as DataSource[]).map(d => (
              <button
                key={d}
                onClick={() => set("dataSource", d)}
                className={`px-2 py-1 text-[10px] tracking-wider rounded border transition-colors ${
                  params.dataSource === d
                    ? "bg-gold/15 border-gold/50 text-gold"
                    : "bg-bg-3 border-border text-muted/50 hover:border-border/80"
                }`}
              >
                {d === "backend" ? "实时" : "模拟"}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onScan}
          disabled={scanning || params.tickers.length === 0}
          className="btn ml-auto px-4 py-1.5 text-xs tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {scanning ? "扫描中…" : "开始分析"}
        </button>
      </div>

      {/* Status bar */}
      {scanning && scanTicker && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-bg-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold transition-all duration-300"
              style={{ width: `${((scanProgress ?? 0) / (scanTotal ?? 1)) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-muted/50 font-trading shrink-0">
            {scanProgress}/{scanTotal} — {scanTicker}
          </span>
        </div>
      )}
    </div>
  );
}
