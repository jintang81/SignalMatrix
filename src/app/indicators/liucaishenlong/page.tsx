"use client";

import { useState, useCallback, useMemo } from "react";
import ControlBar, { type MCDXInterval, type MCDXRange } from "@/components/indicators/liucaishenlong/ControlBar";
import SignalCards from "@/components/indicators/liucaishenlong/SignalCards";
import MCDXCharts, { type MCDXChartSlice } from "@/components/indicators/liucaishenlong/MCDXCharts";
import InfoBar from "@/components/indicators/supertrend/InfoBar";
import { fetchOHLCV } from "@/lib/api";
import { calcMCDX, calcMA } from "@/lib/indicators";
import type { OHLCVData, MCDXResult } from "@/types";

type MAFull = {
  ma5:   (number | null)[];
  ma10:  (number | null)[];
  ma20:  (number | null)[];
  ma50:  (number | null)[];
  ma200: (number | null)[];
};

type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; raw: OHLCVData; mcdx: MCDXResult; maFull: MAFull; symbol: string; interval: MCDXInterval };

const RANGE_DAYS: Record<MCDXRange, number> = {
  "3mo": 91, "6mo": 182, "1y": 365, "2y": 730,
};

export default function LiucaishenglongPage() {
  const [state, setState] = useState<PageState>({ status: "idle" });
  const [displayRange, setDisplayRange] = useState<MCDXRange>("1y");

  const analyze = useCallback(async (symbol: string, interval: MCDXInterval) => {
    setState({ status: "loading" });
    try {
      const raw = await fetchOHLCV(symbol, "2y", interval);
      const mcdx = calcMCDX(raw.closes);
      const maFull: MAFull = {
        ma5:   calcMA(raw.closes, 5),
        ma10:  calcMA(raw.closes, 10),
        ma20:  calcMA(raw.closes, 20),
        ma50:  calcMA(raw.closes, 50),
        ma200: calcMA(raw.closes, 200),
      };
      setState({ status: "ready", raw, mcdx, maFull, symbol, interval });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, []);

  const sliced = useMemo(() => {
    if (state.status !== "ready") return null;
    const { raw, mcdx, maFull, interval } = state;
    const cutoff = new Date(Date.now() - RANGE_DAYS[displayRange] * 86400_000);
    const si = raw.timestamps.findIndex((t) => new Date(t * 1000) >= cutoff);
    const start = si < 0 ? 0 : si;

    const sl = <T,>(arr: T[]) => arr.slice(start);
    const dates = sl(raw.timestamps).map((t) => new Date(t * 1000));

    const chartSlice: MCDXChartSlice = {
      dates,
      O: sl(raw.opens),
      H: sl(raw.highs),
      L: sl(raw.lows),
      C: sl(raw.closes),
      V: sl(raw.volumes),
      ma5:   sl(maFull.ma5),
      ma10:  sl(maFull.ma10),
      ma20:  sl(maFull.ma20),
      ma50:  sl(maFull.ma50),
      ma200: sl(maFull.ma200),
      banker:   sl(mcdx.banker),
      hotMoney: sl(mcdx.hotMoney),
      bankerMA: sl(mcdx.bankerMA),
    };

    return { chartSlice, sliceStart: start, sliceLength: dates.length };
  }, [state, displayRange]);

  const isLoading = state.status === "loading";

  return (
    <div className="py-3 space-y-3">
      {/* Header */}
      <div className="panel p-3">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xl">🐉</span>
          <p
            className="text-lg font-chinese font-bold tracking-widest"
            style={{
              background: "linear-gradient(135deg, #c9223a, #e05a1a, #d8c200, #2a9d2a, #1a6bc9, #7b2fa0)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            六彩神龙
          </p>
          <span className="tag tag-muted text-[9px]">MCDX Smart Money</span>
        </div>
        <p className="text-xs text-muted/60">
          庄家 RSI(50) · 游资 RSI(40) · 散户基准 20 — 三层资金分布，识别主力控盘与游资动向
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
          <span className="inline-block w-4 h-4 border-2 border-border border-t-bear rounded-full animate-spin mr-2 align-middle" />
          <span className="text-sm text-muted/60">正在获取数据…</span>
        </div>
      )}

      {state.status === "ready" && sliced && (
        <>
          <InfoBar data={state.raw} sliceLength={sliced.sliceLength} />
          <SignalCards mcdx={state.mcdx} sliceStart={sliced.sliceStart} />
          <MCDXCharts data={sliced.chartSlice} interval={state.interval} />
        </>
      )}

      {state.status === "idle" && (
        <div className="panel p-8 text-center text-sm text-muted/50">
          输入股票代码，点击「🐉 分析龙脉」开始
        </div>
      )}
    </div>
  );
}
