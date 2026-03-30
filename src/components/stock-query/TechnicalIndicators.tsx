import type { TechnicalSnapshot } from "@/types";

interface TechnicalIndicatorsProps {
  snapshot: TechnicalSnapshot;
}

export default function TechnicalIndicators({ snapshot }: TechnicalIndicatorsProps) {
  const { rsi14, kdj, macd, maTrend, volRatio, weekPos52 } = snapshot;

  // RSI interpretation
  const rsiColor =
    rsi14 == null ? "text-muted/40"
    : rsi14 < 30 ? "text-up"
    : rsi14 > 70 ? "text-dn"
    : "text-txt";
  const rsiLabel =
    rsi14 == null ? "N/A"
    : rsi14 < 30 ? "超卖区"
    : rsi14 > 70 ? "超买区"
    : "中性";

  // KDJ
  const kdjColor =
    !kdj ? "text-muted/40"
    : kdj.j < 0 ? "text-up"
    : kdj.k > kdj.d ? "text-up"
    : "text-dn";
  const kdjLabel = !kdj ? "N/A" : kdj.k > kdj.d ? "金叉" : "死叉";

  // MACD
  const macdColor = !macd ? "text-muted/40" : macd.histogram > 0 ? "text-up" : "text-dn";
  const macdLabel = !macd ? "N/A" : macd.histogram > 0 ? "零轴上方" : "零轴下方";

  // MA trend
  const maTrendColor = maTrend === "above" ? "text-up" : maTrend === "below" ? "text-dn" : "text-gold";
  const maTrendLabel = maTrend === "above" ? "多头排列 ▲" : maTrend === "below" ? "空头排列 ▼" : "均线纠缠";

  // Vol ratio
  const volColor = volRatio == null ? "text-muted/40" : volRatio > 2 ? "text-gold" : volRatio < 0.5 ? "text-muted/50" : "text-txt";
  const volLabel = volRatio == null ? "N/A" : volRatio > 2 ? "异常放量" : volRatio > 1.3 ? "温和放量" : "缩量";

  return (
    <div className="panel p-5">
      <p className="text-[10px] tracking-[0.18em] text-muted/60 mb-3">// TECHNICALS</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {/* RSI */}
        <div className="bg-bg-3/50 rounded px-3 py-2.5">
          <div className="text-[9px] tracking-[0.1em] text-muted/50 mb-1">RSI (14)</div>
          <div className={`text-xl font-trading ${rsiColor}`}>
            {rsi14 != null ? rsi14.toFixed(1) : "—"}
          </div>
          <div className="text-[10px] text-muted/50 mt-0.5">{rsiLabel}</div>
        </div>

        {/* KDJ */}
        <div className="bg-bg-3/50 rounded px-3 py-2.5">
          <div className="text-[9px] tracking-[0.1em] text-muted/50 mb-1">KDJ (9,3,3)</div>
          <div className={`text-base font-trading leading-snug ${kdjColor}`}>
            {kdj ? `K:${kdj.k.toFixed(0)} D:${kdj.d.toFixed(0)}` : "—"}
          </div>
          <div className="text-[10px] text-muted/50 mt-0.5">
            {kdjLabel}{kdj ? ` (J:${kdj.j.toFixed(0)})` : ""}
          </div>
        </div>

        {/* MACD */}
        <div className="bg-bg-3/50 rounded px-3 py-2.5">
          <div className="text-[9px] tracking-[0.1em] text-muted/50 mb-1">MACD Hist</div>
          <div className={`text-xl font-trading ${macdColor}`}>
            {macd ? (macd.histogram >= 0 ? "+" : "") + macd.histogram.toFixed(3) : "—"}
          </div>
          <div className="text-[10px] text-muted/50 mt-0.5">{macdLabel}</div>
        </div>

        {/* MA Trend */}
        <div className="bg-bg-3/50 rounded px-3 py-2.5">
          <div className="text-[9px] tracking-[0.1em] text-muted/50 mb-1">均线趋势</div>
          <div className={`text-sm font-trading leading-snug ${maTrendColor}`}>{maTrendLabel}</div>
        </div>

        {/* Vol Ratio */}
        <div className="bg-bg-3/50 rounded px-3 py-2.5">
          <div className="text-[9px] tracking-[0.1em] text-muted/50 mb-1">成交量比 (÷MA20)</div>
          <div className={`text-xl font-trading ${volColor}`}>
            {volRatio != null ? volRatio.toFixed(2) + "x" : "—"}
          </div>
          <div className="text-[10px] text-muted/50 mt-0.5">{volLabel}</div>
        </div>

        {/* 52W Position */}
        <div className="bg-bg-3/50 rounded px-3 py-2.5">
          <div className="text-[9px] tracking-[0.1em] text-muted/50 mb-1">52周位置</div>
          <div className="text-xl font-trading text-up">
            {weekPos52 != null ? weekPos52.toFixed(0) + "%" : "—"}
          </div>
          {weekPos52 != null && (
            <div className="mt-1.5 h-1 bg-border/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-up/70 rounded-full"
                style={{ width: `${weekPos52}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
