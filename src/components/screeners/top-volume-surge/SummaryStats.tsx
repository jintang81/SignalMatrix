import type { TopVolumeSurgeStock } from "@/types";

interface Props {
  stocks: TopVolumeSurgeStock[];
  scanDate: string;
  scanTime?: string;
}

export default function SummaryStats({ stocks, scanDate, scanTime }: Props) {
  const total  = stocks.length;
  const avgVol = total > 0
    ? stocks.reduce((s, r) => s + r.vol_ratio, 0) / total
    : 0;
  const maxVol = total > 0 ? Math.max(...stocks.map((r) => r.vol_ratio)) : 0;
  const avgYtd = total > 0
    ? stocks.reduce((s, r) => s + r.ytd_return, 0) / total
    : 0;

  const items = [
    {
      label:  "符合股票",
      value:  total,
      sub:    `扫描日期 ${scanDate}`,
      time:   scanTime,
      accent: "var(--color-dn)",
      fmt:    (v: number) => String(v),
    },
    {
      label:  "平均放量",
      value:  avgVol,
      sub:    "今日成交量 / 均量",
      accent: "#f97316",
      fmt:    (v: number) => v.toFixed(1) + "x",
    },
    {
      label:  "最大放量",
      value:  maxVol,
      sub:    "单只最高倍数",
      accent: "#f97316",
      fmt:    (v: number) => v.toFixed(1) + "x",
    },
    {
      label:  "平均YTD",
      value:  avgYtd,
      sub:    "年初至今均涨幅",
      accent: "var(--color-up)",
      fmt:    (v: number) => "+" + v.toFixed(1) + "%",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className="panel p-4 relative overflow-hidden">
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: item.accent }}
          />
          <p className="text-[10px] tracking-widest text-muted/60 uppercase mb-2 font-trading">
            {item.label}
          </p>
          <p className="text-3xl font-bold text-txt leading-none mb-1 font-trading">
            {item.fmt(item.value)}
          </p>
          <p className="text-[10px] text-muted/50 font-trading">{item.sub}</p>
          {"time" in item && item.time && (
            <p className="text-[10px] text-muted/40 font-trading">{item.time}</p>
          )}
        </div>
      ))}
    </div>
  );
}
