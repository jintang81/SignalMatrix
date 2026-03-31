"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  fetchVolumeSurgeScreener,
  fetchVolumeSurgeStatus,
  triggerVolumeScan,
  type ScanStatus,
} from "@/lib/api/screener";
import type { VolumeSurgeScreenerResult, VolumeSurgeStock } from "@/types";
import SummaryStats from "@/components/screeners/bottom-volume-surge/SummaryStats";
import FilterBar, { type VolumeFilterMode } from "@/components/screeners/bottom-volume-surge/FilterBar";
import StockCard from "@/components/screeners/bottom-volume-surge/StockCard";

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: VolumeSurgeScreenerResult };

const POLL_INTERVAL  = 5000;
const MAX_POLL_COUNT = 72; // 72 × 5s = 6 min timeout

export default function BottomVolumeSurgePage() {
  const [state, setState]           = useState<PageState>({ status: "loading" });
  const [filter, setFilter]         = useState<VolumeFilterMode>("all");
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ status: "idle" });
  const pollingRef                  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef                = useRef(0);

  // ── Polling helpers ────────────────────────────────────────────

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
        const s = await fetchVolumeSurgeStatus();
        setScanStatus(s);
        if (s.status === "done") {
          stopPolling();
          try {
            const data = await fetchVolumeSurgeScreener();
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

  // ── Initial load ───────────────────────────────────────────────

  useEffect(() => {
    fetchVolumeSurgeStatus()
      .then((s) => {
        setScanStatus(s);
        if (s.status === "running") startPolling();
      })
      .catch(() => { /* backend not connected */ });

    fetchVolumeSurgeScreener()
      .then((data) => {
        setState({ status: "ready", data });
        setScanStatus((prev) => (prev.status === "error" ? { status: "idle" } : prev));
      })
      .catch((e: Error) => setState({ status: "error", message: e.message }));

    return stopPolling;
  }, [startPolling, stopPolling]);

  // ── Refresh handler ────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setScanStatus({ status: "running" });
    try {
      await triggerVolumeScan();
      startPolling();
    } catch {
      setScanStatus({ status: "error", error: "后端正在唤醒，请 30 秒后再试" });
    }
  }, [startPolling]);

  // ── Retry ──────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    setState({ status: "loading" });
    fetchVolumeSurgeScreener()
      .then((data) => {
        setState({ status: "ready", data });
        setScanStatus({ status: "idle" });
      })
      .catch((e: Error) => setState({ status: "error", message: e.message }));
  }, []);

  // ── Derived data ───────────────────────────────────────────────

  const filtered = useMemo<VolumeSurgeStock[]>(() => {
    if (state.status !== "ready") return [];
    const results = state.data.results;
    const thresholds: Record<VolumeFilterMode, number> = {
      all: 0,
      "2x": 2,
      "3x": 3,
      "5x": 5,
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
            <p className="text-sm tracking-[0.12em] text-gold">BOTTOM VOLUME SURGE</p>
            <span className="tag tag-muted text-[9px]">底部放量</span>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isScanning}
            className={`btn text-[11px] font-trading shrink-0 ${
              isScanning
                ? "text-muted/40 border-border/30 cursor-not-allowed"
                : "text-muted/70 border-border/60 hover:border-gold/50 hover:text-gold"
            }`}
          >
            {isScanning ? (
              <>
                <span className="inline-block w-3 h-3 border border-border border-t-gold rounded-full animate-spin mr-1.5 align-middle" />
                扫描中…
              </>
            ) : (
              "↺ 刷新"
            )}
          </button>
        </div>

        <p className="text-xs text-muted/60 leading-relaxed">
          价格低于 MA50 且 YTD 为负，近 2 日连续成交量 ≥ 20 日均量 × 1.5x — 识别 S&amp;P500 + NASDAQ-100 + 主要 ETF 中的底部异常放量信号。
          市值门槛 ≥ 5B · 均量基准取放量日前 20 日均值
        </p>

        {isScanning && (
          <p className="text-[10px] text-gold/60 mt-1.5 font-trading">
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
          <span className="inline-block w-4 h-4 border-2 border-border border-t-gold rounded-full animate-spin mr-2 align-middle" />
          <span className="text-sm text-muted/50">加载筛选结果…</span>
        </div>
      )}

      {/* Error */}
      {state.status === "error" && (
        <div className="panel p-6">
          <p className="text-sm text-dn/80">⚠ 无法加载数据</p>
          <p className="text-xs text-muted/40 mt-1">
            后端可能正在唤醒（Render 免费版冷启动约需 30 秒），请稍候重试
          </p>
          <button
            onClick={handleRetry}
            className="btn text-[11px] font-trading mt-3 text-muted/70 border-border/60 hover:border-gold/50 hover:text-gold"
          >
            ↺ 重试
          </button>
        </div>
      )}

      {/* Ready */}
      {state.status === "ready" && (
        <>
          <SummaryStats stocks={state.data.results} scanDate={state.data.date} scanTime={state.data.scan_time} />
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
