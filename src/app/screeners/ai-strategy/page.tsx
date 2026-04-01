"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchAIStrategy,
  fetchAIStrategyStatus,
  triggerAIStrategy,
} from "@/lib/api/screener";
import type {
  AIStrategyResult,
  AIStrategyEnvironment,
  AIStrategyRiskLevel,
} from "@/types";

// ─── Constants ────────────────────────────────────────────────────

const SCREENER_LABELS: Record<string, { label: string; href: string }> = {
  "bottom-divergence":   { label: "底背离",    href: "/screeners/bottom-divergence" },
  "bottom-volume-surge": { label: "底部放量",  href: "/screeners/bottom-volume-surge" },
  "duck-bill":           { label: "正鸭嘴",    href: "/screeners/duck-bill" },
  "top-divergence":      { label: "顶背离",    href: "/screeners/top-divergence" },
  "top-volume-surge":    { label: "顶部放量",  href: "/screeners/top-volume-surge" },
  "unusual-options":     { label: "异常期权",  href: "/screeners/unusual-options" },
};

const ENV_CONFIG: Record<AIStrategyEnvironment, {
  label: string; labelZh: string;
  color: string; bg: string; border: string;
}> = {
  BULL:    { label: "BULL MARKET",    labelZh: "多头市场",  color: "#00e676", bg: "rgba(0,230,118,0.07)",  border: "rgba(0,230,118,0.25)"  },
  BEAR:    { label: "BEAR MARKET",    labelZh: "空头市场",  color: "#ff1744", bg: "rgba(255,23,68,0.07)",   border: "rgba(255,23,68,0.25)"   },
  NEUTRAL: { label: "NEUTRAL MARKET", labelZh: "中性震荡",  color: "#c9a84c", bg: "rgba(201,168,76,0.07)",  border: "rgba(201,168,76,0.25)"  },
  CHOPPY:  { label: "CHOPPY MARKET",  labelZh: "震荡行情",  color: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.20)" },
};

const RISK_CONFIG: Record<AIStrategyRiskLevel, { label: string; color: string; bars: number }> = {
  LOW:     { label: "LOW",     color: "#00e676", bars: 1 },
  MEDIUM:  { label: "MEDIUM",  color: "#c9a84c", bars: 2 },
  HIGH:    { label: "HIGH",    color: "#ef5350", bars: 3 },
  EXTREME: { label: "EXTREME", color: "#ff1744", bars: 4 },
};

// ─── Sub-components ───────────────────────────────────────────────

function MetricCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="panel p-3 flex flex-col gap-1">
      <p className="text-[10px] text-muted/50 tracking-widest">{label}</p>
      <p className="text-lg font-trading leading-none" style={{ color: color ?? "#e2e8f0" }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted/50">{sub}</p>}
    </div>
  );
}

function RiskGauge({ level }: { level: AIStrategyRiskLevel }) {
  const cfg = RISK_CONFIG[level];
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-4 rounded-sm transition-all"
            style={{
              height: 6 + i * 4,
              background: i <= cfg.bars ? cfg.color : "rgba(148,163,184,0.15)",
            }}
          />
        ))}
      </div>
      <span className="text-[11px] font-trading" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  );
}

