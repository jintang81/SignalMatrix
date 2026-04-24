"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchOvernightScreener,
  fetchOvernightStatus,
  triggerOvernightScan,
  type ScanStatus,
} from "@/lib/api/screener";
import type { OvernightScreenerResult } from "@/types";
import MarketEnvBadge from "@/components/screeners/overnight/MarketEnvBadge";
import OvernightCard   from "@/components/screeners/overnight/OvernightCard";
import ExitAnalysis    from "@/components/screeners/overnight/ExitAnalysis";
import BacktestTab     from "@/components/screeners/overnight/BacktestTab";

// ─── Types ────────────────────────────────────────────────────────

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: OvernightScreenerResult };

type TabKey = "entry" | "exit" | "backtest";

const POLL_INTERVAL  = 5000;
const MAX_POLL_COUNT = 72;  // 72 × 5 s = 6 min

// ─── localStorage key for holdings ────────────────────────────────

function holdingsKey(date: string) {
  return `overnight-holdings-${date}`;
}

// ─── Page ─────────────────────────────────────────────────────────

export default function OvernightPage() {
  const [state, setState]           = useState<PageState>({ status: "loading" });
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ status: "idle" });
  const [tab, setTab]               = useState<TabKey>("entry");
  const [boughtMap, setBoughtMap]   = useState<Record<string, boolean>>({});

  const pollingRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  // ── Polling ────────────────────────────────────────────────────

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
        const s = await fetchOvernightStatus();
        setScanStatus(s);
        if (s.status === "done") {
          stopPolling();
          const data = await fetchOvernightScreener();
          setState({ status: "ready", data });
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
    fetchOvernightStatus()
      .then((s) => {
        setScanStatus(s);
        if (s.status === "running") startPolling();
      })
      .catch(() => { /* backend not reachable */ });

    fetchOvernightScreener()
      .then((data) => {
        setState({ status: "ready", data });
        setScanStatus((prev) => (prev.status === "error" ? { status: "idle" } : prev));

        // Restore holdings from localStorage
        const saved = localStorage.getItem(holdingsKey(data.date));
        if (saved) {
          try { setBoughtMap(JSON.parse(saved)); } catch { /* ignore */ }
        }
      })
      .catch((e: Error) => setState({ status: "error", message: e.message }));

    return stopPolling;
  }, [startPolling, stopPolling]);

  // ── Refresh ────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setScanStatus({ status: "running" });
    try {
      await triggerOvernightScan();
      startPolling();
    } catch {
      setScanStatus({ status: "error", error: "触发扫描失败，请稍候重试" });
    }
  }, [startPolling]);

  const handleRetry = useCallback(() => {
    setState({ status: "loading" });
    fetchOvernightScreener()
      .then((data) => {
        setState({ status: "ready", data });
        setScanStatus({ status: "idle" });
      })
      .catch((e: Error) => setState({ status: "error", message: e.message }));
  }, []);

  // ── Holdings toggle ────────────────────────────────────────────

  const handleToggleBought = useCallback(
    (ticker: string) => {
      setBoughtMap((prev) => {
        const next = { ...prev, [ticker]: !prev[ticker] };
        if (state.status === "ready") {
          localStorage.setItem(holdingsKey(state.data.date), JSON.stringify(next));
        }
        return next;
      });
    },
    [state],
  );

  const isScanning = scanStatus.status === "running";
  const data = state.status === "ready" ? state.data : null;

  return (
    <div className="py-6 space-y-3">
      {/* ── Header ── */}
      <div className="panel p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm tracking-[0.12em] text-gold">OVERNIGHT ARBI</p>
            <span className="tag tag-gold text-[9px]">隔夜套利选股</span>
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
          3:40 PM EST 自动扫描盘中涨幅 3–5%、量比 &gt; 1、换手率 &gt; 0.5%、股价站上 VWAP，
          过去 20 日内有 &gt; 5% 单日涨幅的强势股 — 隔夜持仓，次日早盘出货。
          仅适用于牛市（指数站上短期均线）且次日无高波动事件。
        </p>

        {isScanning && (
          <p className="text-[10px] text-gold/60 mt-1.5 font-trading">
            正在扫描全市场（S&amp;P 500 + NASDAQ-100），约需 3–5 分钟，完成后自动刷新…
          </p>
        )}
        {scanStatus.status === "error" && (
          <p className="text-[10px] text-dn/60 mt-1.5 font-trading">
            {scanStatus.error ?? "未知错误"}
          </p>
        )}
      </div>

      {/* ── Tab bar (always visible) ── */}
      <div className="flex gap-1 border-b border-border/40">
        {(["entry", "exit", "backtest"] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-trading transition-colors ${
              tab === t
                ? "text-gold border-b-2 border-gold"
                : "text-muted/60 hover:text-muted"
            }`}
          >
            {t === "entry" ? "今日选股" : t === "exit" ? "次日监控" : "回测分析"}
          </button>
        ))}
      </div>

      {/* ── Backtest tab (independent of screener data) ── */}
      {tab === "backtest" && <BacktestTab />}

      {/* ── Screener data tabs (entry / exit) ── */}
      {tab !== "backtest" && (
        <>
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
                暂无扫描数据，请点击「刷新」触发扫描（仅在工作日 3:40 PM EST 后有数据）
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
          {state.status === "ready" && data && (
            <>
              {/* Market environment */}
              <MarketEnvBadge env={data.market_env} />

              {/* Summary stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    label: "筛选结果",
                    value: data.stocks.length,
                    sub: `扫描日期 ${data.date}`,
                    time: data.scan_time,
                    accent: "var(--color-gold)",
                  },
                  {
                    label: "大盘环境",
                    value: data.market_env.suitable ? "适合" : "谨慎",
                    sub: data.market_env.signal === "bull" ? "SPX 站上 20 日均线" : "SPX 跌破 20 日均线",
                    accent: data.market_env.suitable ? "var(--color-bull)" : "var(--color-bear)",
                  },
                  {
                    label: "VWAP 确认",
                    value: data.stocks.filter((s) => s.above_vwap === true).length,
                    sub: "价格站上分时 VWAP",
                    accent: "var(--color-up)",
                  },
                  {
                    label: "换手率完整",
                    value: data.stocks.filter((s) => s.turnover_rate !== null).length,
                    sub: "含流通股数据",
                    accent: "#a78bfa",
                  },
                ].map((item) => (
                  <div key={item.label} className="panel p-4 relative overflow-hidden">
                    <div
                      className="absolute top-0 left-0 right-0 h-[2px]"
                      style={{ background: item.accent }}
                    />
                    <p className="text-[10px] tracking-widest text-muted/60 uppercase mb-2 font-trading">
                      {item.label}
                    </p>
                    <p className="text-3xl font-bold text-txt leading-none mb-1 font-trading">
                      {item.value}
                    </p>
                    <p className="text-[10px] text-muted/50 font-trading">{item.sub}</p>
                    {"time" in item && item.time && (
                      <p className="text-[10px] text-muted/40 font-trading">{item.time}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Entry tab */}
              {tab === "entry" && (
                <>
                  {data.stocks.length === 0 ? (
                    <div className="panel p-10 text-center text-sm text-muted/40">
                      今日暂无符合条件的股票
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {data.stocks.map((s) => (
                        <OvernightCard key={s.ticker} stock={s} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Exit tab */}
              {tab === "exit" && (
                <ExitAnalysis
                  stocks={data.stocks}
                  boughtMap={boughtMap}
                  onToggleBought={handleToggleBought}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
