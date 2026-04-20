"use client";

import { useState } from "react";
import { fmt, fmtPct, fmtSignedPct } from "@/lib/sellput/math";
import { scoreColor } from "@/lib/sellput/gates";
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
      <div className="space-y-1">
        {g.items.map(item => {
          const sym = item.pass ? "✓" : item.critical ? "✗" : "⚠";
          const symColor = item.pass ? "#00e676" : item.critical ? "#ef5350" : "#f0cc6e";
          const nameColor = item.pass ? "#00e676" : item.critical ? "#ef5350" : "#f0cc6e";
          return (
            <div key={item.name}>
              <div className="flex items-baseline gap-2">
                <span className="text-[11px]" style={{ color: symColor }}>{sym}</span>
                <span className="text-[11px] font-trading" style={{ color: nameColor }}>{item.name}</span>
              </div>
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

function Gate2Panel({ g }: { g: Gate2Result }) {
  const pass = !g.hasBlocker;
  return (
    <div className="panel p-3">
      <SectionHeader
        num="G2"
        title="事件日历 · Event Calendar"
        pass={pass}
        color="#a78bfa"
      />

      {g.blockers.length > 0 && (
        <div className="mb-2 space-y-1">
          {g.blockers.map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <span className="tag tag-bad text-[9px]">阻断</span>
              <span className="font-trading text-bear/80">{b.date}</span>
              <span className="text-muted/60">{b.msg}</span>
            </div>
          ))}
        </div>
      )}

      {g.details.length > 0 && (
        <div className="space-y-1">
          {g.details.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <span className="tag tag-warn text-[9px]">事件</span>
              <span className="font-trading text-muted/60">{d.date}</span>
              <span className="text-muted/70">{d.label}</span>
              {d.boost > 0 && (
                <span className="text-gold/60">+{(d.boost * 100).toFixed(0)}% OTM</span>
              )}
            </div>
          ))}
        </div>
      )}

      {g.totalOTM > 0 && (
        <div className="mt-2 text-[10px] font-trading">
          <span className="text-muted/50">事件 OTM 附加: </span>
          <span className="text-gold">{(g.totalOTM * 100).toFixed(1)}%</span>
        </div>
      )}

      {g.details.length === 0 && g.blockers.length === 0 && (
        <p className="text-[10px] text-muted/40">到期日前无已知重大事件</p>
      )}
    </div>
  );
}

// ─── Gate 3 ───────────────────────────────────────────────────────────────

