"use client";

import { useState } from "react";
import SellPutForm from "@/components/screeners/sell-put/SellPutForm";
import SellPutTable from "@/components/screeners/sell-put/SellPutTable";
import SellPutDetail, { GlossaryPanel } from "@/components/screeners/sell-put/SellPutDetail";
import { analyzeTicker } from "@/lib/sellput/data";
import { DEFAULT_TICKERS } from "@/lib/sellput/constants";
import type { AnalysisError, AnalysisResult, ScanParams } from "@/lib/sellput/types";

// ─── State ────────────────────────────────────────────────────────────────

type ScanState =
  | { status: "idle" }
  | { status: "scanning"; ticker: string; progress: number; total: number }
  | { status: "complete"; results: Record<string, AnalysisResult | AnalysisError> }
  | { status: "error"; message: string };

const DEFAULT_PARAMS: ScanParams = {
  tickers: DEFAULT_TICKERS.split(","),
  cash: 50000,
  dteMin: 21,
  dteMax: 60,
  entryMode: "neutral",
  dataSource: "backend",
};

// ─── Page ─────────────────────────────────────────────────────────────────

export default function SellPutPage() {
  const [params, setParams] = useState<ScanParams>(DEFAULT_PARAMS);
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const [selected, setSelected] = useState<string | null>(null);

  async function handleScan() {
    const tickers = params.tickers.filter(Boolean);
    if (!tickers.length) return;

    setState({ status: "scanning", ticker: tickers[0], progress: 0, total: tickers.length });
    setSelected(null);

    const results: Record<string, AnalysisResult | AnalysisError> = {};

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      setState({ status: "scanning", ticker, progress: i + 1, total: tickers.length });
      results[ticker] = await analyzeTicker(ticker, { ...params, tickers });
    }

    setState({ status: "complete", results });

    // Auto-select highest score
    const best = Object.entries(results)
      .filter(([, r]) => !("error" in r))
      .sort(([, a], [, b]) => (b as AnalysisResult).score - (a as AnalysisResult).score)[0];
    if (best) setSelected(best[0]);
  }

  const isScanning = state.status === "scanning";
  const hasResults = state.status === "complete";

  const selectedResult =
    hasResults && selected && state.results[selected]
      ? state.results[selected]
      : null;

  const isError = (r: AnalysisResult | AnalysisError): r is AnalysisError =>
    "error" in r;

  return (
    <div className="py-6 space-y-3 min-h-[calc(100dvh-3.5rem)]">
      {/* Page header */}
      <div className="panel p-3">
        <p className="text-sm tracking-[0.18em] text-muted mb-1">SELL PUT</p>
        <p className="text-xs text-muted/60">
          五关决策框架 · 高波动杠杆 ETF 现金担保 Put 开仓评估 · 实时数据
        </p>
      </div>

      {/* Glossary */}
      <GlossaryPanel />

      {/* Form */}
      <SellPutForm
        params={params}
        onChange={setParams}
        onScan={handleScan}
        scanning={isScanning}
        scanTicker={isScanning ? state.ticker : undefined}
        scanProgress={isScanning ? state.progress : undefined}
        scanTotal={isScanning ? state.total : undefined}
      />

      {/* Error */}
      {state.status === "error" && (
        <div className="panel p-3 text-bear text-sm">{state.message}</div>
      )}

      {/* Results table */}
      {hasResults && (
        <SellPutTable
          results={state.results}
          selected={selected}
          onSelect={setSelected}
        />
      )}

      {/* Detail */}
      {hasResults && selectedResult && !isError(selectedResult) && (
        <SellPutDetail result={selectedResult} />
      )}

      {/* No results yet */}
      {state.status === "idle" && (
        <div className="panel p-6 text-center text-muted/40 text-xs">
          输入标的代码，点击「开始分析」
        </div>
      )}
    </div>
  );
}
