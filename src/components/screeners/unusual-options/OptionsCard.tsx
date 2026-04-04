"use client";

import { useState } from "react";
import type { OptionsStock } from "@/types";
import { SignalBlock } from "./SignalBlock";

const OVERALL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  BUY:     { label: "BUY",       color: "#00e676", bg: "rgba(0,230,118,0.08)" },
  BEARISH: { label: "BEARISH",   color: "#ff1744", bg: "rgba(255,23,68,0.08)" },
  WARNING: { label: "⚠ WARNING", color: "#c9a84c", bg: "rgba(201,168,76,0.08)" },
  WATCH:   { label: "WATCH",     color: "#4f9cf9", bg: "rgba(79,156,249,0.08)" },
};

function getStarColor(stars: number, overall: string | null): string {
  if (overall === "BEARISH" || overall === "WARNING") {
    return stars >= 3 ? "#ff1744" : stars >= 1 ? "#ef5350" : "#94a3b8";
  }
  return stars >= 4 ? "#00e676" : stars >= 2 ? "#c9a84c" : "#94a3b8";
}

function StarRating({ stars, overall }: { stars: number; overall: string | null }) {
  const color = getStarColor(stars, overall);
  return (
    <span className="font-trading text-sm tracking-tighter">
      <span style={{ color }}> {"★".repeat(stars)}</span>
      <span style={{ color: "#2e3a50" }}>{"★".repeat(5 - stars)}</span>
    </span>
  );
}

export function OptionsCard({ stock }: { stock: OptionsStock }) {
  const [expanded, setExpanded] = useState(false);

  const overall = stock.overall ? OVERALL_CONFIG[stock.overall] : null;
  const chgColor1d = stock.change_1d >= 0 ? "text-up" : "text-dn";
  const chg5dColor = stock.change_5d >= 0 ? "text-up" : "text-dn";

  // ETF recommendations
  const etf2  = stock.info["2x"]   !== "-" ? stock.info["2x"]   : null;
  const etf3  = stock.info["3x"]   !== "-" ? stock.info["3x"]   : null;
  const inv2x = stock.info.inv2x   !== "-" ? stock.info.inv2x   : null;
  const inv3x = stock.info.inv3x   !== "-" ? stock.info.inv3x   : null;

  return (
    <div className="panel overflow-hidden">
      {/* ── Header ── */}
      <div
        className="flex items-start justify-between gap-3 p-4 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Left: ticker + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-trading font-bold text-txt">${stock.ticker}</span>
            <span className="tag tag-muted text-[9px]">{stock.info.sector}</span>
            <StarRating stars={stock.stars} overall={stock.overall} />
            <span className="text-[10px] text-muted/40 font-trading">({stock.stars}/5)</span>
          </div>
          <div className="text-[10px] text-muted/50 font-chinese mt-0.5">{stock.info.name}</div>
        </div>

        {/* Right: price + badges */}
        <div className="text-right shrink-0">
          <div className="text-sm font-trading font-bold text-txt">${stock.price.toFixed(2)}</div>
          <div className="text-[10px] text-muted/50 mt-0.5 font-trading">
            <span className={chgColor1d}>{stock.change_1d >= 0 ? "+" : ""}{stock.change_1d.toFixed(2)}%</span>
            <span className="text-muted/30 mx-1">·</span>
            <span className={chg5dColor}>5d {stock.change_5d >= 0 ? "+" : ""}{stock.change_5d.toFixed(1)}%</span>
            <span className="text-muted/30 mx-1">·</span>
            <span className="text-bear">{stock.drop_52w.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-end gap-2 mt-1">
            {overall && (
              <span
                className="text-[10px] font-trading font-bold px-2 py-0.5 rounded-full"
                style={{ color: overall.color, background: overall.bg, border: `1px solid ${overall.color}44` }}
              >
                {overall.label}
              </span>
            )}
            <span className="text-muted/30 text-xs">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 space-y-3">
          {stock.signals.map((sig, i) => (
            <SignalBlock key={i} signal={sig} />
          ))}

          {/* ETF recommendations */}
          {(stock.overall === "BUY" || stock.overall === "BEARISH") && (
            <div className="pt-2 border-t border-border/30">
              <div className="text-[10px] text-muted/40 mb-2">
                {stock.overall === "BUY" ? "📈 推荐做多杠杆 ETF" : "📉 推荐做空 ETF"}
              </div>
              <div className="flex flex-wrap gap-2">
                {stock.overall === "BUY" && etf2 && (
                  <a
                    href={`https://finance.yahoo.com/quote/${etf2}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-trading font-bold px-3 py-1 rounded bg-bull/10 text-bull border border-bull/30 hover:bg-bull/20 transition-colors"
                  >
                    2× {etf2}
                  </a>
                )}
                {stock.overall === "BUY" && etf3 && (
                  <a
                    href={`https://finance.yahoo.com/quote/${etf3}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-trading font-bold px-3 py-1 rounded bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/30 hover:bg-[#0ea5e9]/20 transition-colors"
                  >
                    3× {etf3}
                  </a>
                )}
                {stock.overall === "BEARISH" && inv2x && (
                  <a
                    href={`https://finance.yahoo.com/quote/${inv2x}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-trading font-bold px-3 py-1 rounded bg-bear/10 text-bear border border-bear/30 hover:bg-bear/20 transition-colors"
                  >
                    -2× {inv2x}
                  </a>
                )}
                {stock.overall === "BEARISH" && inv3x && (
                  <a
                    href={`https://finance.yahoo.com/quote/${inv3x}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-trading font-bold px-3 py-1 rounded bg-dn/10 text-dn border border-dn/30 hover:bg-dn/20 transition-colors"
                  >
                    -3× {inv3x}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
