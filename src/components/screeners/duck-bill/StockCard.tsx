import type { DuckStock } from "@/types";
import DuckChart from "./DuckChart";

interface Props {
  stock: DuckStock;
}

export default function StockCard({ stock: s }: Props) {
  const pct       = s.pct_change ?? 0;
  const pctUp     = pct >= 0;
  const mktcapStr = s.mktcap_b != null && s.mktcap_b > 0
    ? `${s.mktcap_b}B`
    : "—";
  const volHot = s.vol_ratio >= 1.5;

  const stats = [
    { label: "DIFF",   value: s.duck.diff_latest.toFixed(4) },
    { label: "DEA",    value: s.duck.dea_latest.toFixed(4) },
    { label: "HIST",   value: s.duck.hist_latest.toFixed(4) },
    { label: "趋近度", value: `${s.duck.gap_ratio_min}%` },
    { label: "开口角", value: `${s.duck.diverge_angle}°`, highlight: true },
    { label: "形成时间", value: s.duck.reversal_date || (s.duck.bars_since_reversal === 1 ? "今日" : `${s.duck.bars_since_reversal}日前`) },
  ];

  return (
    <div className="panel flex flex-col overflow-hidden transition-all duration-200 hover:border-bull/30 hover:-translate-y-px">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3 border-b border-border/50">
        <div>
          <p className="text-xl font-bold text-txt tracking-tight">{s.ticker}</p>
          <p className="text-[11px] text-muted/50 font-trading mt-0.5">
            市值 {mktcapStr} USD
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold font-trading" style={{ color: "#26a69a" }}>
            ${s.price}
          </p>
          <div className="flex gap-2 justify-end mt-1">
            <span
              className="text-[10px] font-trading font-bold px-2 py-0.5 rounded"
              style={{
                background: pctUp ? "rgba(38,166,154,0.12)" : "rgba(239,83,80,0.12)",
                color:      pctUp ? "#26a69a" : "#ef5350",
              }}
            >
              {pctUp ? "+" : ""}{pct}%
            </span>
            <span
              className="text-[10px] font-trading font-bold px-2 py-0.5 rounded"
              style={{
                background: volHot ? "rgba(0,230,118,0.12)" : "rgba(148,163,184,0.08)",
                color:      volHot ? "#00e676" : "#94a3b8",
              }}
            >
              {volHot ? "🔥 " : ""}量比 {s.vol_ratio}x
            </span>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-border/50">
        <span className="tag tag-up text-[10px]">✓ 正鸭嘴</span>
        <span className="text-[10px] font-trading font-bold px-2 py-0.5 rounded border"
          style={{ color: "#818cf8", borderColor: "rgba(129,140,248,0.3)", background: "rgba(129,140,248,0.08)" }}>
          ⬆ 零轴上方
        </span>
        <span className="tag tag-gold text-[10px]">↗ MA多头</span>
        {s.is_etf && (
          <span className="text-[10px] font-trading font-bold px-2 py-0.5 rounded border"
            style={{ color: "#a78bfa", borderColor: "rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.08)" }}>
            ◈ ETF
          </span>
        )}
      </div>

      {/* MA row */}
      <div className="flex gap-4 px-4 py-2 border-b border-border/50 text-[11px] font-trading">
        <span className="text-muted/50">MA5 <span className="text-gold">{s.ma5}</span></span>
        <span className="text-muted/50">MA10 <span className="text-up">{s.ma10}</span></span>
        <span className="text-muted/50">MA20 <span className="text-muted">{s.ma20}</span></span>
      </div>

      {/* Chart */}
      <div className="px-3 py-2 border-b border-border/50">
        <DuckChart chart={s.chart} />
      </div>

      {/* MACD stats */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5 px-4 py-3">
        {stats.map(({ label, value, highlight }) => (
          <div key={label}>
            <p className="text-[9px] uppercase tracking-[0.1em] text-muted/40 font-trading mb-0.5">
              {label}
            </p>
            <p
              className="text-[13px] font-bold font-trading"
              style={{ color: highlight ? "#c9a84c" : "#26a69a" }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
