"use client";

import type { OvernightMarketEnv } from "@/types";

interface Props {
  env: OvernightMarketEnv;
}

export default function MarketEnvBadge({ env }: Props) {
  const isBull    = env.signal === "bull";
  const isUnknown = env.signal === "unknown";

  const color = isBull
    ? "var(--color-bull)"
    : isUnknown
    ? "var(--color-muted)"
    : "var(--color-bear)";

  const label = isBull
    ? "牛市环境 — 策略适用"
    : isUnknown
    ? "大盘数据暂不可用"
    : "非牛市环境 — 信号仅供参考，谨慎操作";

  const spxPct =
    env.spx_ma20 > 0
      ? (((env.spx_price - env.spx_ma20) / env.spx_ma20) * 100).toFixed(1)
      : "—";

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-trading"
      style={{
        borderColor: `${color}40`,
        background: `${color}0d`,
      }}
    >
      {/* indicator dot */}
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />

      {/* text */}
      <span style={{ color }}>{label}</span>

      {/* SPX detail */}
      {!isUnknown && (
        <span className="ml-auto text-muted/60 text-[11px] shrink-0">
          SPX {env.spx_price.toLocaleString()} &nbsp;|&nbsp; MA20 {env.spx_ma20.toLocaleString()}&nbsp;
          <span style={{ color }}>
            ({isBull ? "+" : ""}{spxPct}%)
          </span>
        </span>
      )}
    </div>
  );
}
