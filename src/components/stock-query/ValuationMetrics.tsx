import type { YFSummaryModule } from "@/types";
import { raw, formatNum, formatLargeNum } from "@/lib/utils";

interface ValuationMetricsProps {
  summary: YFSummaryModule;
  price?: number;
}

export default function ValuationMetrics({ summary, price }: ValuationMetricsProps) {
  const ks = summary.defaultKeyStatistics;
  const sd = summary.summaryDetail;
  const fd = summary.financialData;

  const pe = raw(sd?.trailingPE);
  const fpe = raw(sd?.forwardPE);
  const pb = raw(ks?.priceToBook);
  const ps = raw(ks?.priceToSalesTrailingTwelveMonths);
  const eps = raw(ks?.trailingEps);
  const feps = raw(ks?.forwardEps);
  const peg = raw(ks?.pegRatio);
  const ev = raw(ks?.enterpriseValue);
  const evrev = raw(ks?.enterpriseToRevenue);
  const eveb = raw(ks?.enterpriseToEbitda);
  const beta = raw(ks?.beta);
  const bv = raw(ks?.bookValue);

  function peColor(v: number | null) {
    if (v == null) return "";
    if (v < 0) return "text-dn";
    if (v < 15) return "text-up";
    if (v > 50) return "text-dn";
    return "text-txt";
  }

  return (
    <div className="panel p-5">
      <p className="text-[10px] tracking-[0.18em] text-muted/60 mb-3">// VALUATION</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { k: "P/E (TTM)", v: pe != null ? pe.toFixed(1) : "—", cls: peColor(pe), sub: `预期: ${fpe != null ? fpe.toFixed(1) : "—"}` },
          { k: "P/B", v: pb != null ? pb.toFixed(2) : "—", cls: "", sub: `P/S: ${ps != null ? ps.toFixed(2) : "—"}` },
          { k: "EPS (TTM)", v: eps != null ? "$" + eps.toFixed(2) : "—", cls: eps != null ? (eps > 0 ? "text-up" : "text-dn") : "", sub: `预期: ${feps != null ? "$" + feps.toFixed(2) : "—"}` },
          { k: "PEG", v: peg != null ? peg.toFixed(2) : "—", cls: peg != null ? (peg < 1 ? "text-up" : peg > 2 ? "text-dn" : "") : "", sub: `EV/EBITDA: ${eveb != null ? eveb.toFixed(1) : "—"}` },
          { k: "Enterprise Value", v: formatLargeNum(ev), cls: "", sub: `EV/Revenue: ${evrev != null ? evrev.toFixed(2) : "—"}` },
          { k: "Beta", v: beta != null ? beta.toFixed(2) : "—", cls: beta != null && Math.abs(beta) > 1.5 ? "text-gold" : "", sub: `账面价值/股: ${bv != null ? "$" + bv.toFixed(2) : "—"}` },
        ].map(({ k, v, cls, sub }) => (
          <div key={k} className="bg-bg-3/50 rounded px-3 py-2.5">
            <div className="text-[9px] tracking-[0.1em] uppercase text-muted/50 mb-1">{k}</div>
            <div className={`text-base font-trading leading-tight ${cls || "text-txt"}`}>{v}</div>
            <div className="text-[10px] text-muted/50 mt-0.5 font-trading">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
