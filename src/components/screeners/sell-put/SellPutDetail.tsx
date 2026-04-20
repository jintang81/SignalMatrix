"use client";

import { useState } from "react";
import { fmt, fmtSignedPct } from "@/lib/sellput/math";
import { scoreColor } from "@/lib/sellput/gates";
import { LEVERAGE_MAP } from "@/lib/sellput/constants";
import type {
  AnalysisResult,
  Gate0Result,
  Gate1Result,
  Gate2Result,
  Gate3Result,
  Gate4Result,
  Gate5Result,
  Reflection,
  ScoreBreakdown,
} from "@/lib/sellput/types";

// ─── Small helpers ────────────────────────────────────────────────────────

function PassBadge({ pass, critical }: { pass: boolean; critical?: boolean }) {
  if (pass) return <span className="tag tag-ok text-[9px]">通过</span>;
  if (critical) return <span className="tag tag-bad text-[9px]">阻断</span>;
  return <span className="tag tag-warn text-[9px]">未过</span>;
}

function SectionHeader({ num, title, pass, color = "#94a3b8" }: {
  num: string;
  title: string;
  pass?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span
        className="text-[10px] font-trading px-1.5 py-0.5 rounded border"
        style={{ borderColor: color + "50", color }}
      >
        {num}
      </span>
      <span className="text-[11px] tracking-wider text-txt/80">{title}</span>
      {pass !== undefined && (
        <span
          className="ml-auto text-[10px] font-trading"
          style={{ color: pass ? "#00e676" : "#ef5350" }}
        >
          {pass ? "✓ 通过" : "✗ 未通过"}
        </span>
      )}
    </div>
  );
}

// ─── Glossary ─────────────────────────────────────────────────────────────

type TermCard = { abbr: string; name: string; body: string };
type TermSection = { title: string; color: string; terms: TermCard[] };

