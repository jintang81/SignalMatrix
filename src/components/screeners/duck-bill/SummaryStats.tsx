import type { DuckStock } from "@/types";

interface Props {
  stocks: DuckStock[];
  scanDate: string;
}

export default function SummaryStats({ stocks, scanDate }: Props) {
  const count = stocks.length;

  const avgAngle = count > 0
    ? (stocks.reduce((a, s) => a + s.duck.diverge_angle, 0) / count).toFixed(1)
    : "—";

  const maxAngle = count > 0
    ? Math.max(...stocks.map((s) => s.duck.diverge_angle)).toFixed(1)
    : "—";

  const avgVol = count > 0
    ? (stocks.reduce((a, s) => a + s.vol_ratio, 0) / count).toFixed(2)
    : "—";

  const cards = [
    { label: "符合条件股票",  value: count,              sub: `扫描日期 ${scanDate}` },
    { label: "平均开口角度",  value: avgAngle + (count > 0 ? "°" : ""), sub: "≥25° 为基准" },
    { label: "最大开口角度",  value: maxAngle + (count > 0 ? "°" : ""), sub: "形态最强" },
    { label: "平均成交量比",  value: avgVol + (count > 0 ? "x" : ""),   sub: "近3日 vs 20日均量" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <div key={i} className="panel p-3.5 relative overflow-hidden">
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: ["#00e676", "#c9a84c", "#f0cc6e", "#26a69a"][i] }}
          />
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted/60 mb-1.5 font-trading">
            {c.label}
          </p>
          <p className="text-2xl font-bold text-txt leading-none">{c.value}</p>
          <p className="text-[10px] text-muted/40 mt-1 font-trading">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
