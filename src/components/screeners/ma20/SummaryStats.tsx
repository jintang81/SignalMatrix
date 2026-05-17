import type { MA20ScreenerResult } from "@/types";

interface Props {
  data:      MA20ScreenerResult;
  activeTab: "up" | "dn";
}

export default function SummaryStats({ data, activeTab }: Props) {
  const list     = activeTab === "up" ? data.turning_up : data.turning_dn;
  const oppList  = activeTab === "up" ? data.turning_dn : data.turning_up;
  const accent   = activeTab === "up" ? "var(--color-bull)" : "var(--color-dn)";
  const oppAccent = activeTab === "up" ? "var(--color-dn)"  : "var(--color-bull)";

  const avgSlope = list.length > 0
    ? list.reduce((s, r) => s + Math.abs(r.ma20_slope), 0) / list.length
    : 0;
  const maxSlope = list.length > 0
    ? Math.max(...list.map((r) => Math.abs(r.ma20_slope)))
    : 0;

  const items = [
    {
      label:  activeTab === "up" ? "拐头向上" : "拐头向下",
      value:  String(list.length),
      sub:    `扫描日期 ${data.date}`,
      time:   data.scan_time,
      accent,
    },
    {
      label:  activeTab === "up" ? "拐头向下" : "拐头向上",
      value:  String(oppList.length),
      sub:    "对向信号数量",
      accent: oppAccent,
    },
    {
      label:  "平均斜率",
      value:  avgSlope.toFixed(3),
      sub:    "均线斜率绝对值均值",
      accent: "var(--color-gold)",
    },
    {
      label:  "最大斜率",
      value:  maxSlope.toFixed(3),
      sub:    "单只最大拐头幅度",
      accent: "#f59e0b",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className="panel p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: item.accent }} />
          <p className="text-[10px] tracking-widest text-muted/60 uppercase mb-2 font-trading">
            {item.label}
          </p>
          <p className="text-3xl font-bold text-txt leading-none mb-1 font-trading">{item.value}</p>
          <p className="text-[10px] text-muted/50 font-trading">{item.sub}</p>
          {"time" in item && item.time && (
            <p className="text-[10px] text-muted/40 font-trading mt-0.5">{item.time}</p>
          )}
        </div>
      ))}
    </div>
  );
}
