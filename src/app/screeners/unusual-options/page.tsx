"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { OptionsScreenerResult } from "@/types";
import type { ScanStatus } from "@/lib/api/screener";
import {
  fetchOptionsScreener,
  fetchOptionsStatus,
  triggerOptionsScan,
} from "@/lib/api/screener";
import { OptionsCard } from "@/components/screeners/unusual-options/OptionsCard";
import { OptionsFilterBar, type OptionsFilter } from "@/components/screeners/unusual-options/OptionsFilterBar";
import { OptionsSummaryStats } from "@/components/screeners/unusual-options/OptionsSummaryStats";

// ─── Legend panel ─────────────────────────────────────────────────

const SIGNAL_ROWS = [
  { code: "M1", name: "SMART MONEY SWEEP",  color: "#00e676", desc: "买方主动扫单 (above-mid) + OTM + 权利金≥$100K + DTE 8-90天 — 机构级方向性押注，核心信号" },
  { code: "M2", name: "PREMIUM BIAS",       color: "#c9a84c", desc: "全市场 Call vs Put 总权利金比率 ≥2× — 资金系统性偏向某一方向" },
  { code: "M3", name: "SUSTAINED FLOW",     color: "#c9a84c", desc: "5日累计净权利金绝对值 >$300K — 连续多日持续建仓，非单日脉冲" },
  { code: "M4", name: "OPENING POSITION",   color: "#4f9cf9", desc: "次日 OI 增加 → 确认新开仓而非平仓，降低假信号率" },
  { code: "M5", name: "HIGH PUT OI",        color: "#ff1744", desc: "Put/Call OI >1.5× — 市场隐含大规模下行对冲压力，风险警示" },
  { code: "M6", name: "DIP BUY SIGNAL",     color: "#26a69a", desc: "多重跌幅触发（当日/5日/52周高点）+ M1 做多确认 — 机构在大跌时逆势建仓，仅在 M1 BULLISH 时计星" },
];

const STAR_ROWS = [
  { rule: "机构权利金 ≥$1M",          add: "+3★", note: "M1 BULLISH 或 BEARISH" },
  { rule: "机构权利金 ≥$500K",        add: "+2★", note: "" },
  { rule: "机构权利金 ≥$100K",        add: "+1★", note: "" },
  { rule: "M1 MIXED（多空对冲）",      add: "0★",  note: "方向不明确，不计星" },
  { rule: "方向一致 PREMIUM BIAS",     add: "+1★", note: "M2，需 M1 明确方向且同向" },
  { rule: "方向一致 SUSTAINED FLOW",   add: "+1★", note: "M3，需 M1 明确方向且同向" },
  { rule: "方向一致 OPENING POSITION", add: "+1★", note: "M4，需 M1 明确方向且同向" },
  { rule: "DIP BUY 触发",             add: "+1★", note: "需 M1 BULLISH；3条件全中 →+2★" },
];

const DTE_ROWS = [
  { tag: "SPEC", range: "0–7天",  color: "#ef5350", desc: "投机 / 事件驱动，时间价值极速流失，M1 不采纳" },
  { tag: "SHOR", range: "8–30天", color: "#c9a84c", desc: "短期方向性押注，M1 采纳" },
  { tag: "INST", range: "31–90天",color: "#00e676", desc: "机构建仓首选，M1 采纳，信号权重最高" },
  { tag: "STRT", range: "90天+",  color: "#4f9cf9", desc: "战略布局 / LEAPS，M1 不采纳（DTE 超出机构窗口）" },
];

const OVERALL_ROWS = [
  { label: "BUY",     color: "#00e676", rule: "多头 SM ≥$100K + 总星级≥3★" },
  { label: "BEARISH", color: "#ff1744", rule: "空头 SM ≥$500K，或空头 SM + HIGH PUT OI" },
  { label: "WARNING", color: "#c9a84c", rule: "空头 SM 存在但权利金 <$500K" },
  { label: "WATCH",   color: "#4f9cf9", rule: "总星级1-2★，值得关注" },
];

