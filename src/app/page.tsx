"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const [q, setQ] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = q.trim().toUpperCase();
    if (sym) router.push(`/stock-query?q=${sym}`);
  };

  return (
    <div className="py-6 space-y-4 min-h-[calc(100dvh-3.5rem)]">
      {/* ── Top row: Stock Query + Options Flow ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="panel p-5">
          <p className="text-sm tracking-[0.18em] text-muted mb-1">STOCK QUERY</p>
          <p className="text-xs text-muted/60 mb-3">输入美股代码，查看基本信息、AI 综合评分与最新新闻</p>
          <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="输入美股代码，如 AAPL"
              className="flex-1 bg-bg-3 border border-border rounded px-3 py-1.5 text-xs font-trading text-txt placeholder:text-muted/40 focus:outline-none focus:border-gold/50"
            />
            <button type="submit" className="btn text-xs px-3 py-1.5">
              QUERY →
            </button>
          </form>
        </section>

        <Link href="/screeners/unusual-options" className="panel p-5 block hover:border-[#4f9cf9]/40 hover:bg-[#4f9cf9]/[0.02] transition-all duration-200">
          <p className="text-sm tracking-[0.18em] mb-1" style={{ color: "#4f9cf9" }}>◈ OPTIONS FLOW</p>
          <p className="text-xs text-muted/60 mb-3">扫描期权异常成交量，识别机构暗注方向与隐含看涨/看跌信号</p>
          <div className="flex flex-wrap gap-2">
            {["异常成交量", "Put/Call 比率", "机构方向"].map((name) => (
              <span key={name} className="tag tag-muted">{name}</span>
            ))}
          </div>
        </Link>
      </div>

      {/* ── Indicators ── */}
      <section className="panel p-5">
        <Link href="/indicators" className="block">
          <p className="text-sm tracking-[0.18em] text-muted mb-1 hover:text-gold transition-colors">INDICATORS</p>
        </Link>
        <p className="text-xs text-muted/60 mb-3">纯前端技术指标工具，通过 Cloudflare Worker 代理调用 Yahoo Finance</p>
        <div className="flex flex-wrap gap-2">
          {[
            { name: "综合图表", href: "/indicators/composite" },
            { name: "SUPERTREND", href: "/indicators/supertrend" },
            { name: "六彩神龙", href: "/indicators/liucaishenlong" },
            { name: "GMMA+", href: "/indicators/gmma" },
          ].map(({ name, href }) => (
            <Link key={name} href={href}>
              <span className="tag tag-gold cursor-pointer hover:bg-gold/20 transition-colors">{name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Bull Signal */}
      <section className="panel p-5">
        <p className="text-sm tracking-[0.18em] text-bull mb-1">● BULL SIGNAL</p>
        <p className="text-xs text-muted/60 mb-3">检测多头信号，寻找潜在做多机会</p>
        <div className="flex flex-wrap gap-2">
          {[
            { name: "底背离",   href: "/screeners/bottom-divergence" },
            { name: "底部放量", href: "/screeners/bottom-volume-surge" },
            { name: "正鸭嘴",   href: "/screeners/duck-bill" },
          ].map(({ name, href }) => (
            <Link key={name} href={href}>
              <span className="tag tag-up cursor-pointer hover:bg-bull/20 transition-colors">{name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Bear Signal */}
      <section className="panel p-5">
        <p className="text-sm tracking-[0.18em] text-bear mb-1">● BEAR SIGNAL</p>
        <p className="text-xs text-muted/60 mb-3">检测空头信号，识别潜在下行风险</p>
        <div className="flex flex-wrap gap-2">
          {[
            { name: "顶背离",   href: "/screeners/top-divergence" },
            { name: "顶部放量", href: "/screeners/top-volume-surge" },
            { name: "倒鸭嘴",   href: "/screeners/inverted-duck-bill" },
          ].map(({ name, href }) => (
            <Link key={name} href={href}>
              <span className="tag tag-dn cursor-pointer hover:bg-bear/20 transition-colors">{name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* AI Strategy */}
      <Link href="/screeners/ai-strategy" className="panel p-5 block hover:border-gold/40 hover:bg-gold/[0.02] transition-all duration-200">
        <div className="flex items-center gap-3 mb-1">
          <p className="text-sm tracking-[0.18em] text-gold">◈ AI STRATEGY</p>
          <span className="tag tag-muted">每日更新</span>
        </div>
        <p className="text-xs text-muted/60 mb-3">
          根据 SPY / QQQ 趋势、VIX 恐慌指数、板块轮动，AI 自动推荐当前市场环境下最优的 Bull 或 Bear 筛选组合
        </p>
        <div className="flex flex-wrap gap-2">
          {["市场环境感知", "策略推荐", "推荐理由"].map((name) => (
            <span key={name} className="tag tag-gold">
              {name}
            </span>
          ))}
          <span className="tag tag-muted">Claude API (Anthropic)</span>
        </div>
      </Link>
    </div>
  );
}
