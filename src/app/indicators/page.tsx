import Link from "next/link";

const INDICATORS = [
  {
    id: "supertrend",
    name: "PIVOT POINT SUPERTREND",
    nameZh: "枢轴点超级趋势",
    desc: "结合枢轴高/低点与 ATR 动态止损，识别趋势方向与买卖信号",
    tags: ["趋势追踪", "ATR 动态止损", "枢轴支撑阻力", "买卖标注"],
    href: "/indicators/supertrend",
    available: true,
  },
  {
    id: "liucaishenlong",
    name: "MCDX SMART MONEY",
    nameZh: "六彩神龙",
    desc: "庄家/游资/散户资金追踪，RSI 多周期分层识别主力控盘与游资动向",
    tags: ["庄家能量", "游资追踪", "RSI 多周期", "资金分层"],
    href: "/indicators/liucaishenlong",
    available: true,
  },
  {
    id: "gmma",
    name: "GMMA+",
    nameZh: "顾比移动均线+",
    desc: "短期与长期 EMA 组合，判断趋势强度与机构介入时机",
    tags: ["短/长期 EMA", "趋势强度", "机构介入"],
    href: "/indicators/gmma",
    available: true,
  },
  {
    id: "composite",
    name: "COMPOSITE CHART",
    nameZh: "综合技术指标图表",
    desc: "多指标叠加综合图表：K线 + MACD + RSI + KDJ + 布林带 + SuperTrend + GMMA，支持滚轮缩放与拖动平移",
    tags: ["多指标叠加", "缩放平移", "MACD", "RSI", "KDJ", "布林带", "SuperTrend", "GMMA"],
    href: "/indicators/composite",
    available: true,
  },
];

export default function IndicatorsPage() {
  return (
    <div className="py-6 space-y-4 min-h-[calc(100dvh-3.5rem)]">
      <div className="panel p-5">
        <p className="text-sm tracking-[0.18em] text-muted mb-1">INDICATORS</p>
        <p className="text-xs text-muted/60">
          纯前端技术指标工具，通过 Cloudflare Worker 代理调用 Yahoo Finance
        </p>
      </div>

      {/* Composite Chart — full-width row */}
      {INDICATORS.filter((ind) => ind.id === "composite").map((ind) => (
        <Link
          key={ind.id}
          href={ind.href}
          className="panel p-5 flex flex-col gap-3 cursor-pointer transition-all duration-300 hover:border-gold/50 hover:bg-gold/[0.03] hover:shadow-[0_0_20px_rgba(201,168,76,0.08)]"
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm tracking-[0.12em] text-gold">{ind.name}</p>
            </div>
            <p className="text-[11px] text-txt/70 font-chinese">{ind.nameZh}</p>
          </div>
          <p className="text-xs text-muted/70 leading-relaxed">{ind.desc}</p>
          <div className="flex flex-wrap gap-1.5">
            {ind.tags.map((t) => (
              <span key={t} className="tag tag-muted text-[9px]">
                {t}
              </span>
            ))}
          </div>
        </Link>
      ))}

      {/* Other indicators — 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {INDICATORS.filter((ind) => ind.id !== "composite").map((ind) =>
          ind.available ? (
            <Link
              key={ind.id}
              href={ind.href}
              className="panel p-5 flex flex-col gap-3 cursor-pointer transition-all duration-300 hover:border-gold/50 hover:bg-gold/[0.03] hover:shadow-[0_0_20px_rgba(201,168,76,0.08)]"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm tracking-[0.12em] text-gold">{ind.name}</p>
                </div>
                <p className="text-[11px] text-txt/70 font-chinese">{ind.nameZh}</p>
              </div>
              <p className="text-xs text-muted/70 leading-relaxed flex-1">{ind.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {ind.tags.map((t) => (
                  <span key={t} className="tag tag-muted text-[9px]">
                    {t}
                  </span>
                ))}
              </div>
            </Link>
          ) : (
            <div
              key={ind.id}
              className="panel p-5 flex flex-col gap-3 opacity-50"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm tracking-[0.12em] text-gold">{ind.name}</p>
                  <span className="tag tag-muted text-[9px]">即将上线</span>
                </div>
                <p className="text-[11px] text-txt/70 font-chinese">{ind.nameZh}</p>
              </div>
              <p className="text-xs text-muted/70 leading-relaxed flex-1">{ind.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {ind.tags.map((t) => (
                  <span key={t} className="tag tag-muted text-[9px]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
