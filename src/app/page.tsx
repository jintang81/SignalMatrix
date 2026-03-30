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
      {/* ── Stock Query ── */}
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
          {["底背离", "底部放量", "正鸭嘴", "异常期权信号"].map((name) => (
            <span key={name} className="tag tag-up">
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* Bear Signal */}
      <section className="panel p-5">
        <p className="text-sm tracking-[0.18em] text-bear mb-1">● BEAR SIGNAL</p>
        <p className="text-xs text-muted/60 mb-3">检测空头信号，识别潜在下行风险</p>
        <div className="flex flex-wrap gap-2">
          {["顶背离", "顶部放量", "倒鸭嘴"].map((name) => (
            <span key={name} className="tag tag-dn">
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* AI Strategy */}
      <section className="panel p-5">
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
      </section>
    </div>
  );
}
