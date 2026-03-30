import type { YFSummaryModule } from "@/types";
import { raw, formatLargeNum } from "@/lib/utils";

interface FinancialMetricsProps {
  summary: YFSummaryModule;
}

function PctCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted/40">—</span>;
  const pct = (v * 100).toFixed(1);
  return <span className={parseFloat(pct) >= 0 ? "text-up" : "text-dn"}>{parseFloat(pct) >= 0 ? "+" : ""}{pct}%</span>;
}

export default function FinancialMetrics({ summary }: FinancialMetricsProps) {
  const fd = summary.financialData;
  const ks = summary.defaultKeyStatistics;

  const rows = [
    { label: "营收 (TTM)", value: formatLargeNum(raw(fd?.totalRevenue)), sub: <><PctCell v={raw(fd?.revenueGrowth)} /> YoY</> },
    { label: "毛利率", value: <PctCell v={raw(fd?.grossMargins)} />, sub: null },
    { label: "营业利润率", value: <PctCell v={raw(fd?.operatingMargins)} />, sub: null },
    { label: "净利率", value: <PctCell v={raw(fd?.profitMargins)} />, sub: null },
    { label: "自由现金流", value: formatLargeNum(raw(fd?.freeCashflow)), sub: null },
    { label: "ROE", value: <PctCell v={raw(fd?.returnOnEquity)} />, sub: null },
    { label: "ROA", value: <PctCell v={raw(fd?.returnOnAssets)} />, sub: null },
    { label: "总负债", value: formatLargeNum(raw(fd?.totalDebt)), sub: null },
    { label: "现金", value: formatLargeNum(raw(fd?.totalCash)), sub: null },
    { label: "D/E Ratio", value: raw(fd?.debtToEquity) != null ? (raw(fd?.debtToEquity)! / 100).toFixed(2) : "—", sub: null },
    { label: "流动比率", value: raw(fd?.currentRatio) != null ? raw(fd?.currentRatio)!.toFixed(2) : "—", sub: null },
  ];

  return (
    <div className="panel p-5">
      <p className="text-[10px] tracking-[0.18em] text-muted/60 mb-3">// FINANCIALS</p>
      <div className="space-y-0 divide-y divide-border/30">
        {rows.map(({ label, value, sub }) => (
          <div key={label} className="flex justify-between items-center py-1.5">
            <span className="text-xs text-muted/70">{label}</span>
            <span className="text-sm font-trading text-right">
              {value}
              {sub && <span className="text-[10px] text-muted/50 ml-2">{sub}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
