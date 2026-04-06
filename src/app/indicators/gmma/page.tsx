"use client";

import { useState, useCallback, useMemo } from "react";
import ControlBar, { type GMMAInterval, type GMMARange } from "@/components/indicators/gmma/ControlBar";
import SignalCards from "@/components/indicators/gmma/SignalCards";
import GMMACharts, { type GMMAChartSlice } from "@/components/indicators/gmma/GMMACharts";
import InfoBar from "@/components/indicators/supertrend/InfoBar";
import { fetchOHLCV } from "@/lib/api";
import { calcGMMA, calcGMMASignals } from "@/lib/indicators";
import type { OHLCVData, GMMAResult, GMMASignals } from "@/types";

type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; raw: OHLCVData; gmma: GMMAResult; signals: GMMASignals; symbol: string; interval: GMMAInterval };

const RANGE_DAYS: Record<GMMARange, number> = {
  "3mo": 91, "6mo": 182, "1y": 365, "2y": 730,
};

export default function GMMAPage() {
  const [state, setState] = useState<PageState>({ status: "idle" });
  const [displayRange, setDisplayRange] = useState<GMMARange>("1y");

  const analyze = useCallback(async (symbol: string, interval: GMMAInterval) => {
    setState({ status: "loading" });
    try {
      const raw = await fetchOHLCV(symbol, "2y", interval);
      const gmma = calcGMMA(raw.closes);
      const signals = calcGMMASignals(raw.closes, raw.highs, raw.lows, gmma);
      setState({ status: "ready", raw, gmma, signals, symbol, interval });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, []);

  const sliced = useMemo(() => {
    if (state.status !== "ready") return null;
    const { raw, gmma, signals } = state;
    const cutoff = new Date(Date.now() - RANGE_DAYS[displayRange] * 86400_000);
    const si = raw.timestamps.findIndex((t) => new Date(t * 1000) >= cutoff);
    const start = si < 0 ? 0 : si;

    const sl = <T,>(arr: T[]) => arr.slice(start);
    const dates = sl(raw.timestamps).map((t) => new Date(t * 1000));

    const chartSlice: GMMAChartSlice = {
      dates,
      O: sl(raw.opens),
      H: sl(raw.highs),
      L: sl(raw.lows),
      C: sl(raw.closes),
      V: sl(raw.volumes),
      short: gmma.short.map((arr) => sl(arr)),
      long:  gmma.long.map((arr) => sl(arr)),
      tripleCross: sl(signals.tripleCross),
      break12:     sl(signals.break12),
      smiley:      sl(signals.smiley),
      kdCross:     sl(signals.kdCross),
    };

    return { chartSlice, sliceStart: start, sliceLength: dates.length };
  }, [state, displayRange]);

  const isLoading = state.status === "loading";

  return (
    <div className="py-6 space-y-3">
      {/* Header */}
      <div className="panel p-3">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xl">📈</span>
          <p
            className="text-lg font-chinese font-bold tracking-widest"
            style={{
              background: "linear-gradient(90deg, #00e676, #69f0ae, #c9a84c, #ff5252, #ffab40)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            顾比均线加强版
          </p>
          <span className="tag tag-muted text-[9px]">GMMA Enhanced</span>
        </div>
        <p className="text-xs text-muted/60">
          短期 EMA(3/5/8/10/12/15) · 长期 EMA(30/35/40/45/50/60) — 双组均线识别趋势强度与主力介入时机
        </p>
      </div>

      <ControlBar
        interval={state.status === "ready" ? state.interval : "1d"}
        displayRange={displayRange}
        loading={isLoading}
        onAnalyze={analyze}
        onRangeChange={setDisplayRange}
      />

      {state.status === "error" && (
        <div className="panel p-4">
          <p className="text-sm text-dn/80">⚠ {state.message}</p>
          <p className="text-xs text-muted/50 mt-1">请检查代码是否正确，或稍后重试</p>
        </div>
      )}

      {state.status === "loading" && (
        <div className="panel p-8 text-center">
          <span className="inline-block w-4 h-4 border-2 border-border border-t-bull rounded-full animate-spin mr-2 align-middle" />
          <span className="text-sm text-muted/60">正在获取数据…</span>
        </div>
      )}

      {state.status === "ready" && sliced && (
        <>
          <InfoBar data={state.raw} sliceLength={sliced.sliceLength} />
          <SignalCards
            gmma={state.gmma}
            signals={state.signals}
            sliceStart={sliced.sliceStart}
          />
          <GMMACharts data={sliced.chartSlice} interval={state.interval} />
        </>
      )}

      {state.status === "idle" && (
        <div className="panel p-8 text-center text-sm text-muted/50">
          输入股票代码，点击「📈 分析顾比」开始
        </div>
      )}
    </div>
  );
}
