import type { OptionsScreenerResult } from "@/types";

export function OptionsSummaryStats({ data }: { data: OptionsScreenerResult }) {
  const total   = data.stocks.length;
  const buyCount = data.stocks.filter((s) => s.overall === "BUY").length;
  const warnCount = data.stocks.filter((s) => s.overall === "BEARISH" || s.overall === "WARNING").length;
  const maxStars = data.stocks.reduce((m, s) => Math.max(m, s.stars), 0);

  return (
    <div className="panel px-4 py-3 flex flex-wrap items-center gap-6 text-[11px]">
      <div>
        <span className="text-muted/40 font-trading">SCAN DATE </span>
        <span className="text-txt font-trading">{data.date}</span>
        <span className="text-muted/40 font-trading ml-2">{data.scan_time}</span>
      </div>
      <div className="h-3 w-px bg-border/40" />
      <div>
        <span className="text-muted/40">触发 </span>
        <span className="text-txt font-trading font-bold">{total}</span>
        <span className="text-muted/40"> 只</span>
      </div>
      <div>
        <span className="text-bull font-trading font-bold">{buyCount}</span>
        <span className="text-muted/40"> 买入信号</span>
      </div>
      <div>
        <span className="text-gold font-trading font-bold">{warnCount}</span>
        <span className="text-muted/40"> 风险提示</span>
      </div>
      <div>
        <span className="text-muted/40">最高评级 </span>
        <span className="text-gold font-trading font-bold">{maxStars}★</span>
      </div>
    </div>
  );
}
