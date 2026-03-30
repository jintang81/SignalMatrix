import type { YFSummaryModule, YFProfileModule } from "@/types";
import { raw, formatPrice } from "@/lib/utils";

interface AnalystRatingsProps {
  summary: YFSummaryModule;
  profile: YFProfileModule;
  currentPrice: number;
}

export default function AnalystRatings({ summary, profile, currentPrice }: AnalystRatingsProps) {
  const fd = summary.financialData;
  const trend = profile.recommendationTrend?.trend?.[0];
  const ratingKey = fd?.recommendationKey;
  const target = raw(fd?.targetMeanPrice);
  const targetHigh = raw(fd?.targetHighPrice);
  const targetLow = raw(fd?.targetLowPrice);
  const numAnalysts = raw(fd?.numberOfAnalystOpinions);

  const sb = trend?.strongBuy ?? 0;
  const bu = trend?.buy ?? 0;
  const ho = trend?.hold ?? 0;
  const se = trend?.sell ?? 0;
  const ss = trend?.strongSell ?? 0;
  const total = sb + bu + ho + se + ss || 1;

  const upside = target != null ? ((target - currentPrice) / currentPrice) * 100 : null;

  const ratingLabel: Record<string, string> = {
    "strong_buy": "STRONG BUY",
    "buy": "BUY",
    "hold": "HOLD",
    "underperform": "UNDERPERFORM",
    "sell": "SELL",
  };
  const ratingClass: Record<string, string> = {
    "strong_buy": "text-bull",
    "buy": "text-up",
    "hold": "text-gold",
    "underperform": "text-dn",
    "sell": "text-bear",
  };

  const label = ratingKey ? (ratingLabel[ratingKey] ?? ratingKey.toUpperCase()) : "N/A";
  const cls = ratingKey ? (ratingClass[ratingKey] ?? "text-muted") : "text-muted";

  return (
    <div className="panel p-5">
      <p className="text-[10px] tracking-[0.18em] text-muted/60 mb-3">// ANALYST RATINGS</p>

      <div className="flex items-start gap-5">
        {/* Rating */}
        <div className="shrink-0">
          <div className={`text-2xl font-trading leading-none ${cls}`}>{label}</div>
          {numAnalysts != null && (
            <div className="text-[10px] text-muted/50 mt-1">{numAnalysts} 位分析师</div>
          )}
        </div>

        {/* Target + bar */}
        <div className="flex-1 min-w-0">
          {target != null && (
            <div className="text-xs text-muted/70 mb-2 flex flex-wrap gap-x-3 gap-y-1">
              <span>
                目标价{" "}
                <span className="text-gold font-trading">{formatPrice(target)}</span>
              </span>
              <span className="text-muted/40">
                {formatPrice(targetLow)} ~ {formatPrice(targetHigh)}
              </span>
              {upside != null && (
                <span className={upside >= 0 ? "text-up" : "text-dn"}>
                  {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% 空间
                </span>
              )}
            </div>
          )}

          {/* Analyst bar */}
          <div className="h-1.5 flex rounded-full overflow-hidden">
            <div style={{ width: `${(sb / total) * 100}%`, background: "#16a34a" }} />
            <div style={{ width: `${(bu / total) * 100}%`, background: "#4ade80" }} />
            <div style={{ width: `${(ho / total) * 100}%`, background: "#475569" }} />
            <div style={{ width: `${(se / total) * 100}%`, background: "#f87171" }} />
            <div style={{ width: `${(ss / total) * 100}%`, background: "#dc2626" }} />
          </div>
          <div className="flex justify-between text-[9px] text-muted/50 mt-1 font-trading">
            <span>强买 {sb}</span>
            <span>买入 {bu}</span>
            <span>持有 {ho}</span>
            <span>减持 {se}</span>
            <span>强卖 {ss}</span>
          </div>
        </div>
      </div>

      {/* Earnings date */}
      {summary.summaryDetail?.earningsTimestamp && (
        <div className="mt-3 pt-3 border-t border-border/40 text-[10px] text-muted/60 font-trading">
          下次财报:{" "}
          <span className="text-gold">
            {new Date(summary.summaryDetail.earningsTimestamp * 1000).toISOString().slice(0, 10)}
          </span>
        </div>
      )}
    </div>
  );
}
