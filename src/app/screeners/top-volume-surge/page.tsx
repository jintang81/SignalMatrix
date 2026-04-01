"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  fetchTopVolumeScreener,
  fetchTopVolumeStatus,
  triggerTopVolumeScan,
  type ScanStatus,
} from "@/lib/api/screener";
import type { TopVolumeSurgeScreenerResult, TopVolumeSurgeStock } from "@/types";
import SummaryStats from "@/components/screeners/top-volume-surge/SummaryStats";
import FilterBar, { type TopVolumeFilterMode } from "@/components/screeners/top-volume-surge/FilterBar";
import StockCard from "@/components/screeners/top-volume-surge/StockCard";

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: TopVolumeSurgeScreenerResult };

const POLL_INTERVAL  = 5000;
const MAX_POLL_COUNT = 72;

export default function TopVolumeSurgePage() {
  const [state, setState]           = useState<PageState>({ status: "loading" });
  const [filter, setFilter]         = useState<TopVolumeFilterMode>("all");
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ status: "idle" });
  const pollingRef                  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef                = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollCountRef.current = 0;
    pollingRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > MAX_POLL_COUNT) {
        stopPolling();
        setScanStatus({ status: "error", error: "扫描超时，请稍候再试" });
        return;
      }
      try {
        const s = await fetchTopVolumeStatus();
        setScanStatus(s);
        if (s.status === "done") {
          stopPolling();
          try {
            const data = await fetchTopVolumeScreener();
            setState({ status: "ready", data });
          } catch (e: unknown) {
            setState({ status: "error", message: (e as Error).message });
          }
        } else if (s.status === "error") {
          stopPolling();
        }
      } catch {
        // network hiccup — keep polling
      }
    }, POLL_INTERVAL);
  }, [stopPolling]);

  useEffect(() => {
    fetchTopVolumeStatus()
      .then((s) => {
        setScanStatus(s);
        if (s.status === "running") startPolling();
      })
      .catch(() => {});

    fetchTopVolumeScreener()
      .then((data) => {
        setState({ status: "ready", data });
        setScanStatus((prev) => (prev.status === "error" ? { status: "idle" } : prev));
      })
      .catch((e: Error) => setState({ status: "error", message: e.message }));

    return stopPolling;
  }, [startPolling, stopPolling]);

  const handleRefresh = useCallback(async () => {
    setScanStatus({ status: "running" });
    try {
      await triggerTopVolumeScan();
      startPolling();
    } catch {
      setScanStatus({ status: "error", error: "触发扫描失败，请稍候重试" });
    }
  }, [startPolling]);

  const handleRetry = useCallback(() => {
    setState({ status: "loading" });
    fetchTopVolumeScreener()
      .then((data) => {
        setState({ status: "ready", data });
        setScanStatus({ status: "idle" });
      })
      .catch((e: Error) => setState({ status: "error", message: e.message }));
  }, []);

  const filtered = useMemo<TopVolumeSurgeStock[]>(() => {
    if (state.status !== "ready") return [];
    const results = state.data.results;
    const thresholds: Record<TopVolumeFilterMode, number> = {
      all: 0, "2x": 2, "3x": 3, "5x": 5,
    };
    const min = thresholds[filter];
    return min === 0 ? results : results.filter((s) => s.vol_ratio >= min);
  }, [state, filter]);

  const counts = useMemo(() => {
    if (state.status !== "ready") return { all: 0, "2x": 0, "3x": 0, "5x": 0 };
    const results = state.data.results;
    return {
      all:  results.length,
      "2x": results.filter((s) => s.vol_ratio >= 2).length,
      "3x": results.filter((s) => s.vol_ratio >= 3).length,
      "5x": results.filter((s) => s.vol_ratio >= 5).length,
    };
  }, [state]);

  const isScanning = scanStatus.status === "running";

  return (
    <div className="py-3 space-y-3">
      {/* Header */}
      <div className="panel p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <p className="text-sm tracking-[0.12em] text-dn">TOP VOLUME SURGE</p>
            <span className="tag tag-muted text-[9px]">顶部放量</span>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isScanning}
            className={`btn text-[11px] font-trading shrink-0 ${
              isScanning
                ? "text-muted/40 border-border/30 cursor-not-allowed"
                : "text-muted/70 border-border/60 hover:border-dn/50 hover:text-dn"
            }`}
          >
            {isScanning ? (
              <>
                <span className="inline-block w-3 h-3 border border-border border-t-dn rounded-full animate-spin mr-1.5 align-middle" />
                扫描中…
              </>
            ) : (
              "↺ 刷新"
            )}
          </button>
        </div>

        <p className="text-xs text-muted/60 leading-relaxed">
          价格高于 MA50 且 YTD 为正，近 2 日连续成交量 ≥ 20 日均量 × 1.5x — 识别高位异常放量、潜在主力出货信号。
          市值门槛 ≥ 300M · 均量基准取放量日前 20 日均值
        </p>

        {isScanning && (
          <p className="text-[10px] text-dn/60 mt-1.5 font-trading">
            正在扫描全市场，约需 2–4 分钟，完成后自动刷新…
          </p>
        )}
        {scanStatus.status === "error" && (
          <p className="text-[10px] text-dn/60 mt-1.5 font-trading">
            {scanStatus.error ?? "未知错误"}
          </p>
        )}
      </div>

      {/* Loading */}
      {state.status === "loading" && (
        <div className="panel p-10 text-center">
          <span className="inline-block w-4 h-4 border-2 border-border border-t-dn rounded-full animate-spin mr-2 align-middle" />
          <span className="text-sm text-muted/50">加载筛选结果…</span>
        </div>
      )}

      {/* Error */}
      {state.status === "error" && (
        <div className="panel p-6">
          <p className="text-sm text-dn/80">⚠ 无法加载数据</p>
          <p className="text-xs text-muted/40 mt-1">
            暂无扫描数据，请点击「刷新」触发扫描
          </p>
          <button
            onClick={handleRetry}
            className="btn text-[11px] font-trading mt-3 text-muted/70 border-border/60 hover:border-dn/50 hover:text-dn"
          >
            ↺ 重试
          </button>
        </div>
      )}

      {/* Ready */}
      {state.status === "ready" && (
        <>
          <SummaryStats
            stocks={state.data.results}
            scanDate={state.data.date}
            scanTime={state.data.scan_time}
          />
          <FilterBar active={filter} counts={counts} onChange={setFilter} />

          {filtered.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-muted/40">
              当前筛选条件下无结果
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filtered.map((s) => (
                <StockCard key={s.ticker} stock={s} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
