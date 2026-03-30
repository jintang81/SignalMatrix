import type { OHLCVData } from "@/types";
import { formatPrice, formatPct } from "@/lib/utils";

interface InfoBarProps {
  data: OHLCVData;
  sliceLength: number;
}

export default function InfoBar({ data, sliceLength }: InfoBarProps) {
  const price = data.regularMarketPrice;
  const prev = data.regularMarketPreviousClose;
  const chg = price - prev;
  const pct = prev !== 0 ? (chg / prev) * 100 : 0;

  // Prefer Yahoo Finance meta 52W values (accurate); fallback to data arrays
  const hi52 = data.fiftyTwoWeekHigh ?? Math.max(...(data.highs.filter((v): v is number => v != null)));
  const lo52 = data.fiftyTwoWeekLow  ?? Math.min(...(data.lows.filter((v): v is number => v != null)));

  const isUp = chg >= 0;

  return (
    <div className="panel px-4 py-3 flex flex-wrap gap-x-6 gap-y-2 items-center">
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] text-muted/50 uppercase tracking-wider">公司</span>
        <span className="text-sm font-trading text-txt">{data.shortName}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] text-muted/50 uppercase tracking-wider">最新价</span>
        <span className="text-sm font-trading text-txt">{formatPrice(price)}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] text-muted/50 uppercase tracking-wider">涨跌幅</span>
        <span className={`text-sm font-trading ${isUp ? "text-up" : "text-dn"}`}>
          {isUp ? "+" : ""}{formatPrice(chg)} ({formatPct(pct, 2, true)})
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] text-muted/50 uppercase tracking-wider">52W HIGH</span>
        <span className="text-sm font-trading text-up">{formatPrice(hi52)}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] text-muted/50 uppercase tracking-wider">52W LOW</span>
        <span className="text-sm font-trading text-dn">{formatPrice(lo52)}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] text-muted/50 uppercase tracking-wider">数据点</span>
        <span className="text-sm font-trading text-muted">{sliceLength}</span>
      </div>
    </div>
  );
}
