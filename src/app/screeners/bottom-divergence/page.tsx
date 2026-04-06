"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  fetchDivergenceScreener,
  fetchScanStatus,
  triggerScan,
  type ScanStatus,
} from "@/lib/api/screener";
import type { DivergenceScreenerResult, DivergenceStock } from "@/types";
import SummaryStats from "@/components/screeners/bottom-divergence/SummaryStats";
import FilterBar, { type FilterMode } from "@/components/screeners/bottom-divergence/FilterBar";
import StockCard from "@/components/screeners/bottom-divergence/StockCard";

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DivergenceScreenerResult };

const POLL_INTERVAL = 5000;
const MAX_POLL_COUNT = 72; // 72 × 5s = 6 min timeout

export default function BottomDivergencePage() {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [filter, setFilter] = useState<FilterMode>("all");
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ status: "idle" });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

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
      // Timeout after 6 minutes
      if (pollCountRef.current > MAX_POLL_COUNT) {
        stopPolling();
        setScanStatus({ status: "error", error: "扫描超时，请稍候再试" });
        return;
      }
      try {
        const s = await fetchScanStatus();
        setScanStatus(s);
        if (s.status === "done") {
          stopPolling();
          try {
            const data = await fetchDivergenceScreener();
            setState({ status: "ready", data });
          } catch (e: unknown) {
            setState({ status: "error", message: (e as Error).message });
          }
        } else if (s.status === "error") {
          stopPolling();
        }
      } catch {
        // network hiccup — keep polling (Render may still be waking up)
      }
    }, POLL_INTERVAL);
  }, [stopPolling]);

  // ── Initial load ───────────────────────────────────────────────

  useEffect(() => {
    fetchScanStatus()
      .then((s) => {
        setScanStatus(s);
        if (s.status === "running") startPolling();
      })
      .catch(() => { /* backend not connected, ignore */ });

    fetchDivergenceScreener()
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
      await triggerScan();
      startPolling();
    } catch {
      // Render free tier cold start — backend is waking up, don't poll
      setScanStatus({ status: "error", error: "触发扫描失败，请稍候重试" });
    }
  }, [startPolling]);

  // ── Retry data load (for cold-start failures) ──────────────────

  const handleRetry = useCallback(() => {
    setState({ status: "loading" });
    fetchDivergenceScreener()
      .then((data) => {
        setState({ status: "ready", data });
        setScanStatus({ status: "idle" });
      })
      .catch((e: Error) => setState({ status: "error", message: e.message }));
  }, []);

  // ── Derived data ───────────────────────────────────────────────

  const filtered = useMemo<DivergenceStock[]>(() => {
    if (state.status !== "ready") return [];
    const stocks = state.data.stocks;
    if (filter === "all")  return stocks;
    if (filter === "both") return stocks.filter((s) => s.triggered.length === 2);
    return stocks.filter(
      (s) => s.triggered.length === 1 && s.triggered[0] === filter
    );
  }, [state, filter]);

  const counts = useMemo(() => {
    if (state.status !== "ready") return { all: 0, both: 0, MACD: 0, RSI: 0 };
    const stocks = state.data.stocks;
    return {
      all:  stocks.length,
      both: stocks.filter((s) => s.triggered.length === 2).length,
      MACD: stocks.filter((s) => s.triggered.length === 1 && s.triggered[0] === "MACD").length,
      RSI:  stocks.filter((s) => s.triggered.length === 1 && s.triggered[0] === "RSI").length,
    };
  }, [state]);

  const isScanning = scanStatus.status === "running";

  return (
    <div className="py-6 space-y-3">
      {/* Header */}
      <div className="panel p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <p className="text-sm tracking-[0.12em] text-gold">BOTTOM DIVERGENCE</p>
            <span className="tag tag-muted text-[9px]">MACD / RSI 底背离</span>
          </div>

          {/* Refresh button */}
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
          价格创新低而动量指标不创新低 — 捕捉 S&amp;P500 + NASDAQ-100 + 主要 ETF 中的潜在底部反转信号。
          MACD 两底间隔 20–100 根 · 绿柱缩短 ≥ 20% · RSI 两底间隔 10–30 根 · 第二底 RSI &lt; 35
        </p>

        {/* Scan status hint */}
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

      {/* Error — with retry button */}
      {state.status === "error" && (
        <div className="panel p-6">
          <p className="text-sm text-dn/80">⚠ 无法加载数据</p>
          <p className="text-xs text-muted/40 mt-1">
            暂无扫描数据，请点击「刷新」触发扫描
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
          <SummaryStats stocks={state.data.stocks} scanDate={state.data.date} scanTime={state.data.scan_time} />
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
