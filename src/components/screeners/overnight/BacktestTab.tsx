"use client";

import { useState, useCallback, useRef } from "react";
import {
  fetchOvernightBacktest,
  fetchOvernightBacktestStatus,
  triggerOvernightBacktest,
} from "@/lib/api/screener";
import type { OvernightBacktestResult, BacktestDay } from "@/types";

const POLL_INTERVAL  = 5000;
const MAX_POLL_COUNT = 36; // 36 × 5s = 3 min

// ─── Day row (expandable) ─────────────────────────────────────────

function DayRow({ day }: { day: BacktestDay }) {
  const [open, setOpen] = useState(false);
  const isGood = day.avg_return >= 0;

  return (
    <div className="border border-border/40 rounded overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-bg-3/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-trading text-muted/80">{day.date}</span>
          <span className="text-[10px] text-muted/50">{day.count} 只</span>
          <span
            className="text-[10px] font-trading"
            style={{ color: day.win_rate >= 50 ? "var(--color-bull)" : "var(--color-bear)" }}
          >
            胜率 {day.win_rate}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-[11px] font-trading font-medium"
            style={{ color: isGood ? "var(--color-up)" : "var(--color-dn)" }}
          >
            {day.avg_return >= 0 ? "+" : ""}{day.avg_return}%
          </span>
          <span className="text-muted/30 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-border/30">
          <table className="w-full text-[10px] font-trading">
            <thead>
              <tr className="border-b border-border/20">
                <th className="text-left px-4 py-1.5 text-muted/50 font-normal">代码</th>
                <th className="text-right px-4 py-1.5 text-muted/50 font-normal">入场收盘</th>
                <th className="text-right px-4 py-1.5 text-muted/50 font-normal">次日开盘</th>
                <th className="text-right px-4 py-1.5 text-muted/50 font-normal">涨幅</th>
                <th className="text-right px-4 py-1.5 text-muted/50 font-normal">量比</th>
                <th className="text-right px-4 py-1.5 text-muted/50 font-normal">隔夜收益</th>
              </tr>
            </thead>
            <tbody>
              {day.trades.map((t) => {
                const ret = t.overnight_return;
                const color = ret > 0 ? "var(--color-up)" : ret < 0 ? "var(--color-dn)" : "var(--color-muted)";
                return (
                  <tr key={`${t.ticker}-${t.date}`} className="border-b border-border/10 last:border-0 hover:bg-bg-3/30">
                    <td className="px-4 py-1.5 text-gold font-medium">{t.ticker}</td>
                    <td className="px-4 py-1.5 text-right text-txt/70">${t.entry_close.toFixed(2)}</td>
                    <td className="px-4 py-1.5 text-right text-txt/70">${t.exit_open.toFixed(2)}</td>
                    <td className="px-4 py-1.5 text-right text-up">+{t.pct_change.toFixed(2)}%</td>
                    <td className="px-4 py-1.5 text-right text-muted/70">{t.vol_ratio.toFixed(2)}x</td>
                    <td className="px-4 py-1.5 text-right font-medium" style={{ color }}>
                      {ret > 0 ? "+" : ""}{ret.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────

export default function BacktestTab() {
  const [result, setResult]   = useState<OvernightBacktestResult | null>(null);
  const [phase, setPhase]     = useState<"idle" | "running" | "done" | "error">("idle");
  const [errMsg, setErrMsg]   = useState("");
  const pollingRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef          = useRef(0);

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
        setPhase("error");
        setErrMsg("回测超时，请稍候重试");
        return;
      }
      try {
        const s = await fetchOvernightBacktestStatus();
        if (s.status === "done") {
          stopPolling();
          const data = await fetchOvernightBacktest();
          setResult(data);
          setPhase("done");
        } else if (s.status === "error") {
          stopPolling();
          setPhase("error");
          setErrMsg("回测失败，请重试");
        }
      } catch { /* keep polling */ }
    }, POLL_INTERVAL);
  }, [stopPolling]);

  const handleRun = useCallback(async () => {
    setPhase("running");
    setErrMsg("");
    try {
      await triggerOvernightBacktest();
      startPolling();
    } catch {
      setPhase("error");
      setErrMsg("触发回测失败，请稍候重试");
    }
  }, [startPolling]);

  const s = result?.summary;

  return (
    <div className="space-y-4">
      {/* ── Header row ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] text-muted/60 leading-relaxed">
            基于 <span className="text-gold/80">C1+C2+C3</span> 条件回测过去 20 个交易日，
            入场价 = 当日收盘，出场价 = 次日开盘。
          </p>
          <p className="text-[10px] text-muted/40 mt-0.5">
            ⚠ 未过滤 VWAP 和换手率，结果偏乐观。约需 60-90 秒。
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={phase === "running"}
          className={`btn text-[11px] font-trading shrink-0 ${
            phase === "running"
              ? "text-muted/40 border-border/30 cursor-not-allowed"
              : "text-muted/70 border-border/60 hover:border-gold/50 hover:text-gold"
          }`}
        >
          {phase === "running" ? (
            <>
              <span className="inline-block w-3 h-3 border border-border border-t-gold rounded-full animate-spin mr-1.5 align-middle" />
              回测中…
            </>
          ) : result ? "↺ 重新运行" : "▶ 运行回测"}
        </button>
      </div>

      {/* ── Error ── */}
      {phase === "error" && (
        <div className="panel p-4">
          <p className="text-xs text-dn/80">⚠ {errMsg}</p>
        </div>
      )}

      {/* ── Running placeholder ── */}
      {phase === "running" && !result && (
        <div className="panel p-10 text-center">
          <span className="inline-block w-4 h-4 border-2 border-border border-t-gold rounded-full animate-spin mr-2 align-middle" />
          <span className="text-sm text-muted/50">正在扫描全市场历史数据…</span>
          <p className="text-[10px] text-muted/30 mt-2">约需 60-90 秒</p>
        </div>
      )}

      {/* ── Results ── */}
      {result && s && (
        <>
          {/* Meta info */}
          <p className="text-[10px] text-muted/40 font-trading">
            计算于 {result.computed_at} · 覆盖 {result.backtest_days} 个交易日
          </p>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: "总信号次数",
                value: s.total_trades,
                sub: `${result.backtest_days} 个交易日`,
                accent: "var(--color-gold)",
              },
              {
                label: "胜率",
                value: `${s.win_rate}%`,
                sub: `${s.win_count}胜 / ${s.loss_count}负`,
                accent: s.win_rate >= 50 ? "var(--color-bull)" : "var(--color-bear)",
              },
              {
                label: "平均隔夜收益",
                value: `${s.avg_return >= 0 ? "+" : ""}${s.avg_return}%`,
                sub: `盈 +${s.avg_win}% / 亏 ${s.avg_loss}%`,
                accent: s.avg_return >= 0 ? "var(--color-up)" : "var(--color-dn)",
              },
              {
                label: "最佳 / 最差",
                value: s.best_trade ? `+${s.best_trade.overnight_return}%` : "–",
                sub: s.worst_trade
                  ? `最差 ${s.worst_trade.overnight_return}% (${s.worst_trade.ticker})`
                  : "–",
                accent: "var(--color-up)",
              },
            ].map((item) => (
              <div key={item.label} className="panel p-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: item.accent }} />
                <p className="text-[10px] tracking-widest text-muted/60 uppercase mb-2 font-trading">{item.label}</p>
                <p className="text-2xl font-bold text-txt leading-none mb-1 font-trading" style={{ color: item.accent }}>
                  {item.value}
                </p>
                <p className="text-[10px] text-muted/50 font-trading">{item.sub}</p>
              </div>
            ))}
          </div>

          {/* Best / Worst highlight */}
          {(s.best_trade || s.worst_trade) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {s.best_trade && (
                <div className="panel p-3 border-l-2 border-up">
                  <p className="text-[10px] text-muted/50 mb-1">最佳交易</p>
                  <p className="text-sm font-trading text-up font-bold">
                    +{s.best_trade.overnight_return}% — {s.best_trade.ticker}
                  </p>
                  <p className="text-[10px] text-muted/50 mt-0.5">
                    {s.best_trade.date} · 入场 ${s.best_trade.entry_close} → 开盘 ${s.best_trade.exit_open}
                  </p>
                </div>
              )}
              {s.worst_trade && (
                <div className="panel p-3 border-l-2 border-dn">
                  <p className="text-[10px] text-muted/50 mb-1">最差交易</p>
                  <p className="text-sm font-trading text-dn font-bold">
                    {s.worst_trade.overnight_return}% — {s.worst_trade.ticker}
                  </p>
                  <p className="text-[10px] text-muted/50 mt-0.5">
                    {s.worst_trade.date} · 入场 ${s.worst_trade.entry_close} → 开盘 ${s.worst_trade.exit_open}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Per-day list */}
          <div className="space-y-2">
            <p className="text-[10px] text-muted/50 tracking-widest font-trading uppercase">逐日明细（点击展开）</p>
            {[...result.days].reverse().map((day) => (
              <DayRow key={day.date} day={day} />
            ))}
          </div>
        </>
      )}

      {/* ── Idle state: no result yet ── */}
      {phase === "idle" && !result && (
        <div className="panel p-10 text-center">
          <p className="text-sm text-muted/40">点击「▶ 运行回测」开始计算</p>
          <p className="text-[10px] text-muted/30 mt-1">约扫描 600 只股票 × 120 天历史数据，需 60-90 秒</p>
        </div>
      )}
    </div>
  );
}
