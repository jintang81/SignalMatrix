import Link from "next/link";

// ─── Data ─────────────────────────────────────────────────────────

type Screener = {
  id: string;
  name: string;
  nameZh: string;
  desc: string;
  tags: string[];
  href: string;
  available: boolean;
};

const BULL_SIGNAL: Screener[] = [
  {
    id: "bottom-divergence",
    name: "BOTTOM DIVERGENCE",
    nameZh: "底背离",
    desc: "价格创新低而 MACD DIFF 或 RSI 不创新低，捕捉潜在底部反转信号。",
    tags: ["MACD 背离", "RSI 背离", "底部反转"],
    href: "/screeners/bottom-divergence",
    available: true,
  },
  {
    id: "bottom-volume-surge",
    name: "BOTTOM VOLUME SURGE",
    nameZh: "底部放量",
    desc: "价格低位出现异常放量，配合技术形态判断主力建仓信号。",
    tags: ["成交量异常", "底部建仓", "放量突破"],
    href: "/screeners/bottom-volume-surge",
    available: true,
  },
  {
    id: "duck-bill",
    name: "DUCK BILL",
    nameZh: "正鸭嘴形态",
    desc: "MACD DIFF 超速上穿 DEA 形成正鸭嘴形态，全程零轴上方 — 趋势加速初期强势做多信号。",
    tags: ["MACD 形态", "趋势加速", "零轴上方", "多头排列"],
    href: "/screeners/duck-bill",
    available: true,
  },
];

const BEAR_SIGNAL: Screener[] = [
  {
    id: "top-divergence",
    name: "TOP DIVERGENCE",
    nameZh: "顶背离",
    desc: "价格创新高而 MACD 或 RSI 不创新高，识别潜在顶部做空/止盈信号。",
    tags: ["MACD 顶背离", "RSI 顶背离", "顶部反转"],
    href: "/screeners/top-divergence",
    available: true,
  },
  {
    id: "top-volume-surge",
    name: "TOP VOLUME SURGE",
    nameZh: "顶部放量",
    desc: "价格高位异常放量，判断主力出货与顶部信号。",
    tags: ["顶部放量", "主力出货", "成交量异常"],
    href: "/screeners/top-volume-surge",
    available: true,
  },
  {
    id: "inverted-duck-bill",
    name: "INVERTED DUCK BILL",
    nameZh: "倒鸭嘴形态",
    desc: "MACD DIFF 超速下穿 DEA 形成倒鸭嘴形态，全程零轴下方 — 趋势加速下行的空头信号。",
    tags: ["MACD 形态", "趋势加速", "零轴下方", "空头排列"],
    href: "/screeners/inverted-duck-bill",
    available: true,
  },
];

const OPTIONS_FLOW: Screener[] = [
  {
    id: "unusual-options",
    name: "UNUSUAL OPTIONS FLOW",
    nameZh: "异常期权信号",
    desc: "扫描期权异常成交量(Vol≥3×OI)并综合5个模型评分，识别机构暗注方向与隐含看涨/看跌信号。",
    tags: ["期权流", "异常成交", "机构方向", "Put/Call 比率"],
    href: "/screeners/unusual-options",
    available: true,
  },
];

const AI_STRATEGY: Screener[] = [
  {
    id: "ai-strategy",
    name: "AI STRATEGY",
    nameZh: "AI 综合策略",
    desc: "Claude AI 实时分析 SPY/QQQ/VIX 与板块数据，生成市场环境判断、推荐筛选器组合与详细操盘策略简报。",
    tags: ["Claude claude-opus-4-6", "市场环境", "筛选器推荐", "按需生成"],
    href: "/screeners/ai-strategy",
    available: true,
  },
];

// ─── Sub-components ───────────────────────────────────────────────

function ScreenerCard({ s, accent }: { s: Screener; accent: string }) {
  if (s.available) {
    return (
      <Link
        href={s.href}
        className="panel p-3 flex flex-col gap-1.5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
        style={{ ["--card-accent" as string]: accent }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-[11px] tracking-[0.12em]" style={{ color: accent }}>{s.name}</p>
              <span className="tag text-[9px]" style={{ color: accent, borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`, background: `color-mix(in srgb, ${accent} 8%, transparent)` }}>已上线</span>
            </div>
            <p className="text-[10px] text-muted/50 font-chinese">{s.nameZh}</p>
          </div>
          <span className="text-muted/30 mt-0.5">→</span>
        </div>
        <p className="text-[11px] text-muted/60 leading-relaxed">{s.desc}</p>
      </Link>
    );
  }
  return (
    <div className="panel p-3 flex flex-col gap-1.5 opacity-35 cursor-default">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[11px] tracking-[0.12em] text-muted">{s.name}</p>
          <span className="tag tag-muted text-[9px]">即将上线</span>
        </div>
        <p className="text-[10px] text-muted/50 font-chinese">{s.nameZh}</p>
      </div>
      <p className="text-[11px] text-muted/60 leading-relaxed">{s.desc}</p>
    </div>
  );
}

function Section({
  title,
  titleZh,
  accent,
  screeners,
}: {
  title: string;
  titleZh: string;
  accent: string;
  screeners: Screener[];
}) {
  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-5 rounded-full" style={{ background: accent }} />
        <div>
          <span className="text-[11px] tracking-[0.18em] font-trading" style={{ color: accent }}>
            {title}
          </span>
          <span className="text-[10px] text-muted/40 font-chinese ml-2">{titleZh}</span>
        </div>
        <div className="flex-1 h-px bg-border/40" />
      </div>
      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {screeners.map((s) => (
          <ScreenerCard key={s.id} s={s} accent={accent} />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────

export default function ScreeerPage() {
  return (
    <div className="py-3 space-y-3 min-h-[calc(100dvh-3.5rem)]">
      {/* Header */}
      <div className="panel p-3">
        <p className="text-sm tracking-[0.18em] text-muted mb-1">SCREENERS</p>
        <p className="text-xs text-muted/60">
          基于预定义信号逻辑的美股筛选器，每日定时扫描 · 支持盘中按需触发
        </p>
      </div>

      <Section
        title="BULL SIGNAL"
        titleZh="多头信号"
        accent="#00e676"
        screeners={BULL_SIGNAL}
      />
      <Section
        title="BEAR SIGNAL"
        titleZh="空头信号"
        accent="#ff1744"
        screeners={BEAR_SIGNAL}
      />
      <Section
        title="OPTIONS FLOW"
        titleZh="期权异常信号"
        accent="#4f9cf9"
        screeners={OPTIONS_FLOW}
      />
      <Section
        title="AI STRATEGY"
        titleZh="AI 综合策略"
        accent="#c9a84c"
        screeners={AI_STRATEGY}
      />
    </div>
  );
}
