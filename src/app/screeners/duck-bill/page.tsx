"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  fetchDuckScreener,
  fetchDuckStatus,
  triggerDuckScan,
  type ScanStatus,
} from "@/lib/api/screener";
import type { DuckScreenerResult, DuckStock } from "@/types";
import SummaryStats from "@/components/screeners/duck-bill/SummaryStats";
import FilterBar, { type DuckFilterMode } from "@/components/screeners/duck-bill/FilterBar";
import StockCard from "@/components/screeners/duck-bill/StockCard";

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DuckScreenerResult };

const POLL_INTERVAL  = 5000;
const MAX_POLL_COUNT = 72; // 72 × 5s = 6 min timeout

export default function DuckBillPage() {
  const [state, setState]           = useState<PageState>({ status: "loading" });
  const [filter, setFilter]         = useState<DuckFilterMode>("all");
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
        const s = await fetchDuckStatus();
        setScanStatus(s);
        if (s.status === "done") {
          stopPolling();
          try {
            const data = await fetchDuckScreener();
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
    fetchDuckStatus()
      .then((s) => {
        setScanStatus(s);
        if (s.status === "running") startPolling();
      })
      .catch(() => { /* backend not connected */ });

    fetchDuckScreener()
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
      await triggerDuckScan();
      startPolling();
    } catch {
      setScanStatus({ status: "error", error: "后端正在唤醒，请 30 秒后再试" });
    }
  }, [startPolling]);

  // ── Retry ──────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    setState({ status: "loading" });
    fetchDuckScreener()
      .then((data) => {
        setState({ status: "ready", data });
        setScanStatus({ status: "idle" });
      })
      .catch((e: Error) => setState({ status: "error", message: e.message }));
  }, []);

  // ── Derived data ───────────────────────────────────────────────

  const filtered = useMemo<DuckStock[]>(() => {
    if (state.status !== "ready") return [];
    const stocks = state.data.stocks;
    if (filter === "35") return stocks.filter((s) => s.duck.diverge_angle >= 35);
    if (filter === "45") return stocks.filter((s) => s.duck.diverge_angle >= 45);
    return stocks;
  }, [state, filter]);

  const counts = useMemo(() => {
    if (state.status !== "ready") return { all: 0, "35": 0, "45": 0 };
    const stocks = state.data.stocks;
    return {
      all:  stocks.length,
      "35": stocks.filter((s) => s.duck.diverge_angle >= 35).length,
      "45": stocks.filter((s) => s.duck.diverge_angle >= 45).length,
    };
  }, [state]);

  const isScanning = scanStatus.status === "running";

  return (
    <div className="py-3 space-y-3">
      {/* Header */}
      <div className="panel p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <p className="text-sm tracking-[0.12em] text-bull">DUCK BILL</p>
            <span className="tag tag-muted text-[9px]">正鸭嘴形态</span>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isScanning}
            className={`btn text-[11px] font-trading shrink-0 ${
              isScanning
                ? "text-muted/40 border-border/30 cursor-not-allowed"
                : "text-muted/70 border-border/60 hover:border-bull/50 hover:text-bull"
            }`}
          >
            {isScanning ? (
              <>
                <span className="inline-block w-3 h-3 border border-border border-t-bull rounded-full animate-spin mr-1.5 align-middle" />
                扫描中…
              </>
            ) : (
              "↺ 刷新"
            )}
          </button>
        </div>

        <p className="text-xs text-muted/60 leading-relaxed">
          MACD 金叉后 DIFF 超速上穿 DEA 形成正鸭嘴形态，全程在零轴上方，MA5 &gt; MA10 &gt; MA20 多头排列 — 趋势加速初期的强势做多信号。
          最近 ≤ 3 根交易日内完成形态 · 开口角度 &gt; 25° · S&amp;P500 + NASDAQ-100 + 主要 ETF
        </p>

        {isScanning && (
          <p className="text-[10px] text-bull/60 mt-1.5 font-trading">
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
          <span className="inline-block w-4 h-4 border-2 border-border border-t-bull rounded-full animate-spin mr-2 align-middle" />
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
            className="btn text-[11px] font-trading mt-3 text-muted/70 border-border/60 hover:border-bull/50 hover:text-bull"
          >
            ↺ 重试
          </button>
        </div>
      )}

      {/* Ready */}
      {state.status === "ready" && (
        <>
          <SummaryStats stocks={state.data.stocks} scanDate={state.data.date} />
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
