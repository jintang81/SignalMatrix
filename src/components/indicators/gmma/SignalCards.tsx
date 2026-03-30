import type { GMMAResult, GMMASignals } from "@/types";

interface Props {
  gmma: GMMAResult;
  signals: GMMASignals;
  sliceStart: number;
}

export default function SignalCards({ gmma, signals, sliceStart }: Props) {
  // Slice to display range
  const short = gmma.short.map((arr) => arr.slice(sliceStart));
  const long  = gmma.long.map((arr) => arr.slice(sliceStart));
  const slicedLongBull  = signals.longBull.slice(sliceStart);
  const slicedLongBear  = signals.longBear.slice(sliceStart);
  const slicedTriple    = signals.tripleCross.slice(sliceStart);
  const slicedBreak12   = signals.break12.slice(sliceStart);
  const slicedSmiley    = signals.smiley.slice(sliceStart);

  const last = short[0].length - 1;

  // Trend signal
  const shortAvg = short.reduce((s, arr) => s + (arr[last] ?? 0), 0) / 6;
  const longAvg  = long.reduce((s, arr) => s + (arr[last] ?? 0), 0) / 6;
  const isBull = slicedLongBull[last] ?? false;
  const isBear = slicedLongBear[last] ?? false;

  // Recent 5-bar signal lookup
  function recentSignal(arr: boolean[]): { hit: boolean; barsAgo: number } {
    const end = arr.length - 1;
    for (let i = 0; i < 5; i++) {
      if (arr[end - i]) return { hit: true, barsAgo: i };
    }
    return { hit: false, barsAgo: -1 };
  }
  const barLabel = (n: number) => (n === 0 ? "今日信号" : `${n}日前`);

  const triple = recentSignal(slicedTriple);
  const brk    = recentSignal(slicedBreak12);
  const smile  = recentSignal(slicedSmiley);

  const trendBull = isBull && shortAvg > longAvg;
  const trendBear = isBear && shortAvg < longAvg;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Trend */}
      <div
        className={`panel p-4 text-center ${
          trendBull ? "border-bull/20 bg-bull/[0.03]" :
          trendBear ? "border-dn/20 bg-dn/[0.03]" : ""
        }`}
      >
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">📊 趋势判断 TREND</p>
        <p
          className={`text-base font-trading font-bold ${
            trendBull ? "text-bull" : trendBear ? "text-dn" : "text-muted"
          }`}
        >
          {trendBull ? "🐂 强势上涨" : trendBear ? "🐻 弱势下跌" : "🔀 横盘震荡"}
        </p>
        <p className="text-[10px] text-muted/50 mt-1 font-chinese">
          {trendBull ? "长短期均线多头排列" : trendBear ? "长短期均线空头排列" : "多空力量相当"}
        </p>
      </div>

      {/* Triple cross */}
      <div className={`panel p-4 text-center ${triple.hit ? "border-up/20 bg-up/[0.03]" : ""}`}>
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">↑ 三线金叉 TRIPLE</p>
        <p className={`text-base font-trading font-bold ${triple.hit ? "text-up" : "text-muted"}`}>
          {triple.hit ? "↑ 触发" : "— 未触发"}
        </p>
        <p className="text-[10px] text-muted/50 mt-1 font-chinese">
          {triple.hit ? barLabel(triple.barsAgo) : "EMA3穿EMA5穿EMA8"}
        </p>
      </div>

      {/* Break 12 */}
      <div className={`panel p-4 text-center ${brk.hit ? "border-bull/20 bg-bull/[0.03]" : ""}`}>
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">⬆ 一阳穿12线 BREAK</p>
        <p className={`text-base font-trading font-bold ${brk.hit ? "text-bull" : "text-muted"}`}>
          {brk.hit ? "⬆ 触发" : "— 未触发"}
        </p>
        <p className="text-[10px] text-muted/50 mt-1 font-chinese">
          {brk.hit ? barLabel(brk.barsAgo) : "收盘穿越全部12均线"}
        </p>
      </div>

      {/* Smiley / 双涨策略 */}
      <div className={`panel p-4 text-center ${smile.hit ? "border-gold/20 bg-gold/[0.03]" : ""}`}>
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">😊 双涨策略 SMILEY</p>
        <p className={`text-base font-trading font-bold ${smile.hit ? "text-gold" : "text-muted"}`}>
          {smile.hit ? "😊 触发" : "— 未触发"}
        </p>
        <p className="text-[10px] text-muted/50 mt-1 font-chinese">
          {smile.hit ? barLabel(smile.barsAgo) + " · 等待KD金叉" : "配合KD金叉进场"}
        </p>
      </div>
    </div>
  );
}
