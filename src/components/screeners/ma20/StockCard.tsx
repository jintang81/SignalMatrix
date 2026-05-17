import type { MA20Stock } from "@/types";
import MA20Chart from "./MA20Chart";

interface Props {
  stock: MA20Stock;
}

function fmtCap(v: number): string {
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9)  return (v / 1e9).toFixed(1)  + "B";
  return (v / 1e6).toFixed(0) + "M";
}

export default function StockCard({ stock: s }: Props) {
  const isUp     = s.direction === "up";
  const accent   = isUp ? "text-bull" : "text-dn";
  const slopeSign = isUp ? "+" : "";
  const capStr   = s.market_cap > 0 ? fmtCap(s.market_cap) + " USD" : "—";

  return (
    <div className="panel overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/40">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-3 pb-2.5 border-b border-border/50">
        <div>
          <span className="text-lg font-bold text-txt font-trading tracking-wide">{s.ticker}</span>
          <p className="text-[10px] text-muted/50 font-trading mt-0.5">市值 {capStr}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold text-txt font-trading">
            ${s.last_close >= 1000 ? s.last_close.toFixed(0) : s.last_close >= 100 ? s.last_close.toFixed(1) : s.last_close.toFixed(2)}
          </p>
          <p className={`text-xs font-trading mt-0.5 ${accent}`}>
            {isUp ? "↑ 拐头向上" : "↓ 拐头向下"}
          </p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-border/40">
        <span
          className="tag text-[9px]"
          style={{
            borderColor: isUp ? "rgba(0,230,118,0.35)" : "rgba(255,23,68,0.35)",
            color:       isUp ? "#00e676" : "#ff1744",
            background:  isUp ? "rgba(0,230,118,0.05)" : "rgba(255,23,68,0.05)",
          }}
        >
          MA20斜率 {slopeSign}{s.ma20_slope.toFixed(3)}
        </span>
        <span
          className="tag text-[9px]"
          style={{ borderColor: "rgba(167,139,250,0.35)", color: "#a78bfa", background: "rgba(167,139,250,0.05)" }}
        >
          MA20 {s.ma20_today.toFixed(2)}
        </span>
      </div>

      {/* 3-column metrics */}
      <div className="grid grid-cols-3 border-b border-border/40">
        {[
          { value: s.ma20_today.toFixed(2),               label: "MA20 今日", color: accent },
          { value: s.ma20_yest.toFixed(2),                label: "MA20 昨日", color: "text-muted" },
          { value: slopeSign + s.ma20_slope.toFixed(3),   label: "斜率变化",  color: accent },
        ].map((m) => (
          <div key={m.label} className="px-3 py-2 text-center border-r last:border-r-0 border-border/30">
            <p className={`text-sm font-bold font-trading ${m.color}`}>{m.value}</p>
            <p className="text-[9px] text-muted/50 mt-0.5 font-trading">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <MA20Chart chart={s.chart} direction={s.direction} />
    </div>
  );
}
