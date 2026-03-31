"use client";

import { useEffect, useState, useCallback } from "react";
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
            扫描 Vol ≥ 3× OI 的异常期权合约，综合 5 个信号模型评分，识别机构方向性押注
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
            <span>UV 阈值: Vol ≥ {data.params.uv_vol_oi_ratio}× OI</span>
            <span>最低成交量: {data.params.uv_min_volume}</span>
            <span>P/C 牛市线: &lt;{data.params.pc_bull_threshold}</span>
            <span>Put OI 警示线: &gt;{data.params.hpi_ratio}×</span>
          </div>
        </>
      )}
    </div>
  );
}
