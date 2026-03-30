import type { PPSTResult } from "@/types";
import { formatPrice } from "@/lib/utils";

interface SignalCardsProps {
  result: PPSTResult;
  sliceStart: number;
}

export default function SignalCards({ result, sliceStart }: SignalCardsProps) {
  const { st, trend, center } = result;
  const n = st.length;

  // Find last valid (non-NaN) index in the full result, starting from slice start
  let lastIdx = n - 1;
  while (lastIdx > sliceStart && isNaN(st[lastIdx])) lastIdx--;

  const lastTrend = trend[lastIdx] ?? 0;
  const lastST = st[lastIdx];
  const lastCenter = center[lastIdx];

  // Consecutive streak
  let streak = 0;
  for (let i = lastIdx; i >= 0 && trend[i] === lastTrend; i--) streak++;

  const isBull = lastTrend === 1;
  const signalClass = isBull ? "border-bull/40 bg-bull/5" : lastTrend === -1 ? "border-bear/40 bg-bear/5" : "border-border bg-bg-3";
  const signalLabel = isBull ? "📈 多头上涨" : lastTrend === -1 ? "📉 空头下跌" : "—";
  const trendDesc = isBull ? "追踪止损支撑" : "追踪止损阻力";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Trend */}
      <div className={`panel p-4 text-center ${signalClass}`}>
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">当前趋势</p>
        <p className={`text-lg font-bold font-chinese ${isBull ? "text-bull" : lastTrend === -1 ? "text-bear" : "text-gold"}`}>
          {signalLabel}
        </p>
        <p className="text-[10px] text-muted/50 mt-1">{trendDesc}</p>
      </div>

      {/* ST value */}
      <div className={`panel p-4 text-center ${signalClass}`}>
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">SuperTrend 值</p>
        <p className={`text-lg font-trading ${isBull ? "text-bull" : lastTrend === -1 ? "text-bear" : "text-gold"}`}>
          {isNaN(lastST) ? "—" : `${formatPrice(lastST)}`}
        </p>
        <p className="text-[10px] text-muted/50 mt-1">{trendDesc}</p>
      </div>

      {/* Center */}
      <div className="panel p-4 text-center">
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">中轴 Center</p>
        <p className="text-lg font-trading text-[#5b9cf6]">
          {isNaN(lastCenter) ? "—" : `${formatPrice(lastCenter)}`}
        </p>
        <p className="text-[10px] text-muted/50 mt-1">枢轴点加权均值</p>
      </div>

      {/* Streak */}
      <div className="panel p-4 text-center">
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">连续趋势周期</p>
        <p className="text-lg font-trading text-gold">{streak}</p>
        <p className="text-[10px] text-muted/50 mt-1">当前方向持续 {streak} 根K线</p>
      </div>
    </div>
  );
}
