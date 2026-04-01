import type { TopDivStock } from "@/types";

interface Props {
  stocks: TopDivStock[];
  scanDate: string;
  scanTime?: string;
}

export default function SummaryStats({ stocks, scanDate, scanTime }: Props) {
  const both = stocks.filter((s) => s.triggered.length === 2).length;
  const macdOnly = stocks.filter(
    (s) => s.triggered.length === 1 && s.triggered[0] === "MACD"
  ).length;
  const rsiOnly = stocks.filter(
    (s) => s.triggered.length === 1 && s.triggered[0] === "RSI"
  ).length;

  const items = [
    { label: "筛选结果", value: stocks.length, sub: `扫描日期 ${scanDate}`, time: scanTime, accent: "var(--color-gold)" },
    { label: "MACD + RSI 双重顶背离", value: both,     sub: "信号最强",   accent: "var(--color-bear)" },
    { label: "仅 MACD 顶背离",        value: macdOnly, sub: "单一指标",   accent: "#a78bfa" },
    { label: "仅 RSI 顶背离",         value: rsiOnly,  sub: "单一指标",   accent: "var(--color-dn)" },
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
            {item.value}
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