function SectorGrid({ sectors }: { sectors: AIStrategyResult["sectors"] }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-4 gap-1.5">
      {Object.entries(sectors).map(([tk, s]) => {
        const c5 = s.change_5d;
        const color = c5 > 1 ? "#00e676" : c5 < -1 ? "#ef5350" : "#94a3b8";
        const bg    = c5 > 1 ? "rgba(0,230,118,0.07)" : c5 < -1 ? "rgba(239,83,80,0.07)" : "rgba(148,163,184,0.05)";
        return (
          <div
            key={tk}
            className="rounded p-2 text-center"
            style={{ background: bg, border: `1px solid ${color}30` }}
          >
            <p className="text-[10px] font-trading text-muted/70">{tk}</p>
            <p className="text-[9px] text-muted/40 font-chinese">{s.name}</p>
            <p className="text-[11px] font-trading mt-0.5" style={{ color }}>
              {c5 >= 0 ? "+" : ""}{c5.toFixed(1)}%
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "#00e676" : pct >= 45 ? "#c9a84c" : "#94a3b8";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-border/40 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-trading text-muted/60">{pct}%</span>
    </div>
  );
}

// ─── Page State ───────────────────────────────────────────────────

type PageState =
  | { phase: "idle" }
  | { phase: "loading" }        // initial fetch
  | { phase: "generating" }     // polling after trigger
  | { phase: "ready"; data: AIStrategyResult }
  | { phase: "error"; msg: string };

const POLL_INTERVAL = 2000;
const MAX_POLLS = 60;

// ─── Page ─────────────────────────────────────────────────────────

export default function AIStrategyPage() {
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // Initial load: try to get cached result
  useEffect(() => {
    fetchAIStrategy()
      .then((data) => setState({ phase: "ready", data }))
      .catch(() => setState({ phase: "idle" }));
    return () => stopPoll();
  }, []);

  // Poll after trigger
  const startPolling = useCallback(() => {
    pollCount.current = 0;
    stopPoll();
    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        stopPoll();
        setState({ phase: "error", msg: "生成超时，请重试" });
        return;
      }
      const status = await fetchAIStrategyStatus().catch(() => ({ status: "error" as const }));
      if (status.status === "done") {
        stopPoll();
        const data = await fetchAIStrategy().catch(() => null);
        if (data) setState({ phase: "ready", data });
        else setState({ phase: "error", msg: "数据读取失败，请刷新" });
      } else if (status.status === "error") {
        stopPoll();
        setState({ phase: "error", msg: (status as { error?: string }).error ?? "生成失败" });
      }
    }, POLL_INTERVAL);
  }, []);

  const handleGenerate = useCallback(async () => {
    try {
      setState({ phase: "generating" });
      await triggerAIStrategy();
      startPolling();
    } catch (e) {
      setState({ phase: "error", msg: String(e) });
    }
  }, [startPolling]);

  // ── Loading skeleton ──────────────────────────────────────────
  if (state.phase === "loading") {
    return (
      <div className="py-3 space-y-3 min-h-[calc(100dvh-3.5rem)] animate-pulse">
        <div className="panel h-28" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="panel h-16" />)}
        </div>
        <div className="panel h-32" />
        <div className="panel h-48" />
      </div>
    );
  }

  // ── Generating state ──────────────────────────────────────────
  if (state.phase === "generating") {
    return (
      <div className="py-3 min-h-[calc(100dvh-3.5rem)] flex flex-col items-center justify-center gap-6">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-gold text-[11px] tracking-widest">◈ AI STRATEGY</span>
          </div>
          {/* Animated orb */}
          <div className="relative w-16 h-16 mx-auto">
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ background: "radial-gradient(circle, #c9a84c, transparent)" }}
            />
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl"
              style={{ background: "radial-gradient(circle at 40% 40%, #1c2535, #0c0f18)", border: "1px solid #c9a84c40" }}
            >
              ◈
            </div>
          </div>
          <p className="text-sm font-trading text-gold">GENERATING STRATEGY</p>
          <p className="text-xs text-muted/50 font-chinese">
            Claude claude-opus-4-6 正在分析市场数据，请稍候…
          </p>
          <p className="text-[10px] text-muted/30">通常需要 15–30 秒</p>
        </div>
      </div>
    );
  }

  // ── Idle state (no cached result) ─────────────────────────────
  if (state.phase === "idle" || state.phase === "error") {
    return (
      <div className="py-3 min-h-[calc(100dvh-3.5rem)] flex flex-col items-center justify-center gap-6">
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-[11px] tracking-widest text-gold">◈ AI STRATEGY</p>
          <p className="text-xs text-muted/60 font-chinese">
            {state.phase === "error"
              ? state.msg
              : "点击下方按钮，让 Claude AI 分析当前市场环境并生成操盘策略简报。"}
          </p>
          <button
            onClick={handleGenerate}
            className="btn text-xs px-5 py-2 mt-2"
          >
            ◈ 生成 AI 策略简报 →
          </button>
        </div>
      </div>
    );
  }

  // ── Ready state ───────────────────────────────────────────────
  const { data } = state;
  const env = ENV_CONFIG[data.environment];
  const m   = data.market_metrics;

  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  const fmtPx  = (v: number) => `$${v.toFixed(2)}`;

  return (
    <div className="py-3 space-y-3 min-h-[calc(100dvh-3.5rem)]">

      {/* ── Environment Banner ───────────────────────────────── */}
      <div
        className="panel p-5"
        style={{ background: env.bg, borderColor: env.border }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-[10px] tracking-widest text-muted/40">◈ AI STRATEGY</span>
              <span className="tag text-[9px]" style={{ color: env.color, borderColor: env.border, background: env.bg }}>
                {data.scan_time ?? ""}
              </span>
            </div>
            <h1 className="text-2xl font-trading tracking-[0.1em]" style={{ color: env.color }}>
              {env.label}
            </h1>
            <p className="text-xs text-muted/50 font-chinese">{env.labelZh}</p>
            <div className="flex items-center gap-3 mt-2">
              <div className="space-y-1">
                <p className="text-[9px] text-muted/40 tracking-widest">AI CONFIDENCE</p>
                <ConfidenceBar value={data.confidence} />
              </div>
              <div className="space-y-1 ml-4">
                <p className="text-[9px] text-muted/40 tracking-widest">RISK LEVEL</p>
                <RiskGauge level={data.risk_level} />
              </div>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            className="text-[10px] tracking-widest border px-3 py-1.5 rounded transition-all hover:bg-gold/10"
            style={{ borderColor: "#c9a84c40", color: "#c9a84c" }}
          >
            ↺ 重新生成
          </button>
        </div>
      </div>

      {/* ── Market Metrics Row ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          label="SPY"
          value={fmtPx(m.spy_price)}
          sub={`1D ${fmtPct(m.spy_change_1d)}  ·  5D ${fmtPct(m.spy_change_5d)}`}
          color={m.spy_change_1d >= 0 ? "#26a69a" : "#ef5350"}
        />
        <MetricCard
          label="QQQ"
          value={fmtPx(m.qqq_price)}
          sub={`1D ${fmtPct(m.qqq_change_1d)}  ·  5D ${fmtPct(m.qqq_change_5d)}`}
          color={m.qqq_change_1d >= 0 ? "#26a69a" : "#ef5350"}
        />
        <MetricCard
          label="VIX"
          value={m.vix.toFixed(1)}
          sub={`1D ${fmtPct(m.vix_change_1d)}`}
          color={m.vix >= 30 ? "#ff1744" : m.vix >= 20 ? "#ef5350" : "#26a69a"}
        />
        <MetricCard
          label="IWM  5D"
          value={fmtPct(m.iwm_change_5d)}
          sub={`vs SPY: ${fmtPct(m.iwm_change_5d - m.spy_change_5d)}`}
          color={m.iwm_change_5d >= 0 ? "#26a69a" : "#ef5350"}
        />
      </div>

      {/* ── SPY vs MA ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="SPY VS MA50"
          value={fmtPct(m.spy_vs_ma50)}
          sub={m.spy_vs_ma50 >= 0 ? "均线上方 ↑" : "均线下方 ↓"}
          color={m.spy_vs_ma50 >= 0 ? "#26a69a" : "#ef5350"}
        />
        <MetricCard
          label="SPY VS MA200"
          value={fmtPct(m.spy_vs_ma200)}
          sub={m.spy_vs_ma200 >= 0 ? "长线牛市结构" : "长线空头区域"}
          color={m.spy_vs_ma200 >= 0 ? "#26a69a" : "#ef5350"}
        />
      </div>

      {/* ── AI Summary ───────────────────────────────────────── */}
      <div className="panel p-4 space-y-2">
        <p className="text-[10px] tracking-widest text-gold/60">◈ AI SUMMARY</p>
        <p className="text-sm text-txt/80 font-chinese leading-relaxed">
          {data.summary}
        </p>
      </div>

      {/* ── Recommended Screeners + Key Levels ───────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Recommended */}
        <div className="panel p-4 space-y-3">
          <p className="text-[10px] tracking-widest text-gold/60">◈ 今日推荐筛选器</p>
          <div className="space-y-2">
            {data.recommended_screeners.map((id, i) => {
              const s = SCREENER_LABELS[id];
              if (!s) return null;
              return (
                <Link
                  key={id}
                  href={s.href}
                  className="flex items-center justify-between p-2.5 rounded transition-all hover:-translate-y-0.5"
                  style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.18)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gold/50 font-trading w-4">0{i + 1}</span>
                    <span className="text-xs font-chinese text-txt/80">{s.label}</span>
                  </div>
                  <span className="text-gold/50 text-xs">→</span>
                </Link>
              );
            })}
          </div>
          {data.avoid_screeners.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] tracking-widest text-muted/30">当前避免</p>
              <div className="flex flex-wrap gap-1.5">
                {data.avoid_screeners.map((id) => {
                  const s = SCREENER_LABELS[id];
                  return s ? (
                    <span key={id} className="tag tag-muted text-[9px] opacity-50">
                      {s.label}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>

        {/* Key Levels */}
        <div className="panel p-4 space-y-3">
          <p className="text-[10px] tracking-widest text-gold/60">◈ 关键价位</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-border/30">
              <span className="text-[11px] text-muted/60">SPY 支撑位</span>
              <span className="text-sm font-trading text-up">
                ${data.key_levels.spy_support.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/30">
              <span className="text-[11px] text-muted/60">SPY 压力位</span>
              <span className="text-sm font-trading text-dn">
                ${data.key_levels.spy_resistance.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-[11px] text-muted/60">VIX 警戒线</span>
              <span className="text-sm font-trading text-gold">
                {data.key_levels.vix_warning.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sector Heatmap ──────────────────────────────────── */}
      {Object.keys(data.sectors).length > 0 && (
        <div className="panel p-4 space-y-3">
          <p className="text-[10px] tracking-widest text-gold/60">◈ 板块轮动（5D）</p>
          <SectorGrid sectors={data.sectors} />
        </div>
      )}

      {/* ── Strategy Notes ───────────────────────────────────── */}
      <div className="panel p-4 space-y-2">
        <p className="text-[10px] tracking-widest text-gold/60">◈ AI 详细分析</p>
        <p className="text-xs text-muted/70 font-chinese leading-relaxed whitespace-pre-line">
          {data.strategy_notes}
        </p>
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="text-center py-2">
        <p className="text-[10px] text-muted/25">
          Powered by Claude claude-opus-4-6 · {data.scan_time}
        </p>
      </div>

    </div>
  );
}