const TERM_SECTIONS: TermSection[] = [
  {
    title: "期权基础术语",
    color: "#4f9cf9",
    terms: [
      {
        abbr: "Put",
        name: "若跌期权",
        body: "赋予持有人「以行权价卖出股票」权利的合约。Sell Put = 卖出这个权利，收取权利金，但承担在行权价买入股票的义务。",
      },
      {
        abbr: "OTM",
        name: "价外 Out-of-the-Money",
        body: "行权价低于当前股价的看跌期权。OTM% =（当前价 − 行权价）/ 当前价。选 OTM 越远，被行权概率越低，但权利金也更少。本工具目标区间通常在 7-15%。",
      },
      {
        abbr: "DTE",
        name: "到期天数 Days to Expiry",
        body: "合约距到期日的天数。本工具默认 21-45 天，是权利金时间价值衰减最快、风险相对可控的「黄金窗口」。",
      },
      {
        abbr: "权利金",
        name: "Premium",
        body: "卖出期权时收到的钱，即你的最大收益。买方支付给你的「保险费」，每张合约对应 100 股，所以权利金 × 100 = 实际收入。",
      },
      {
        abbr: "接货",
        name: "Assignment",
        body: "股价跌破行权价时被迫以行权价买入 100 股的事件。接货成本 = 行权价 − 已收权利金（比行权价低）。",
      },
      {
        abbr: "CSP",
        name: "现金担保卖Put",
        body: "开仓前在账户里备好「行权价 × 100」的现金，确保行权时有现金接货。本工具「保证金」就是这笔钱。",
      },
      {
        abbr: "GTC",
        name: "持续有效限价单",
        body: "不需要每天重复下单直到成交或取消。第五关止盈 / 止损单在开仓时同步挂出 GTC 单，不用每天盯。",
      },
    ],
  },
  {
    title: "波动率相关",
    color: "#a78bfa",
    terms: [
      {
        abbr: "IV",
        name: "隐含波动率 Implied Volatility",
        body: "市场「预期」未来这只股票的年化波动幅度，从期权价格反推出来。IV 高 = 期权贵 = 卖方多钱。本工具只接受下限（≥ 40%），不设上限。IV 极端偏高（> 150%）时可用，但建议缩小仓位。",
      },
      {
        abbr: "HV",
        name: "历史波动率 Historical Volatility",
        body: "股票过去（通常 20 日）的实际年化波动幅度，用对数收益的标准差计算。IV 是市场预期，HV 是历史事实。",
      },
      {
        abbr: "IV/HV",
        name: "波动率溢价比",
        body: "IV ÷ HV，≥ 1.0 说明市场对未来走势的定价比历史实际更动荡，卖方有「超额溢价」。低于 1.0 时工具会自动把行权价推得更远一些。",
      },
      {
        abbr: "IVR",
        name: "IV Rank IV排名",
        body: "当前 IV 在过去一年 IV 范围内的百分位。IVR = 70% 表示当前 IV 高于过去一年 70% 的时间，≥ 30% 才值得卖。本工具用历史 HV 序列近似计算。",
      },
      {
        abbr: "波动率衰减",
        name: "Volatility Decay",
        body: "杠杆 ETF 特有的长期成本。即使父资产横盘震荡，每日重置机制也会让杠杆 ETF 净值缓慢磨损。震荡中的 Put 最大敌之一。",
      },
    ],
  },
  {
    title: "期权 Greeks（数量化指标）",
    color: "#26a69a",
    terms: [
      {
        abbr: "Δ Delta",
        name: "价格敏感度",
        body: "标的每涨 $1，期权价格变化多少。Put 的 Delta 为负（-0 到 -1）。|Delta| = 0.25 ≈ 市场赌有 25% 概率被行权。本工具要求 |Δ| 在 0.15-0.35 之间。",
      },
      {
        abbr: "Γ Gamma",
        name: "Delta 变化速率",
        body: "期权参数中 Delta 的变化速率。Gamma 越大，期权价值变化越剧烈，风险越难控制。本工具要求 Gamma < 0.08。",
      },
      {
        abbr: "Θ Theta",
        name: "时间价值衰减",
        body: "每过一天，期权价值自然损失多少——对卖方来说是每天天赐的「零食」，这是卖方的「睡后收入」部分。本工具要求 |Θ| ≥ $0.03/股。",
      },
      {
        abbr: "年化 ROI",
        name: "年化收益率",
        body: "=（权利金 / 保证金）× DTE ÷ 365，把按短期 DTE 的合约收益折算成年化，便于跨不同 DTE 的合约横向比较。本工具要求 ≥ 12%。",
      },
    ],
  },
  {
    title: "技术分析术语",
    color: "#f0cc6e",
    terms: [
      {
        abbr: "ATR",
        name: "平均真实波幅 Average True Range",
        body: "过去 14 天每日最高价与最低价之差（含缺口）的平均值，反映当前的日内波动能力。ATR% = ATR ÷ 当前价。本工具「量化行权价远离基准」就参照它。",
      },
      {
        abbr: "MA200",
        name: "200 日均线",
        body: "过去 200 个交易日收盘价的算术平均线，被许多机构视为「牛熊分界线」。LRS 规则以父资产（如 QQQ）的 MA200 为触发条件。",
      },
      {
        abbr: "RSI",
        name: "相对强弱指数",
        body: "衡量近期涨幅 vs 跌幅的量能指标，范围 0-100。RSI > 75 说明近期短期超买，追高 Put 风险大。本工具要求 RSI ≤ 75。",
      },
      {
        abbr: "VIX",
        name: "恐慌指数",
        body: "标普 500 期权合成的市场整体波动率预期（「市场情绪温度计」）。VIX < 20 = 平静；20-35 = 担忧；> 35 = 恐慌。本工具在 VIX ≥ 35 时停止开仓。",
      },
    ],
  },
  {
    title: "本工具专有术语",
    color: "#c9a84c",
    terms: [
      {
        abbr: "LRS",
        name: "杠杆ETF规则强制清仓线",
        body: "部分券商规定：当父资产（如 QQQ）日线收盘跌破 MA200，必须强制卖出 TQQQ。所以行权价如果和 LRS 触发价相近，被行权就会发现货立即被卖出，行权价要和 LRS 强发的该 ETF 价格至少保持 3% 距离。",
      },
      {
        abbr: "父资产",
        name: "Underlying Parent",
        body: "杠杆 ETF 跟踪的指数或股票。TQQQ 的父资产是 QQQ（纳斯达克 100），SOXL 是 SOXX（半导体指数），NVDL 是 NVDA，TSLL 是 TSLA。估值和 MA200 都参考父资产。",
      },
      {
        abbr: "基准OTM",
        name: "Base OTM Distance",
        body: "行权价与现价之间应持有的最短距离，用 ATR × 乘数 × √(DTE/30) 计算，在事件加宽和 IV/HV 保守加宽后，得到最终目标 OTM 区间。",
      },
      {
        abbr: "Gap Down",
        name: "跳空低开",
        body: "当出现重大突发消息，第二天开盘价直接比前一天收盘低很多。止损规则的「次日开盘平仓」在这种情况下的损失会远大于预想的，成交价会远低于预期。",
      },
      {
        abbr: "接货/成本基础",
        name: "Cost Basis",
        body: "被行权后持有 ETF 的真实成本 = 行权价 − 已收权利金。比行权价低一点，是你真正「以多少钱买入」这批 ETF。",
      },
    ],
  },
];

