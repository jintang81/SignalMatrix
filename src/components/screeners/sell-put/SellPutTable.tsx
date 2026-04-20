"use client";

import { useEffect, useState } from "react";
import { fmt, fmtPct, fmtSignedPct } from "@/lib/sellput/math";
import type { AnalysisError, AnalysisResult } from "@/lib/sellput/types";

// ─── Types ────────────────────────────────────────────────────────────────

type Column =
  | "ticker"
  | "score"
  | "price"
  | "parentDist"
  | "atmIV"
  | "ivhv"
  | "vix"
  | "rsi"
  | "trend"
  | "g1"
  | "g2";

interface Props {
  results: Record<string, AnalysisResult | AnalysisError>;
  selected: string | null;
  onSelect: (ticker: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isError(r: AnalysisResult | AnalysisError): r is AnalysisError {
  return "error" in r;
}

function scoreColor(s: number): string {
  if (s >= 75) return "#00e676";
  if (s >= 55) return "#f0cc6e";
  if (s >= 40) return "#ef5350";
  return "#ff1744";
}

function gateLabel(pass: boolean, count?: number, total?: number): React.ReactNode {
  if (count !== undefined && total !== undefined) {
    return (
      <span
        className="text-[10px] font-trading"
        style={{ color: pass ? "#00e676" : count >= total / 2 ? "#f0cc6e" : "#ef5350" }}
      >
        {count}/{total}
      </span>
    );
  }
  return (
    <span className="text-[10px]" style={{ color: pass ? "#00e676" : "#ef5350" }}>
      {pass ? "✓" : "✗"}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export default function SellPutTable({ results, selected, onSelect }: Props) {
  const [sortCol, setSortCol] = useState<Column>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [activeTip, setActiveTip] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!activeTip) return;
    function close() { setActiveTip(null); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [activeTip]);

  const tickers = Object.keys(results);
  if (!tickers.length) return null;

  function handleSort(col: Column) {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(false); }
  }

  function getSortValue(ticker: string): number {
    const r = results[ticker];
    if (isError(r)) return -Infinity;
    switch (sortCol) {
      case "score":      return r.score;
      case "price":      return r.currentPrice;
      case "parentDist": return r.parentMA200Dist;
      case "atmIV":      return r.atmIV ?? -1;
      case "ivhv":       return r.gate1.ivHv ?? -1;
      case "vix":        return r.vixCur ?? -1;
      case "rsi":        return r.gate1.rsi ?? -1;
      case "trend":      return r.trendStrength ?? -1;
      case "g1":         return r.gate1.passCount;
      case "g2":         return r.gate2.hasBlocker ? 0 : 1;
      default:           return 0;
    }
  }

  const sorted = [...tickers].sort((a, b) => {
    const diff = getSortValue(a) - getSortValue(b);
    return sortAsc ? diff : -diff;
  });

  function Th({ col, label, tooltip }: { col: Column; label: string; tooltip?: string }) {
    const active = sortCol === col;
    return (
      <th
        onClick={() => handleSort(col)}
        className="px-2 py-1.5 text-left text-[9px] tracking-widest text-muted/50 cursor-pointer hover:text-muted/80 whitespace-nowrap select-none"
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && <span>{sortAsc ? "↑" : "↓"}</span>}
          {tooltip && (
            <span
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] leading-none border border-muted/30 text-muted/50 hover:text-gold hover:border-gold/60 cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setActiveTip(t =>
                  t?.text === tooltip ? null : { text: tooltip, x: rect.left + rect.width / 2, y: rect.bottom + 8 }
                );
              }}
            >
              ?
            </span>
          )}
        </span>
      </th>
    );
  }

  return (
    <>
    <div className="panel overflow-x-auto">
      <table className="w-full font-trading text-xs min-w-[640px]">
        <thead>
          <tr className="border-b border-border/40">
            <Th col="ticker"     label="TICKER" />
            <Th col="score"      label="SCORE" tooltip="综合开仓时机评分 0–100。由 G1 市场环境(40) + G2 事件日历(20) + G3 合约质量(25) + 风险反思(15) 构成。≥75 绿色可开仓；55–74 金色谨慎；40–54 橙色观望；<40 红色不建议。无合格合约时总分上限 35。" />
            <Th col="price"      label="PRICE" />
            <Th col="parentDist" label="VS MA200" />
            <Th col="atmIV"      label="IV" />
            <Th col="ivhv"       label="IV/HV" />
            <Th col="vix"        label="VIX" />
            <Th col="rsi"        label="RSI" />
            <Th col="trend"      label="TREND" tooltip="趋势强度（效率比）0–1。= 20日净移动 / Σ日振幅。>0.5 方向明确；0.3–0.5 温和趋势；<0.3 震荡盘整。值越高表示价格走势越有方向性。" />
            <Th col="g1"         label="G1" />
            <Th col="g2"         label="G2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(ticker => {
            const r = results[ticker];
            const isSelected = selected === ticker;

            if (isError(r)) {
              return (
                <tr key={ticker} className="border-b border-border/20 opacity-40">
                  <td className="px-2 py-2 text-muted">{ticker}</td>
                  <td colSpan={10} className="px-2 py-2 text-bear/70 text-[10px]">
                    {r.error}
                  </td>
                </tr>
              );
            }

            return (
              <tr
                key={ticker}
                onClick={() => onSelect(ticker)}
                className={`border-b border-border/20 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-gold/5 border-gold/20"
                    : "hover:bg-bg-3/50"
                }`}
              >
                {/* Ticker */}
                <td className="px-2 py-2">
                  <span className="text-txt font-semibold tracking-wider">{ticker}</span>
                  {r.parentTicker !== ticker && (
                    <span className="text-[9px] text-muted/40 ml-1">({r.parentTicker})</span>
                  )}
                </td>

                {/* Score */}
                <td className="px-2 py-2">
                  <span
                    className="font-semibold"
                    style={{ color: scoreColor(r.score) }}
                  >
                    {r.score}
                  </span>
                </td>

                {/* Price */}
                <td className="px-2 py-2 text-txt/80">${fmt(r.currentPrice)}</td>

                {/* VS MA200 */}
                <td className="px-2 py-2">
                  <span className={r.parentMA200Dist >= 0 ? "text-up" : "text-dn"}>
                    {fmtSignedPct(r.parentMA200Dist)}
                  </span>
                </td>

                {/* IV */}
                <td className="px-2 py-2 text-txt/70">{fmtPct(r.atmIV)}</td>

                {/* IV/HV */}
                <td className="px-2 py-2">
                  <span className={
                    r.gate1.ivHv != null && r.gate1.ivHv > 1.3
                      ? "text-bull"
                      : r.gate1.ivHv != null && r.gate1.ivHv < 0.8
                      ? "text-bear"
                      : "text-txt/70"
                  }>
                    {r.gate1.ivHv != null ? fmt(r.gate1.ivHv) : "–"}
                  </span>
                </td>

                {/* VIX */}
                <td className="px-2 py-2 text-txt/70">
                  {r.vixCur != null ? fmt(r.vixCur, 1) : "–"}
                </td>

                {/* RSI */}
                <td className="px-2 py-2">
                  <span className={
                    r.gate1.rsi != null && r.gate1.rsi < 35
                      ? "text-bull"
                      : r.gate1.rsi != null && r.gate1.rsi > 70
                      ? "text-bear"
                      : "text-txt/70"
                  }>
                    {r.gate1.rsi != null ? fmt(r.gate1.rsi, 0) : "–"}
                  </span>
                </td>

                {/* Trend */}
                <td className="px-2 py-2 text-txt/60">
                  {r.trendStrength != null ? fmt(r.trendStrength, 2) : "–"}
                </td>

                {/* Gate 1 */}
                <td className="px-2 py-2">
                  {gateLabel(r.gate1.pass, r.gate1.passCount, r.gate1.totalCount)}
                </td>

                {/* Gate 2 */}
                <td className="px-2 py-2">
                  {gateLabel(!r.gate2.hasBlocker)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* Fixed-position tooltip — renders outside overflow-x-auto container */}
    {activeTip && (
      <div
        className="fixed z-50 w-60 rounded border border-border bg-bg-3 p-2.5 text-[10px] font-trading text-txt/80 leading-relaxed shadow-xl"
        style={{ left: activeTip.x, top: activeTip.y, transform: "translateX(-50%)" }}
        onClick={e => e.stopPropagation()}
      >
        {activeTip.text}
      </div>
    )}
    </>
  );
}
