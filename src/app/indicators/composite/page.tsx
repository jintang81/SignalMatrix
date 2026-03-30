"use client";

import { useState, useCallback } from "react";
import ControlBar, {
  type CInterval,
  type OverlayToggles,
  type IndicatorParams,
  DEFAULT_OVERLAYS,
  DEFAULT_PARAMS,
} from "@/components/indicators/composite/ControlBar";
import CompositeChart, { type CompositeChartData } from "@/components/indicators/composite/CompositeChart";
import { fetchOHLCV } from "@/lib/api";
import type { OHLCVData } from "@/types";

type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CompositeChartData; symbol: string; interval: CInterval };

function toCompositeData(raw: OHLCVData): CompositeChartData {
  return {
    ...raw,
    dates: raw.timestamps.map((t) => new Date(t * 1000)),
  };
}

/** Fetch range by interval — Yahoo Finance limits 1h to 60d */
function fetchRange(interval: CInterval): string {
  return interval === "1h" ? "60d" : "10y";
}

export default function CompositePage() {
  const [state, setState] = useState<PageState>({ status: "idle" });
  const [overlays, setOverlays] = useState<OverlayToggles>(DEFAULT_OVERLAYS);
  const [params, setParams] = useState<IndicatorParams>(DEFAULT_PARAMS);

  const analyze = useCallback(async (symbol: string, interval: CInterval) => {
    setState({ status: "loading" });
    try {
      const raw = await fetchOHLCV(symbol, fetchRange(interval), interval);
      setState({
        status: "ready",
        data: toCompositeData(raw),
        symbol,
        interval,
      });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, []);

  const isLoading = state.status === "loading";

  return (
    <div className="py-3 space-y-3">
      {/* Header */}
      <div className="panel p-3">
        <div className="flex items-center gap-3 mb-1">
          <p className="text-sm tracking-[0.12em] text-gold">COMPOSITE CHART</p>
          <span className="tag tag-muted text-[9px]">综合技术指标图表</span>
        </div>
        <p className="text-xs text-muted/60">
          多指标叠加综合图表 — K线 + MACD + RSI + KDJ + 布林带 + SuperTrend + GMMA + 均线系统，滚轮缩放 · 拖动平移
        </p>
      </div>

      <ControlBar
        interval={state.status === "ready" ? state.interval : "1d"}
        loading={isLoading}
        overlays={overlays}
        params={params}
        onAnalyze={analyze}
        onOverlaysChange={setOverlays}
        onParamsChange={setParams}
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

      {state.status === "ready" && (
        <>
          {/* Info bar */}
          <div className="panel p-3 flex flex-wrap gap-4 items-center">
            <div>
              <span className="text-xs text-muted/50 mr-2">代码</span>
              <span className="text-sm text-gold font-trading tracking-widest">{state.symbol}</span>
            </div>
            <div>
              <span className="text-xs text-muted/50 mr-2">最新</span>
              <span className="text-sm text-txt font-trading">
                ${state.data.regularMarketPrice.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted/50 mr-2">数据</span>
              <span className="text-xs text-muted font-trading">{state.data.dates.length} 根K线</span>
            </div>
            {state.data.dates.length > 0 && (
              <div>
                <span className="text-xs text-muted/50 mr-2">区间</span>
                <span className="text-xs text-muted font-trading">
                  {state.data.dates[0].toISOString().slice(0, 10)}
                  {" ~ "}
                  {state.data.dates[state.data.dates.length - 1].toISOString().slice(0, 10)}
                </span>
              </div>
            )}
          </div>

          <CompositeChart
            data={state.data}
            overlays={overlays}
            params={params}
            interval={state.interval}
          />
        </>
      )}

      {state.status === "idle" && (
        <div className="panel p-8 text-center text-sm text-muted/50">
          输入股票代码，点击「📊 分析」开始
        </div>
      )}
    </div>
  );
}
