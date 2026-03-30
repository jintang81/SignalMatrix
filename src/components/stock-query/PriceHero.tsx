import type { YFQuoteResult } from "@/types";
import { formatPrice, formatLargeNum, formatVol } from "@/lib/utils";

interface PriceHeroProps {
  quote: YFQuoteResult;
}

export default function PriceHero({ quote }: PriceHeroProps) {
  const {
    symbol,
    longName,
    shortName,
    regularMarketPrice: price,
    regularMarketChange: chg,
    regularMarketChangePercent: chgPct,
    regularMarketOpen,
    regularMarketDayHigh,
    regularMarketDayLow,
    regularMarketPreviousClose,
    regularMarketVolume,
    marketCap,
    fiftyTwoWeekLow,
    fiftyTwoWeekHigh,
    preMarketPrice,
    preMarketChangePercent,
    postMarketPrice,
    postMarketChangePercent,
    fullExchangeName,
    sector,
    currency,
  } = quote;

  const isUp = chg >= 0;
  const chgClass = isUp ? "text-up" : "text-dn";

  // 52-week position 0–100
  const pos52 =
    fiftyTwoWeekLow != null && fiftyTwoWeekHigh != null && fiftyTwoWeekHigh > fiftyTwoWeekLow
      ? Math.min(100, Math.max(0, ((price - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow)) * 100))
      : null;

  return (
    <div className="panel overflow-hidden">
      {/* ── Top row: identity + price ── */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border/60">
        {/* Identity */}
        <div className="p-5 lg:min-w-[200px] lg:max-w-[240px]">
          <div className="text-3xl font-trading text-up tracking-wider leading-none">{symbol}</div>
          <div className="text-xs text-muted mt-1.5 leading-snug line-clamp-2">
            {longName || shortName}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {fullExchangeName && (
              <span className="tag tag-muted text-[10px]">{fullExchangeName}</span>
            )}
            {sector && <span className="tag tag-muted text-[10px]">{sector}</span>}
            {currency && <span className="tag tag-gold text-[10px]">{currency}</span>}
          </div>
        </div>

        {/* Price */}
        <div className="p-5 flex-1">
          <div className={`text-5xl font-trading leading-none ${chgClass}`}>
            ${price.toFixed(2)}
          </div>
          <div className={`flex items-center gap-3 mt-2 font-trading text-base ${chgClass}`}>
            <span>
              {isUp ? "▲" : "▼"} {chg >= 0 ? "+" : ""}{chg.toFixed(2)}
            </span>
            <span>
              {chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%
            </span>
          </div>
          {/* Pre/after market */}
          {(preMarketPrice || postMarketPrice) && (
            <div className="flex gap-4 mt-2 text-xs text-muted/70 font-trading">
              {preMarketPrice && (
                <span>
                  盘前 ${preMarketPrice.toFixed(2)}{" "}
                  <span className={preMarketChangePercent != null && preMarketChangePercent >= 0 ? "text-up" : "text-dn"}>
                    {preMarketChangePercent != null
                      ? (preMarketChangePercent >= 0 ? "+" : "") + preMarketChangePercent.toFixed(2) + "%"
                      : ""}
                  </span>
                </span>
              )}
              {postMarketPrice && (
                <span>
                  盘后 ${postMarketPrice.toFixed(2)}{" "}
                  <span className={postMarketChangePercent != null && postMarketChangePercent >= 0 ? "text-up" : "text-dn"}>
                    {postMarketChangePercent != null
                      ? (postMarketChangePercent >= 0 ? "+" : "") + postMarketChangePercent.toFixed(2) + "%"
                      : ""}
                  </span>
                </span>
              )}
            </div>
          )}

          {/* 52-week bar */}
          {pos52 != null && fiftyTwoWeekLow != null && fiftyTwoWeekHigh != null && (
            <div className="mt-4">
              <div className="flex justify-between text-[10px] font-trading mb-1">
                <span className="text-dn">${fiftyTwoWeekLow.toFixed(2)}</span>
                <span className="text-muted/50">52周区间</span>
                <span className="text-up">${fiftyTwoWeekHigh.toFixed(2)}</span>
              </div>
              <div className="relative h-1 bg-border rounded-full">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${pos52}%`, background: "linear-gradient(90deg, #26a69a40, #26a69a)" }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-up border-2 border-bg"
                  style={{ left: `calc(${pos52}% - 5px)`, boxShadow: "0 0 5px #26a69a80" }}
                />
              </div>
              <div className="text-center text-[10px] font-trading text-up/80 mt-1">
                {pos52.toFixed(0)}% 位置
              </div>
            </div>
          )}
        </div>

        {/* OHLCV + Market Cap grid */}
        <div className="lg:min-w-[240px] grid grid-cols-2 divide-x divide-border/60">
          {[
            ["开盘", formatPrice(regularMarketOpen)],
            ["昨收", formatPrice(regularMarketPreviousClose)],
            ["今高", formatPrice(regularMarketDayHigh)],
            ["今低", formatPrice(regularMarketDayLow)],
            ["成交量", formatVol(regularMarketVolume)],
            ["市值", formatLargeNum(marketCap)],
          ].map(([label, value], i) => (
            <div key={i} className="px-4 py-3 border-b border-border/60 last:border-b-0 [&:nth-last-child(2)]:border-b-0">
              <div className="text-[9px] tracking-[0.1em] uppercase text-muted/60 mb-1">{label}</div>
              <div className="text-sm font-trading text-txt">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
