"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchMA20Screener,
  fetchMA20Status,
  triggerMA20Scan,
} from "@/lib/api/screener";
import type { ScanStatus } from "@/lib/api/screener";
import type { MA20ScreenerResult, MA20Stock } from "@/types";
import SummaryStats from "@/components/screeners/ma20/SummaryStats";
import StockCard    from "@/components/screeners/ma20/StockCard";

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: MA20ScreenerResult };

type TabKey = "up" | "dn";

const POLL_INTERVAL  = 5000;
const MAX_POLL_COUNT = 72;

export default function MA20Page() {
  const [state, setState]           = useState<PageState>({ status: "loading" });
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ status: "idle" });
  const [tab, setTab]               = useState<TabKey>("up");
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
        const s = await fetchMA20Status();
        setScanStatus(s);
        if (s.status === "done") {
          stopPolling();
          const data = await fetchMA20Screener();
          setState({ status: "ready", data });
        } else if (s.status === "error") {
          stopPolling();
        }
      } catch {
        // network hiccup, keep polling
      }
    }, POLL_INTERVAL);
  }, [stopPolling]);

  useEffect(() => {
    fetchMA20Status()
      .then((s) => {
        setScanStatus(s);
        if (s.status === "running") startPolling();
      })
      .catch(() => {});

    fetchMA20Screener()
      .then((data) => {
        setState({ status: "ready", data });
      })
      .catch((e: Error) => setState({ status: "error", message: e.message }));

    return stopPolling;
  }, [startPolling, stopPolling]);

  const handleRefresh = useCallback(async () => {
    setScanStatus({ status: "running" });
    try {
      await triggerMA20Scan();
      startPolling();
    } catch {
      setScanStatus({ status: "error", error: "触发扫描失败，请稍候重试" });
    }
  }, [startPolling]);

  const handleRetry = useCallback(() => {
    setState({ status: "loading" });
    fetchMA20Screener()
      .then((data) => {
        setState({ status: "ready", data });
        setScanStatus({ status: "idle" });
      })
      .catch((e: Error) => setState({ status: "error", message: e.message }));
  }, []);

  const isScanning = scanStatus.status === "running";
  const data: MA20ScreenerResult | null = state.status === "ready" ? state.data : null;
  const stocks: MA20Stock[] = data
    ? (tab === "up" ? data.turning_up : data.turning_dn)
    : [];

  return (
    <div className="py-6 space-y-3">
      {/* Header */}
      <div className="panel p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm tracking-[0.12em] text-gold font-trading">MA20 拐头</p>
            <span className="tag tag-muted text-[9px]">均线转向</span>
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
            ) : "↺ 刷新"}
          </button>
        </div>
        <p className="text-xs text-muted/60 leading-relaxed">
          检测 S&amp;P500 + NASDAQ-100 + 主要 ETF（市值 ≥ 30B）中当日 MA20 发生拐头的标的。
          拐头向上：MA20[今] &gt; MA20[昨] 且 MA20[昨] ≤ MA20[前天]；拐头向下反之。
          每日 16:37 PDT 自动扫描。
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

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border/40">
        {(["up", "dn"] as TabKey[]).map((t) => {
          const isActive = tab === t;
          const activeColor = t === "up" ? "text-bull border-bull" : "text-dn border-dn";
          const count = data ? (t === "up" ? data.turning_up.length : data.turning_dn.length) : null;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-xs font-trading transition-colors border-b-2 ${
                isActive ? activeColor : "text-muted/60 border-transparent hover:text-muted"
              }`}
            >
              {t === "up" ? "拐头向上" : "拐头向下"}
              {count !== null && (
                <span className="ml-1.5 text-[10px] opacity-60">{count}</span>
              )}
            </button>
          );
        })}
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
          <p className="text-sm text-dn/80">无法加载数据</p>
          <p className="text-xs text-muted/40 mt-1">暂无扫描数据，请点击「刷新」触发扫描</p>
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
          <SummaryStats data={data!} activeTab={tab} />

          {stocks.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-muted/40">
              今日无{tab === "up" ? "拐头向上" : "拐头向下"}信号
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {stocks.map((s) => (
                <StockCard key={s.ticker} stock={s} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
