import type { YFSummaryModule } from "@/types";
import { raw, formatNum, formatLargeNum } from "@/lib/utils";

interface DividendOwnershipProps {
  summary: YFSummaryModule;
}

export default function DividendOwnership({ summary }: DividendOwnershipProps) {
  const sd = summary.summaryDetail;
  const ks = summary.defaultKeyStatistics;

  const dyRaw = raw(sd?.trailingAnnualDividendYield) ?? raw(sd?.dividendYield);
  const dr = raw(sd?.dividendRate);
  const pr = raw(sd?.payoutRatio);
  const exDiv = raw(sd?.exDividendDate);
  const inst = raw(ks?.heldPercentInstitutions);
  const insider = raw(ks?.heldPercentInsiders);
  const floatShares = raw(ks?.floatShares);
  const sharesOut = raw(ks?.sharesOutstanding);
  const shortPct = raw(ks?.shortPercentOfFloat);

  const exDivStr = exDiv
    ? new Date(exDiv * 1000).toISOString().slice(0, 10)
    : "—";

  const hasDividend = dyRaw != null && dyRaw > 0;

  return (
    <div className="panel p-5">
      <p className="text-[10px] tracking-[0.18em] text-muted/60 mb-3">// DIVIDEND & OWNERSHIP</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          {
            k: "股息率",
            v: hasDividend ? (dyRaw! * 100).toFixed(2) + "%" : "无股息",
            cls: hasDividend ? "text-up" : "text-muted/50",
            sub: `年息: ${dr != null ? "$" + dr.toFixed(2) : "—"}`,
          },
          {
            k: "派息比率",
            v: pr != null ? (pr * 100).toFixed(1) + "%" : "—",
            cls: "",
            sub: `除息日: ${exDivStr}`,
          },
          {
            k: "机构持股",
            v: inst != null ? (inst * 100).toFixed(1) + "%" : "—",
            cls: "text-up",
            sub: `内部人: ${insider != null ? (insider * 100).toFixed(1) + "%" : "—"}`,
          },
          {
            k: "流通股本",
            v: formatLargeNum(floatShares)?.replace("$", "") ?? "—",
            cls: "",
            sub: `总股本: ${formatLargeNum(sharesOut)?.replace("$", "") ?? "—"}`,
          },
          {
            k: "空头比率 (Float)",
            v: shortPct != null ? (shortPct * 100).toFixed(1) + "%" : "—",
            cls: shortPct != null && shortPct > 0.15 ? "text-dn" : "",
            sub: "",
          },
        ].map(({ k, v, cls, sub }) => (
          <div key={k} className="bg-bg-3/50 rounded px-3 py-2.5">
            <div className="text-[9px] tracking-[0.1em] uppercase text-muted/50 mb-1">{k}</div>
            <div className={`text-base font-trading leading-tight ${cls || "text-txt"}`}>{v}</div>
            {sub && <div className="text-[10px] text-muted/50 mt-0.5 font-trading">{sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
