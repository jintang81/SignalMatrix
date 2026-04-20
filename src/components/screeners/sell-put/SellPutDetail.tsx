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

export function GlossaryPanel() {
  const [open, setOpen] = useState(false);
  const terms = [
    ["DTE", "到期天数 Days to Expiration — 合约剩余天数"],
    ["OTM%", "虚值程度 Out-of-the-money — 行权价低于现价的百分比"],
    ["IV", "隐含波动率 Implied Volatility"],
    ["HV", "历史波动率 Historical Volatility (20日年化)"],
    ["IV/HV", "IV 相对 HV 的倍数；>1.2 表示期权溢价高"],
    ["IVR", "IV Rank — 当前 IV 在过去 252 日区间中的百分位"],
    ["Delta", "期权价格对标的价格的敏感度；Put delta 为负"],
    ["Gamma", "Delta 变化速率；越高越危险"],
    ["Theta", "每日时间价值损耗；Sell Put 收益来源"],
    ["Vega", "IV 每变动 1% 的期权价格变化"],
    ["ATR", "平均真实波幅 Average True Range (14日)"],
    ["LRS", "强平线 Liquidation Risk Strike — 母标的跌破 MA200 时杠杆 ETF 的估算价格"],
    ["MA200", "200 日移动均线"],
    ["年化 ROI", "权利金 ÷ 占用保证金 × (365÷DTE)"],
    ["FOMC", "美联储利率决策会议"],
  ];
  return (
    <div className="panel">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <span className="text-[10px] tracking-widest text-muted/60">名词术语 GLOSSARY</span>
        <span className="text-muted/40 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {terms.map(([term, def]) => (
            <div key={term} className="flex gap-2 text-[10px]">
              <span className="font-trading text-gold/80 w-16 shrink-0">{term}</span>
              <span className="text-muted/60">{def}</span>
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

  // Display strategy: all in-range + up to 5 above + up to 3 below (matching HTML tool logic)
  const inRange    = g.candidates.filter(c => c.checks?.inRange);
  const aboveRange = g.candidates.filter(c => c.strike > g.targetHighStrike).slice(0, 5);
  const belowRange = g.candidates.filter(c => c.strike < g.targetLowStrike).slice(0, 3);
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
            <PassBadge pass={item.pass} />
            <div className="flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-[10px] font-trading text-txt/80">{item.name}</span>
                <span className="text-[9px] text-muted/40">{item.rule}</span>
              </div>
              <div className="text-[10px] font-trading text-muted/60">{item.value}</div>
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
