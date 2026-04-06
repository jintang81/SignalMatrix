"use client";

import { useState, useCallback, useMemo } from "react";
import ControlBar, { type STInterval, type STRange, type STParams, type STToggles } from "@/components/indicators/supertrend/ControlBar";
import InfoBar from "@/components/indicators/supertrend/InfoBar";
import SignalCards from "@/components/indicators/supertrend/SignalCards";
import SuperTrendChart, { type ChartSlice } from "@/components/indicators/supertrend/SuperTrendChart";
import RSIChart from "@/components/indicators/supertrend/RSIChart";
import { fetchOHLCV } from "@/lib/api";
import { calcPPSuperTrend, calcRSI, calcSMA } from "@/lib/indicators";
import type { OHLCVData, PPSTResult } from "@/types";

type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; raw: OHLCVData; result: PPSTResult; symbol: string; interval: STInterval };

// Days per display range for slicing
const RANGE_DAYS: Record<STRange, number> = {
  "5d": 5, "1mo": 30, "3mo": 91, "6mo": 182, "1y": 365, "2y": 730, "5y": 1825,
};

export default function SuperTrendPage() {
  const [state, setState] = useState<PageState>({ status: "idle" });
  const [displayRange, setDisplayRange] = useState<STRange>("1y");
  const [params, setParams] = useState<STParams>({ prd: 2, factor: 3, atrPd: 10 });
  const [toggles, setToggles] = useState<STToggles>({
    showPivots: false,
    showLabels: true,
    showCenter: false,
    showSR: true,
  });

  const analyze = useCallback(async (symbol: string, interval: STInterval) => {
    setState({ status: "loading" });
    const warmupRange = interval === "1h" ? "60d" : "2y";
    try {
      const raw = await fetchOHLCV(symbol, warmupRange, interval);
      const result = calcPPSuperTrend(
        raw.highs, raw.lows, raw.closes,
        params.prd, params.factor, params.atrPd
      );
      setState({ status: "ready", raw, result, symbol, interval });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, [params]);

  // Recompute when params change (no refetch)
  const handleParamsChange = useCallback((newParams: STParams) => {
    setParams(newParams);
    if (state.status === "ready") {
      const result = calcPPSuperTrend(
        state.raw.highs, state.raw.lows, state.raw.closes,
        newParams.prd, newParams.factor, newParams.atrPd
      );
      setState((prev) => prev.status === "ready" ? { ...prev, result } : prev);
    }
  }, [state]);

  // Sliced data for chart rendering
  const sliced = useMemo(() => {
    if (state.status !== "ready") return null;
    const { raw, result, interval } = state;
    const cutoff = new Date(Date.now() - RANGE_DAYS[displayRange] * 86400_000);
    const si = raw.timestamps.findIndex((t) => new Date(t * 1000) >= cutoff);
    const start = si < 0 ? 0 : si;

    const sl = <T,>(arr: T[]) => arr.slice(start);
    const dates = sl(raw.timestamps).map((t) => new Date(t * 1000));

    const chartSlice: ChartSlice = {
      dates,
      O: sl(raw.opens),
      H: sl(raw.highs),
      L: sl(raw.lows),
      C: sl(raw.closes),
      V: sl(raw.volumes),
      st: sl(result.st),
      trend: sl(result.trend),
      center: sl(result.center),
      support: sl(result.support),
      resistance: sl(result.resistance),
      ph: sl(result.ph),
      pl: sl(result.pl),
    };

    // RSI on full data, sliced for display
    const rsiAll = calcRSI(raw.closes, 14).map((v) => (v == null ? NaN : v));
    const rsiMAAll = calcSMA(rsiAll, 6);

    return {
      chartSlice,
      rsiSlice: {
        dates,
        rsi: sl(rsiAll),
        rsiMA: sl(rsiMAAll),
      },
      sliceStart: start,
      sliceLength: dates.length,
    };
  }, [state, displayRange]);

  const isLoading = state.status === "loading";

  return (
    <div className="py-6 space-y-3">
      {/* Header */}
      <div className="panel p-3">
        <div className="flex items-center gap-3 mb-1">
          <p className="text-sm tracking-[0.12em] text-gold">PIVOT POINT SUPERTREND</p>
          <span className="tag tag-muted text-[9px]">枢轴点超级趋势</span>
        </div>
        <p className="text-xs text-muted/60">
          结合枢轴高/低点与 ATR 动态止损，识别趋势方向、买卖信号与支撑阻力
        </p>
      </div>

      <ControlBar
        interval={state.status === "ready" ? state.interval : "1d"}
        displayRange={displayRange}
        params={params}
        toggles={toggles}
        loading={isLoading}
        onAnalyze={analyze}
        onRangeChange={setDisplayRange}
        onParamsChange={handleParamsChange}
        onTogglesChange={setToggles}
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
          <SignalCards result={state.result} sliceStart={sliced.sliceStart} />
          <SuperTrendChart
            data={sliced.chartSlice}
            toggles={toggles}
            interval={state.interval}
          />
          <RSIChart
            dates={sliced.rsiSlice.dates}
            rsi={sliced.rsiSlice.rsi}
            rsiMA={sliced.rsiSlice.rsiMA}
            interval={state.interval}
          />
        </>
      )}

      {state.status === "idle" && (
        <div className="panel p-8 text-center text-sm text-muted/50">
          输入股票代码，点击「⚡ 分析趋势」开始
        </div>
      )}
    </div>
  );
}
