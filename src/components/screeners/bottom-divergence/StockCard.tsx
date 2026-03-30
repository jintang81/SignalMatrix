import type { DivergenceStock } from "@/types";
import DivergenceChart from "./DivergenceChart";

interface Props {
  stock: DivergenceStock;
}

export default function StockCard({ stock: s }: Props) {
  const isBoth   = s.triggered.length === 2;
  const hasMacd  = s.triggered.includes("MACD");
  const hasRsi   = s.triggered.includes("RSI");
  const det      = hasMacd ? s.details.macd : s.details.rsi;
  const isUp     = s.pct_change >= 0;

  return (
    <div
      className={`panel overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 ${
        isBoth ? "border-gold/30 hover:border-gold/60" : "hover:border-up/40"
      }`}
    >
      {/* Top: ticker + price */}
      <div className="flex items-start justify-between px-4 pt-3 pb-2.5 border-b border-border/50">
        <div>
          <span className="text-lg font-bold text-txt font-trading tracking-wide">
            {s.ticker}
          </span>
          <p className="text-[10px] text-muted/50 font-trading mt-0.5">
            市值 {s.mktcap_b != null ? `${s.mktcap_b}B USD` : "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold text-up font-trading">${s.price}</p>
          <p className={`text-xs font-trading mt-0.5 ${isUp ? "text-up" : "text-dn"}`}>
            {isUp ? "+" : ""}{s.pct_change.toFixed(2)}%
          </p>
          <p className="text-[10px] text-muted/50 font-trading mt-0.5">
            RSI {s.rsi_latest}
          </p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-border/40">
        {isBoth && (
          <span className="tag text-[9px] border-gold/40 text-gold bg-gold/5">
            ⭐ 双重背离
          </span>
        )}
        {hasMacd && (
          <span className="tag text-[9px]" style={{ borderColor: "rgba(167,139,250,0.4)", color: "#a78bfa", background: "rgba(167,139,250,0.06)" }}>
            MACD 背离
          </span>
        )}
        {hasRsi && (
          <span className="tag text-[9px] border-up/40 text-up bg-up/5">
            RSI 背离
          </span>
        )}
        {s.vol_ratio >= 1.5 && (
          <span className="tag tag-up text-[9px]">
            🔺 放量 {s.vol_ratio}x
          </span>
        )}
        {s.is_etf && (
          <span className="tag tag-muted text-[9px]">ETF</span>
        )}
      </div>

      {/* Divergence data rows */}
      {hasMacd && s.details.macd && (
        <DivRow
          label="MACD"
          d={s.details.macd}
          indicColor="#a78bfa"
          indicFmt={(v) => v.toFixed(4)}
        />
      )}
      {hasRsi && s.details.rsi && (
        <DivRow
          label="RSI"
          d={s.details.rsi}
          indicColor="#26a69a"
          indicFmt={(v) => v.toFixed(1)}
        />
      )}

      {/* Chart */}
      <DivergenceChart
        chart={s.chart}
        macdDetail={s.details.macd}
        rsiDetail={s.details.rsi}
      />

      {/* Footer */}
      <div className="flex gap-4 px-4 py-2 border-t border-border/40 text-[10px] font-trading text-muted/60">
        <span>
          成交量比 <span className="text-muted/90">{s.vol_ratio}x</span>
        </span>
        {det && (
          <span>
            第二底距今{" "}
            <span className="text-muted/90">
              {det.bars_ago === 0 ? "今日" : `${det.bars_ago} 天前`}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Divergence data row ──────────────────────────────────────────

function DivRow({
  label,
  d,
  indicColor,
  indicFmt,
}: {
  label: string;
  d: import("@/types").DivergenceDetail;
  indicColor: string;
  indicFmt: (v: number) => string;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 px-4 py-1.5 border-b border-border/30 text-[10px] font-trading">
      <span className="text-muted/40 w-8">{label}</span>
      <span>
        底1 <span className="text-muted/80">${d.price_b1}</span>
      </span>
      <span>
        底2 <span className="text-dn">${d.price_b2}</span>
      </span>
      <span>
        {label}底1{" "}
        <span style={{ color: indicColor }}>{indicFmt(d.indic_b1)}</span>
      </span>
      <span>
        {label}底2{" "}
        <span className="text-up">{indicFmt(d.indic_b2)}</span>
      </span>
      <span>
        间距 <span className="text-muted/80">{d.gap_bars}根</span>
      </span>
      <span>
        跌幅 <span className="text-dn">{d.price_drop_pct}%</span>
      </span>
    </div>
  );
}
