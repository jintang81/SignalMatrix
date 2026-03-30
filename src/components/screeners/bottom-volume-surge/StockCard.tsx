import type { VolumeSurgeStock } from "@/types";
import VolumeChart from "./VolumeChart";

interface Props {
  stock: VolumeSurgeStock;
}

function fmtCap(v: number): string {
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9)  return (v / 1e9).toFixed(1)  + "B";
  return (v / 1e6).toFixed(0) + "M";
}

function fmtVol(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return String(v);
}

export default function StockCard({ stock: s }: Props) {
  const maPct    = ((s.last_close - s.ma50) / s.ma50 * 100);
  const capStr   = s.market_cap > 0 ? fmtCap(s.market_cap) + " USD" : "—";

  return (
    <div className="panel overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/40">
      {/* Top: ticker + price */}
      <div className="flex items-start justify-between px-4 pt-3 pb-2.5 border-b border-border/50">
        <div>
          <span className="text-lg font-bold text-txt font-trading tracking-wide">
            {s.ticker}
          </span>
          <p className="text-[10px] text-muted/50 font-trading mt-0.5">
            市值 {capStr}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold text-txt font-trading">${s.last_close.toFixed(2)}</p>
          <p className="text-xs font-trading mt-0.5 text-dn">
            YTD {s.ytd_return.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted/50 font-trading mt-0.5">
            MA50 ${s.ma50.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-border/40">
        <span className="tag text-[9px] border-gold/40 text-gold bg-gold/5">
          🔥 今 {s.vol_ratio.toFixed(1)}x / 昨 {s.vol_ratio2.toFixed(1)}x
        </span>
        <span className="tag text-[9px] border-dn/30 text-dn bg-dn/5">
          YTD {s.ytd_return.toFixed(1)}%
        </span>
        <span className="tag text-[9px]" style={{ borderColor: "rgba(167,139,250,0.35)", color: "#a78bfa", background: "rgba(167,139,250,0.05)" }}>
          低于MA50 {Math.abs(maPct).toFixed(1)}%
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 border-b border-border/40">
        {[
          { value: s.vol_ratio.toFixed(1) + "x",       label: "今日放量",  color: "text-gold" },
          { value: s.vol_ratio2.toFixed(1) + "x",      label: "昨日放量",  color: "text-gold" },
          { value: s.ytd_return.toFixed(1) + "%",      label: "YTD收益",   color: "text-dn"   },
          { value: fmtVol(s.last_vol),                  label: "今日成交量", color: "text-muted" },
        ].map((m) => (
          <div key={m.label} className="px-3 py-2 text-center border-r last:border-r-0 border-border/30">
            <p className={`text-sm font-bold font-trading ${m.color}`}>{m.value}</p>
            <p className="text-[9px] text-muted/50 mt-0.5 font-trading">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <VolumeChart chart={s.chart} />

      {/* Footer */}
      <div className="flex gap-4 px-4 py-2 border-t border-border/40 text-[10px] font-trading text-muted/60">
        <span>
          均量 <span className="text-muted/80">{fmtVol(s.vol_ma20)}</span>
        </span>
        <span>
          连续放量 <span className="text-gold">2 天</span>
        </span>
      </div>
    </div>
  );
}