function Gate3Panel({ g }: { g: Gate3Result }) {
  const best = g.bestCandidate;
  return (
    <div className="panel p-3">
      <SectionHeader num="G3" title="合约筛选 · Contract Selection" color="#26a69a" />

      {/* OTM calculation */}
      <div className="flex gap-3 flex-wrap text-[10px] font-trading mb-3">
        <span>基础 OTM <span className="text-txt">{(g.baseOTM * 100).toFixed(1)}%</span></span>
        <span>乘数 <span className="text-txt">{g.multiplier.toFixed(2)}×</span></span>
        <span>DTE 系数 <span className="text-txt">{g.dteScale.toFixed(2)}</span></span>
        <span className="text-gold">
          目标区间 [{(g.finalOTMLow * 100).toFixed(1)}%, {(g.finalOTMHigh * 100).toFixed(1)}%]
        </span>
        {g.atrPct != null && (
          <span>ATR <span className="text-txt">{(g.atrPct * 100).toFixed(2)}%</span></span>
        )}
      </div>

      {/* Best candidate */}
      {best ? (
        <div className="bg-bg-3 rounded p-2 mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="tag tag-ok text-[9px]">最优合约</span>
            <span className="font-trading text-txt">Strike ${fmt(best.strike)}</span>
            {best.expiration && (
              <span className="text-[9px] text-muted/40">{best.expiration}</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-trading">
            <div>
              <div className="text-muted/40 mb-0.5">OTM%</div>
              <div className="text-txt">{best.otmPct != null ? fmt(best.otmPct * 100, 1) + "%" : "—"}</div>
            </div>
            <div>
              <div className="text-muted/40 mb-0.5">Mid</div>
              <div className="text-gold">${fmt(best.mid ?? best.last)}</div>
            </div>
            <div>
              <div className="text-muted/40 mb-0.5">年化 ROI</div>
              <div className="text-bull">{best.annualROI != null ? fmt(best.annualROI * 100, 1) + "%" : "—"}</div>
            </div>
            <div>
              <div className="text-muted/40 mb-0.5">Delta</div>
              <div>{best.greeks?.delta != null ? fmt(best.greeks.delta, 3) : "—"}</div>
            </div>
            <div>
              <div className="text-muted/40 mb-0.5">Gamma</div>
              <div>{best.greeks?.gamma != null ? fmt(best.greeks.gamma, 4) : "—"}</div>
            </div>
            <div>
              <div className="text-muted/40 mb-0.5">Theta</div>
              <div>{best.greeks?.theta != null ? fmt(best.greeks.theta, 3) : "—"}</div>
            </div>
            <div>
              <div className="text-muted/40 mb-0.5">Vega</div>
              <div>{best.greeks?.vega != null ? fmt(best.greeks.vega, 3) : "—"}</div>
            </div>
            <div>
              <div className="text-muted/40 mb-0.5">OI</div>
              <div>{best.open_interest ?? "—"}</div>
            </div>
          </div>

          {/* Check badges */}
          {best.checks && (
            <div className="flex gap-1 flex-wrap mt-2">
              {Object.entries(best.checks).map(([k, v]) => (
                <span
                  key={k}
                  className="text-[9px] px-1 py-0.5 rounded"
                  style={{
                    background: v ? "#00e67615" : "#ef535015",
                    color: v ? "#00e676" : "#ef5350",
                  }}
                >
                  {k}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-bear/70 mb-3">无满足条件的合约</p>
      )}

      {/* Candidates table */}
      {g.candidates.length > 1 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] font-trading min-w-[420px]">
            <thead>
              <tr className="text-muted/40 border-b border-border/30">
                <th className="text-left py-1 px-1">Strike</th>
                <th className="text-left py-1 px-1">OTM%</th>
                <th className="text-left py-1 px-1">Mid</th>
                <th className="text-left py-1 px-1">年化ROI</th>
                <th className="text-left py-1 px-1">Delta</th>
                <th className="text-left py-1 px-1">OI</th>
                <th className="text-left py-1 px-1">通过</th>
              </tr>
            </thead>
            <tbody>
              {g.candidates.slice(0, 10).map((c, i) => (
                <tr
                  key={i}
                  className={`border-b border-border/15 ${
                    c === best ? "bg-up/5" : ""
                  }`}
                >
                  <td className="py-1 px-1 text-txt">${fmt(c.strike)}</td>
                  <td className="py-1 px-1">{c.otmPct != null ? fmt(c.otmPct * 100, 1) + "%" : "—"}</td>
                  <td className="py-1 px-1 text-gold">${fmt(c.mid ?? c.last)}</td>
                  <td className="py-1 px-1 text-bull">{c.annualROI != null ? fmt(c.annualROI * 100, 1) + "%" : "—"}</td>
                  <td className="py-1 px-1">{c.greeks?.delta != null ? fmt(c.greeks.delta, 3) : "—"}</td>
                  <td className="py-1 px-1 text-muted/60">{c.open_interest ?? "—"}</td>
                  <td className="py-1 px-1">{c.qualifyCount ?? 0}/7</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      <Gate2Panel g={result.gate2} />
      <Gate3Panel g={result.gate3} />
      {result.gate4 && <Gate4Panel g={result.gate4} />}
      {result.gate5 && <Gate5Panel g={result.gate5} />}
      <ReflectionsPanel reflections={result.reflections} />
    </div>
  );
}