export function GlossaryPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <span className="text-[11px] tracking-widest text-muted/60">📘 策略说明 &amp; 术语速查（点击展开）</span>
        <span className="text-muted/40 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-3 pb-4 space-y-4">

          {/* ── Strategy intro ── */}
          <div className="rounded border p-3" style={{ background: "rgba(79,156,249,0.05)", borderColor: "rgba(79,156,249,0.2)" }}>
            <p className="text-[11px] font-bold text-txt mb-2">🔹 SELL PUT 是什么？</p>
            <p className="text-[10px] text-muted/80 leading-relaxed mb-2">
              <strong className="text-txt">Sell Put（卖出若跌期权）</strong>是一种通过收取权利金来赚钱的策略。
              你向买方承诺：「如果到期日这只股票跌到 X 价格以下，我愿意以 X 价格买入 100 股。」
            </p>
            <div className="space-y-1.5 text-[10px] text-muted/70 leading-relaxed">
              <p>
                <span className="text-gold font-bold">收益结构</span>：如果股价没跌到行权价，期权作废，你白拿权利金 ✅；
                如果股价跌破行权价，你被迫以行权价接货（但扣掉权利金后实际成本更低）。
              </p>
              <p>
                <span className="text-gold font-bold">为什么用杠杆 ETF？</span>
                TQQQ / SOXL / NVDL 这类 3× 杠杆 ETF 的隐含波动率（IV）极高，意味着卖出的期权权利金很贵，
                年化收益率往往远超普通股票。代价是杠杆 ETF 带来的额外风险（见第五关风险反思）。
              </p>
              <p>
                <span className="text-gold font-bold">本工具做什么？</span>
                逐层检查「现在适不适合开仓」，并在筛选合约中找出最符合条件的那一张。
              </p>
            </div>
          </div>

          {/* ── Term sections ── */}
          {TERM_SECTIONS.map(section => (
            <div key={section.title}>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: section.color }}
                />
                <span
                  className="text-[10px] font-bold tracking-wider"
                  style={{ color: section.color }}
                >
                  {section.title}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {section.terms.map(t => (
                  <div
                    key={t.abbr}
                    className="rounded border p-2"
                    style={{ background: "var(--color-bg-3)", borderColor: section.color + "25" }}
                  >
                    <div className="flex items-baseline gap-1.5 mb-1 flex-wrap">
                      <span
                        className="text-[10px] font-trading font-bold"
                        style={{ color: section.color }}
                      >
                        {t.abbr}
                      </span>
                      <span className="text-[9px] text-muted/50">{t.name}</span>
                    </div>
                    <p className="text-[9px] text-muted/60 leading-relaxed">{t.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────

function DetailHeader({ r }: { r: AnalysisResult }) {
  const color = scoreColor(r.score);
  return (
    <div className="panel p-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xl font-trading font-bold text-txt">{r.ticker}</span>
            {r.parentTicker !== r.ticker && (
              <span className="text-sm text-muted/50 font-trading">/ {r.parentTicker}</span>
            )}
          </div>
          <div className="flex gap-4 text-[10px] font-trading text-muted/60 flex-wrap">
            <span>现价 <span className="text-txt">${fmt(r.currentPrice)}</span></span>
            <span>母标的 <span className="text-txt">${fmt(r.parentPrice)}</span></span>
            <span>MA200 <span className={r.parentMA200Dist >= 0 ? "text-up" : "text-dn"}>
              {fmtSignedPct(r.parentMA200Dist)}
            </span></span>
            <span>DTE <span className="text-txt">{r.chosenDTE}d</span></span>
            <span>到期 <span className="text-txt">{r.chosenExpDate || "—"}</span></span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-4xl font-trading font-bold" style={{ color }}>{r.score}</div>
          <div className="text-[9px] tracking-widest text-muted/40">SCORE</div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="mt-3 flex gap-2 flex-wrap">
        {r.breakdown.map((b: ScoreBreakdown) => (
          <div key={b.name} className="bg-bg-3 rounded px-2 py-1 text-[9px]">
            <span className="text-muted/50">{b.name} </span>
            <span className="font-trading text-gold">{b.val}</span>
            <span className="text-muted/30">/{b.max}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Gate 0 ───────────────────────────────────────────────────────────────

function Gate0Panel({ g }: { g: Gate0Result }) {
  const color =
    g.status === "green" ? "#00e676" :
    g.status === "yellow" ? "#f0cc6e" :
    g.status === "red" ? "#ef5350" : "#94a3b8";

  return (
    <div className="panel p-3">
      <SectionHeader num="G0" title="估值 · Valuation" color={color} />
      <p className="text-[10px] text-muted/70 mb-2">{g.message}</p>
      {g.canEvaluate && (
        <div className="flex gap-4 text-[10px] font-trading flex-wrap">
          {g.currentPE != null && (
            <span>当前 P/E ({g.peType === "forward" ? "FORWARD" : "TRAILING"}) <span style={{ color }}>{fmt(g.currentPE, 1)}</span></span>
          )}
          {g.medianPE != null && (
            <span>5年中位 <span className="text-txt">{fmt(g.medianPE, 1)}</span></span>
          )}
          {g.threshold13x != null && (
            <span>红线阈值 (1.3×) <span className="text-txt">{fmt(g.threshold13x, 1)}</span></span>
          )}
          {g.ratio != null && (
            <span>当前/中位 <span style={{ color }}>{fmt(g.ratio, 2)}×</span></span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Gate 1 ───────────────────────────────────────────────────────────────

function Gate1Panel({ g }: { g: Gate1Result }) {
  const failedNames = g.items.filter(i => !i.pass).map(i => i.name);
  return (
    <div className="panel p-3">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[10px] font-trading px-1.5 py-0.5 rounded border"
          style={{ borderColor: "#4f9cf950", color: "#4f9cf9" }}
        >
          G1
        </span>
        <span className="text-[11px] tracking-wider text-txt/80">市场环境 · Market Environment</span>
        <span
          className="ml-auto text-[10px] font-trading"
          style={{ color: g.pass ? "#00e676" : "#ef5350" }}
        >
          {g.pass ? "✓ 通过" : `失败 (${failedNames.join(", ")})`}
        </span>
      </div>
      <p className="text-[9px] text-muted/50 mb-2">目标: 确认当前环境对卖方基本安全。过关只代表可以继续，不代表这是特别好的时机。</p>
      <div className="space-y-1.5">
        {g.items.map(item => {
          const sym = item.pass ? "✓" : item.critical ? "✗" : "⚠";
          const clr = item.pass ? "#00e676" : item.critical ? "#ef5350" : "#f0cc6e";
          return (
            <div key={item.name}>
              <div className="flex items-baseline gap-2">
                <span className="text-[11px]" style={{ color: clr }}>{sym}</span>
                <span className="text-[11px] font-trading" style={{ color: clr }}>{item.name}</span>
                <span className="text-[9px] text-muted/40">{item.rule}</span>
              </div>
              <div className="ml-5 text-[10px] font-trading" style={{ color: clr }}>{item.value}</div>
              {item.note && (
                <div className="ml-5 text-[10px] text-muted/50 italic mt-0.5">
                  <span className="mr-1">💡</span>{item.note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Gate 2 ───────────────────────────────────────────────────────────────

function Gate2Panel({ g, expDate }: { g: Gate2Result; expDate: string }) {
  return (
    <div className="panel p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-trading px-1.5 py-0.5 rounded border" style={{ borderColor: "#a78bfa50", color: "#a78bfa" }}>G2</span>
        <span className="text-[11px] tracking-wider text-txt/80">事件日历 ({expDate} 前)</span>
        {g.hasBlocker
          ? <span className="tag tag-bad text-[9px] ml-auto">今日禁建仓</span>
          : g.totalOTM > 0
          ? <span className="tag tag-warn text-[9px] ml-auto">OTM +{g.totalOTM}%</span>
          : <span className="tag tag-ok text-[9px] ml-auto">今日可开仓</span>}
      </div>
      <p className="text-[9px] text-muted/50 mb-2">OTM 调整取最大值 (不叠加), 上限 +4%</p>

      {/* Explanation notice */}
      <div className="rounded border px-2.5 py-2 mb-2 text-[9px]" style={{ background: "rgba(96,165,250,0.06)", borderColor: "rgba(96,165,250,0.25)", color: "#60a5fa" }}>
        <p className="font-bold mb-1">两类规则，检查窗口不同</p>
        <p className="text-muted/60 leading-relaxed">
          · <strong className="text-bear">禁建仓 (Blocker)</strong>：只看今天是否处于 NVDA/父资产财报 ±1日，或 CPI/PCE/非农 发布日 —— 只限制今天开新仓。<br />
          · <strong className="text-gold">OTM 加宽</strong>：看整个今天→到期日窗口内是否有重大事件 —— 持仓期内有大事件就应该把行权价推得更远留出缓冲。
        </p>
      </div>

      {/* Blocker status */}
      {g.blockers.length > 0 ? (
        <div className="mb-2 space-y-1">
          {g.blockers.map((b, i) => (
            <div key={i} className="rounded border px-2.5 py-1.5 text-[10px]" style={{ background: "rgba(255,23,68,0.06)", borderColor: "rgba(255,23,68,0.25)" }}>
              <span className="text-bear font-bold">{b.date}</span>
              <span className="text-muted/60 ml-2">{b.msg}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border px-2.5 py-1.5 mb-2 text-[10px]" style={{ background: "rgba(0,230,118,0.06)", borderColor: "rgba(0,230,118,0.25)", color: "#00e676" }}>
          ✓ 今天不处于任何禁建仓时间点，可以开新仓
        </div>
      )}

      {/* OTM events */}
      {g.details.length > 0 && (
        <>
          <p className="text-[10px] text-txt/70 font-bold mb-1.5">持仓期内 OTM 加宽事件 (影响行权价选择)</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {g.details.map((d, i) => (
              <span
                key={i}
                className="text-[9px] font-trading px-1.5 py-0.5 rounded border"
                style={{
                  background: "var(--color-bg-3)",
                  borderColor: d.type === "earn" ? "rgba(96,165,250,0.4)" : "rgba(167,139,250,0.4)",
                  color: d.type === "earn" ? "#60a5fa" : "#a78bfa",
                }}
              >
                {d.date} · {d.label} (+{d.boost}%)
              </span>
            ))}
          </div>
        </>
      )}

      {g.details.length === 0 && g.blockers.length === 0 && (
        <p className="text-[10px] text-muted/40">到期日窗口内无已知 OTM 加宽事件</p>
      )}

      {/* Resonance warning */}
      {g.resonanceDates?.length > 0 && (
        <div className="rounded border px-2.5 py-1.5 text-[10px]" style={{ background: "rgba(255,23,68,0.06)", borderColor: "rgba(255,23,68,0.25)", color: "#ef5350" }}>
          🚨 事件共振警告: {g.resonanceDates[0].date} 单日叠加了 {g.resonanceDates[0].count} 个高风险事件。&quot;取最大值&quot;规则可能低估三事件叠加的共振冲击，建议当日提前平仓或滚仓，而非只调整 OTM 距离。
        </div>
      )}
    </div>
  );
}

// ─── Gate 3 ───────────────────────────────────────────────────────────────

function Gate3Panel({ result }: { result: AnalysisResult }) {
  const g = result.gate3;
  const gate1 = result.gate1;
  const gate2 = result.gate2;

  // Display strategy: all in-range + up to 5 above (closest to range) + up to 3 below (closest to range)
  // candidates are sorted HIGH→LOW, so:
  //   aboveRange.slice(-5)  = last 5 = LOWEST above-range = closest to target from above  ✓
  //   belowRange.slice(0,3) = first 3 = HIGHEST below-range = closest to target from below ✓
  const inRange    = g.candidates.filter(c => c.checks?.inRange);
  const aboveRange = g.candidates.filter(c => (c.strike ?? 0) > g.targetHighStrike).slice(-5);
  const belowRange = g.candidates.filter(c => (c.strike ?? 0) < g.targetLowStrike).slice(0, 3);
  const displaySet = new Set([...aboveRange, ...inRange, ...belowRange].map(c => c.strike));
  const displayCands = g.candidates.filter(c => displaySet.has(c.strike));

  const leverage = Math.abs(LEVERAGE_MAP[result.ticker] || 1);

  const chk = (b: boolean) => (
    <span style={{ color: b ? "#00e676" : "#ef5350" }}>{b ? "✓" : "✗"}</span>
  );

  const lrsColor = (dist: number | undefined) => {
    if (dist == null) return "#94a3b8";
    if (dist > 0.05) return "#00e676";
    if (dist > 0) return "#f0cc6e";
    return "#ef5350";
  };

  return (
    <div className="panel p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] font-trading px-1.5 py-0.5 rounded border" style={{ borderColor: "#26a69a50", color: "#26a69a" }}>G3</span>
        <span className="text-[11px] tracking-wider text-txt/80">参数选择 · Contract Selection</span>
        <span className={`tag ${g.bestCandidate ? "tag-ok" : "tag-warn"} text-[9px] ml-auto`}>
          {g.bestCandidate ? "已找到最佳合约" : "无符合全部条件的合约"}
        </span>
      </div>
      <p className="text-[9px] text-muted/50 mb-3">量化基准OTM = ATR% × 乘数 × √(DTE/30), 替代主观的&quot;强势6-8%&quot;</p>

      {/* OTM calculation */}
      <div className="rounded border p-2.5 mb-3" style={{ background: "rgba(26,166,154,0.04)", borderColor: "rgba(26,166,154,0.2)" }}>
        <p className="text-[10px] font-trading text-txt/60 mb-2">📐 OTM 区间计算</p>
        <div className="space-y-1.5">
          {([
            ["ATR% (14日)",    g.atrPct != null ? `${(g.atrPct * 100).toFixed(2)}%` : "—"],
            ["入场模式乘数",    `× ${g.multiplier}`],
            ["DTE 缩放",       `× ${g.dteScale.toFixed(3)} (√${result.chosenDTE}/30)`],
            ["基准 OTM",       `${(g.baseOTM * 100).toFixed(2)}%`],
            ["+ 第二关事件调整", `+${gate2.totalOTM.toFixed(1)}%`],
            ["+ IV/HV 保守加宽", `+${gate1.ivHvExtraOTM.toFixed(1)}%`],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between text-[10px] font-trading">
              <span className="text-muted/50">{k}</span>
              <span className="text-txt/80">{v}</span>
            </div>
          ))}
        </div>
        <div className="border-t mt-2 pt-2 space-y-1" style={{ borderColor: "rgba(26,166,154,0.2)" }}>
          <div className="flex items-baseline justify-between text-[10px] font-trading">
            <span className="text-muted/50">目标 OTM 区间</span>
            <span className="font-bold text-gold-2">{(g.finalOTMLow * 100).toFixed(1)}% - {(g.finalOTMHigh * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-baseline justify-between text-[10px] font-trading">
            <span className="text-muted/50">目标行权价区间</span>
            <span className="font-bold text-gold-2">${fmt(g.targetLowStrike)} - ${fmt(g.targetHighStrike)}</span>
          </div>
        </div>
      </div>

      {/* LRS Triangle */}
      <div className="rounded border p-2.5 mb-3" style={{ background: "rgba(167,139,250,0.04)", borderColor: "rgba(167,139,250,0.2)" }}>
        <p className="text-[10px] font-trading text-txt/60 mb-2">🔺 行权价 · 接货价 · LRS 强平价 三角关系</p>
        <div className="space-y-1.5">
          {([
            [`当前 ${result.ticker}`,           `$${fmt(result.currentPrice)}`],
            [`${result.parentTicker} 当前价`,    `$${fmt(result.parentPrice)}`],
            [`${result.parentTicker} MA200`,     `$${fmt(result.parentMA200)} (距 ${fmtSignedPct(result.parentMA200Dist)})`],
            ["杠杆倍数",                          `× ${leverage}`],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between text-[10px] font-trading">
              <span className="text-muted/50">{k}</span>
              <span className="text-txt/80">{v}</span>
            </div>
          ))}
        </div>
        <div className="border-t mt-2 pt-2" style={{ borderColor: "rgba(167,139,250,0.2)" }}>
          <div className="flex items-baseline justify-between text-[10px] font-trading mb-1">
            <span style={{ color: "#f0cc6e" }}>估计 {result.ticker} @ {result.parentTicker}MA200</span>
            <span style={{ color: "#f0cc6e" }}>${fmt(g.estETFAtParentMA200)}</span>
          </div>
          <p className="text-[9px] text-muted/50 leading-relaxed">
            ⚠️ 如果 {result.parentTicker} 跌到 MA200, LRS 规则强制平仓 {result.ticker}, 参考价约 ${fmt(g.estETFAtParentMA200)}。行权价必须高于此价至少 3% 才安全。
          </p>
        </div>
      </div>

      {/* Candidates table */}
      {g.candidates.length > 0 ? (
        <>
          <p className="text-[10px] font-trading text-txt/70 mb-1.5">
            📋 候选合约
            <span className="text-[9px] font-normal text-muted/50 ml-1.5">
              目标区间 ${fmt(g.targetLowStrike)} - ${fmt(g.targetHighStrike)} 全部展示，上下各附若干对比行
            </span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[9px] font-trading min-w-[600px]">
              <thead>
                <tr className="text-muted/40 border-b" style={{ borderColor: "rgba(46,58,80,0.5)" }}>
                  <th className="text-left py-1.5 px-1.5">行权价</th>
                  <th className="text-right py-1.5 px-1.5">OTM%</th>
                  <th className="text-right py-1.5 px-1.5">Δ</th>
                  <th className="text-right py-1.5 px-1.5">Γ</th>
                  <th className="text-right py-1.5 px-1.5">θ</th>
                  <th className="text-right py-1.5 px-1.5">中间价</th>
                  <th className="text-right py-1.5 px-1.5">年化ROI</th>
                  <th className="text-right py-1.5 px-1.5">OI</th>
                  <th className="text-right py-1.5 px-1.5">距LRS</th>
                  <th className="text-right py-1.5 px-1.5">区间/Δ/Γ/θ/ROI/流动/LRS</th>
                </tr>
              </thead>
              <tbody>
                {displayCands.map((c, i) => {
                  const isBest   = g.bestCandidate?.strike === c.strike;
                  const isInRange = c.checks?.inRange;
                  const ck = c.checks;
                  const lrsDist = c.strikeToLRSDist;
                  const lrsCl   = lrsColor(lrsDist);
                  return (
                    <tr
                      key={i}
                      className="border-b"
                      style={{
                        borderColor: "rgba(46,58,80,0.3)",
                        background: isBest ? "rgba(0,230,118,0.06)" : isInRange ? "rgba(26,166,154,0.04)" : "transparent",
                      }}
                    >
                      <td className="py-1.5 px-1.5 font-bold text-txt">
                        ${fmt(c.strike)}
                        {isBest    && <span className="tag tag-ok   text-[8px] ml-1">推荐</span>}
                        {!isBest && isInRange && <span className="tag tag-info text-[8px] ml-1">目标区间</span>}
                      </td>
                      <td className="text-right py-1.5 px-1.5 text-txt/80">{c.otmPct != null ? (c.otmPct * 100).toFixed(2) + "%" : "—"}</td>
                      <td className="text-right py-1.5 px-1.5 text-muted/70">{c.greeks?.delta != null ? fmt(c.greeks.delta, 3) : "—"}</td>
                      <td className="text-right py-1.5 px-1.5 text-muted/70">{c.greeks?.gamma != null ? fmt(c.greeks.gamma, 3) : "—"}</td>
                      <td className="text-right py-1.5 px-1.5 text-muted/70">{c.greeks?.theta != null ? fmt(c.greeks.theta, 2) : "—"}</td>
                      <td className="text-right py-1.5 px-1.5 text-gold">${fmt(c.mid ?? c.last)}</td>
                      <td className="text-right py-1.5 px-1.5 text-bull">{c.annualROI != null ? (c.annualROI * 100).toFixed(1) + "%" : "—"}</td>
                      <td className="text-right py-1.5 px-1.5 text-muted/60">{c.open_interest ?? c.openInterest ?? "—"}</td>
                      <td className="text-right py-1.5 px-1.5 font-bold" style={{ color: lrsCl }}>
                        {lrsDist != null ? (lrsDist * 100).toFixed(1) + "%" : "—"}
                      </td>
                      <td className="text-right py-1.5 px-1.5">
                        {ck ? (
                          <span className="space-x-0.5">
                            {chk(ck.inRange)}{chk(ck.deltaOk)}{chk(ck.gammaOk)}
                            {chk(ck.thetaOk)}{chk(ck.annualOk)}{chk(ck.liquidityOk)}{chk(ck.lrsSafe)}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-[10px] text-bear/70">无候选合约</p>
      )}
    </div>
  );
}

// ─── Gate 4 ───────────────────────────────────────────────────────────────

function Gate4Panel({ g }: { g: Gate4Result }) {
  return (
    <div className="panel p-3">
      <SectionHeader num="G4" title="执行检查 · Execution" color="#f0cc6e" />
      <div className="space-y-1.5 mb-3">
        {g.items.map(item => (
          <div key={item.name} className="flex items-start gap-2">
            <span
              className="text-[15px] leading-none shrink-0 w-5 text-center mt-0.5"
              style={{ color: item.pass ? "#00e676" : "#ef5350" }}
            >
              {item.pass ? "✓" : "✗"}
            </span>
            <div className="flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span
                  className="text-[10px] font-trading"
                  style={{ color: item.pass ? "#e2e8f0" : "#ef5350" }}
                >
                  {item.name}
                </span>
                <span className="text-[9px] text-muted/40">{item.rule}</span>
              </div>
              <div
                className="text-[10px] font-trading"
                style={{ color: item.pass ? "#94a3b8" : "#ef5350cc" }}
              >
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-[10px] font-trading flex-wrap">
        <span>保证金 <span className="text-txt">${g.margin.toFixed(0)}</span></span>
        <span>张数 <span className="text-txt">{g.contractsByCash}</span></span>
        <span>限价单 <span className="text-gold">${fmt(g.limitPrice)}</span></span>
      </div>
    </div>
  );
}

// ─── Gate 5 ───────────────────────────────────────────────────────────────

function Gate5Panel({ g }: { g: Gate5Result }) {
  const typeColor = { ok: "#00e676", warn: "#f0cc6e", bad: "#ef5350" };
  return (
    <div className="panel p-3">
      <SectionHeader num="G5" title="仓位管理 · Position Management" color="#94a3b8" />
      <div className="flex gap-4 text-[10px] font-trading mb-3 flex-wrap">
        <span>止盈价 <span className="text-bull">${fmt(g.profitClosePrice)}</span></span>
        <span>止损价 <span className="text-bear">${fmt(g.stopLossPrice)}</span></span>
      </div>
      <div className="space-y-2">
        {g.rules.map(rule => (
          <div key={rule.num} className="bg-bg-3 rounded p-2">
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="text-[9px] font-trading px-1 rounded"
                style={{
                  background: typeColor[rule.type] + "20",
                  color: typeColor[rule.type],
                }}
              >
                {rule.num}
              </span>
              <span className="text-[10px] text-txt/80">{rule.title}</span>
            </div>
            <div className="text-[9px] text-muted/50 mb-0.5">触发: {rule.trigger}</div>
            <div className="text-[9px] text-muted/70">处理: {rule.action}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reflections ──────────────────────────────────────────────────────────

function ReflectionsPanel({ reflections }: { reflections: Reflection[] }) {
  if (!reflections.length) return null;
  const levelColor = { bad: "#ef5350", warn: "#f0cc6e", info: "#4f9cf9" };
  const levelTag   = { bad: "tag-bad", warn: "tag-warn", info: "tag-info" };
  return (
    <div className="panel p-3">
      <SectionHeader num="⚠" title="风险提示 · Risk Reflections" color="#ef5350" />
      <div className="space-y-2">
        {reflections.map((r, i) => (
          <div
            key={i}
            className="rounded p-2"
            style={{ background: levelColor[r.level] + "10", borderLeft: `2px solid ${levelColor[r.level]}50` }}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`tag ${levelTag[r.level]} text-[9px]`}>
                {r.level === "bad" ? "高风险" : r.level === "warn" ? "警告" : "提示"}
              </span>
              <span className="text-[10px] font-trading text-txt/80">{r.title}</span>
            </div>
            <p className="text-[10px] text-muted/60">{r.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────

export default function SellPutDetail({ result }: { result: AnalysisResult }) {
  return (
    <div className="space-y-2">
      <DetailHeader r={result} />
      <Gate0Panel g={result.gate0} />
      <Gate1Panel g={result.gate1} />
      <Gate2Panel g={result.gate2} expDate={result.chosenExpDate} />
      <Gate3Panel result={result} />
      {result.gate4 && <Gate4Panel g={result.gate4} />}
      {result.gate5 && <Gate5Panel g={result.gate5} />}
      <ReflectionsPanel reflections={result.reflections} />
    </div>
  );
}