function LegendPanel() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#4f9cf9]/70">ℹ</span>
          <span className="text-[10px] font-trading text-muted/70 tracking-wider">信号说明</span>
          <span className="text-[9px] text-muted/40">6个模型 · DTE说明 · 计星规则 · 综合评级</span>
        </div>
        <span className="text-muted/40 text-[10px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div ref={ref} className="border-t border-border/40 px-4 py-3 space-y-4">
          {/* Signal models */}
          <div>
            <p className="text-[9px] text-muted/40 tracking-wider mb-2">信号模型</p>
            <div className="space-y-1.5">
              {SIGNAL_ROWS.map((r) => (
                <div key={r.code} className="flex gap-2 text-[10px]">
                  <span className="font-trading shrink-0 w-5 text-muted/30">{r.code}</span>
                  <span className="font-trading shrink-0 w-40" style={{ color: r.color }}>{r.name}</span>
                  <span className="text-muted/50 leading-relaxed">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* DTE buckets */}
          <div>
            <p className="text-[9px] text-muted/40 tracking-wider mb-2">到期日分组 (DTE)</p>
            <div className="space-y-1.5">
              {DTE_ROWS.map((r) => (
                <div key={r.tag} className="flex gap-2 text-[10px]">
                  <span className="font-trading shrink-0 w-10 text-right" style={{ color: r.color }}>{r.tag}</span>
                  <span className="font-trading shrink-0 w-14 text-muted/40">{r.range}</span>
                  <span className="text-muted/50 leading-relaxed">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Star rules */}
            <div>
              <p className="text-[9px] text-muted/40 tracking-wider mb-2">计星规则（最高5★）</p>
              <div className="space-y-1">
                {STAR_ROWS.map((r, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-[10px]">
                    <span className="text-gold font-trading shrink-0 w-8">{r.add}</span>
                    <span className="text-muted/60">{r.rule}</span>
                    {r.note && <span className="text-muted/30 text-[9px]">{r.note}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Overall labels */}
            <div>
              <p className="text-[9px] text-muted/40 tracking-wider mb-2">综合评级</p>
              <div className="space-y-1">
                {OVERALL_ROWS.map((r) => (
                  <div key={r.label} className="flex items-baseline gap-2 text-[10px]">
                    <span className="font-trading font-bold shrink-0 w-16" style={{ color: r.color }}>{r.label}</span>
                    <span className="text-muted/50">{r.rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Polling helper ───────────────────────────────────────────────

const POLL_INTERVAL = 5000;
const MAX_POLLS     = 72; // 6 min

export default function UnusualOptionsPage() {
  const [data,    setData]    = useState<OptionsScreenerResult | null>(null);
  const [status,  setStatus]  = useState<ScanStatus>({ status: "idle" });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<OptionsFilter>({ minStars: 0, direction: "ALL" });

  // ── Initial fetch ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [result, st] = await Promise.all([
        fetchOptionsScreener(),
        fetchOptionsStatus(),
      ]);
      setData(result);
      setStatus(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Manual scan trigger ────────────────────────────────────────
  const handleTrigger = async () => {
    try {
      await triggerOptionsScan();
      setStatus({ status: "running" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trigger failed");
    }
  };

  // ── Poll while running ─────────────────────────────────────────
  useEffect(() => {
    if (status.status !== "running") return;
    let count = 0;
    const id = setInterval(async () => {
      count++;
      if (count > MAX_POLLS) { clearInterval(id); return; }
      try {
        const st = await fetchOptionsStatus();
        setStatus(st);
        if (st.status === "done") {
          clearInterval(id);
          const result = await fetchOptionsScreener();
          setData(result);
        } else if (st.status === "error") {
          clearInterval(id);
        }
      } catch { /* ignore poll errors */ }
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [status.status]);

  // ── Filtered list ──────────────────────────────────────────────
  const filtered = (data?.stocks ?? []).filter((s) => {
    if (s.stars < filter.minStars) return false;
    if (filter.direction !== "ALL" && s.overall !== filter.direction) return false;
    return true;
  });

  // ── Status bar color ───────────────────────────────────────────
  const statusColor =
    status.status === "running" ? "text-gold" :
    status.status === "done"    ? "text-bull"  :
    status.status === "error"   ? "text-dn"    : "text-muted/40";

  return (
    <div className="py-4 space-y-3 min-h-[calc(100dvh-3.5rem)]">
      {/* ── Page header ── */}
      <div className="panel p-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs tracking-[0.18em] text-[#4f9cf9]">OPTIONS FLOW</p>
            <span className="tag tag-muted text-[9px]">Tradier API</span>
          </div>
          <p className="text-base font-trading text-txt">异常期权信号</p>
          <p className="text-[11px] text-muted/50 mt-1 leading-relaxed">
            扫描 Vol ≥ 3× OI 的异常期权合约，按美元权利金加权评分，6个模型识别机构方向性押注
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={handleTrigger}
            disabled={status.status === "running"}
            className="btn text-[11px] px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status.status === "running" ? "扫描中..." : "手动触发扫描"}
          </button>
          <div className={`text-[10px] font-trading ${statusColor}`}>
            {status.status.toUpperCase()}
            {status.updated_at && (
              <span className="text-muted/30 ml-1">{status.updated_at.slice(11, 16)}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <LegendPanel />

      {/* ── Loading ── */}
      {loading && (
        <div className="panel p-8 text-center text-muted/40 text-sm font-trading">
          LOADING...
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="panel p-4 text-dn text-sm font-trading">
          Error: {error}
        </div>
      )}

      {/* ── Results ── */}
      {data && !loading && (
        <>
          <OptionsSummaryStats data={data} />
          <OptionsFilterBar
            filter={filter}
            onChange={setFilter}
            total={filtered.length}
          />

          {filtered.length === 0 ? (
            <div className="panel p-8 text-center text-muted/40 text-sm font-trading">
              {data.stocks.length === 0
                ? "本次扫描无信号触发"
                : "当前过滤条件无匹配结果"}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((stock) => (
                <OptionsCard key={stock.ticker} stock={stock} />
              ))}
            </div>
          )}

          {/* Params footer */}
          <div className="panel px-4 py-2.5 flex flex-wrap gap-4 text-[10px] text-muted/30 font-trading">
            <span>Vol/OI ≥ {data.params.uv_vol_oi_ratio}×</span>
            <span>入池权利金 ≥ ${(data.params.uv_min_premium / 1000).toFixed(0)}K</span>
            <span>机构级 ≥ ${(data.params.smart_money_min_premium / 1000).toFixed(0)}K</span>
            <span>5日流量阈值 ${(data.params.sustained_flow_threshold / 1000).toFixed(0)}K</span>
            <span>Put OI 警示线 &gt;{data.params.hpi_ratio}×</span>
          </div>
        </>
      )}
    </div>
  );
}
