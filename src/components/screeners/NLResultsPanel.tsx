import type { NLSearchResult, NLStock } from "@/types";

// ─── Formatters ───────────────────────────────────────────────────

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtCap(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(0)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

function fmtPE(v: number | null | undefined): string {
  if (v == null || v <= 0) return "—";
  return v.toFixed(1);
}

function peColor(v: number | null | undefined): string {
  if (v == null || v <= 0) return "#94a3b8";
  if (v < 15) return "#26a69a";
  if (v > 35) return "#ef5350";
  return "#94a3b8";
}

// ─── Filter badge label ───────────────────────────────────────────

function filterLabel(key: string, value: unknown): string {
  const labels: Record<string, string> = {
    sector: "行业",
    industry: "细分",
    market_cap_min: "市值≥",
    market_cap_max: "市值≤",
    pe_ratio_min: "PE≥",
    pe_ratio_max: "PE≤",
    pb_ratio_min: "PB≥",
    pb_ratio_max: "PB≤",
    revenue_growth_min: "营收增长≥",
    revenue_growth_max: "营收增长≤",
    profit_margin_min: "利润率≥",
    profit_margin_max: "利润率≤",
    debt_to_equity_max: "D/E≤",
    dividend_yield_min: "股息≥",
    week52_position_min: "52w位置≥",
    roe_min: "ROE≥",
  };
  const label = labels[key] ?? key;
  // Format percentage-like values
  const pctKeys = new Set([
    "revenue_growth_min", "revenue_growth_max",
    "profit_margin_min", "profit_margin_max",
    "dividend_yield_min", "roe_min", "week52_position_min",
  ]);
  // Format market cap
  if (key === "market_cap_min" || key === "market_cap_max") {
    return `${label}${fmtCap(value as number)}`;
  }
  if (pctKeys.has(key)) {
    return `${label}${((value as number) * 100).toFixed(0)}%`;
  }
  return `${label}${value}`;
}

// ─── Stock row ────────────────────────────────────────────────────

function StockRow({ stock }: { stock: NLStock }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/20 last:border-0
                    hover:bg-bg-2/60 transition-colors px-1 rounded">
      {/* Ticker + name */}
      <div className="w-24 shrink-0">
        <p className="text-[12px] font-trading text-txt">{stock.ticker}</p>
        <p className="text-[9px] text-muted/50 truncate font-chinese">{stock.name}</p>
      </div>

      {/* Sector + industry */}
      <div className="flex-1 min-w-0 hidden sm:block">
        <p className="text-[10px] text-muted/60 font-chinese truncate">{stock.sector ?? "—"}</p>
        <p className="text-[9px] text-muted/35 font-chinese truncate">{stock.industry ?? ""}</p>
      </div>

      {/* Market cap */}
      <div className="w-16 text-right shrink-0">
        <p className="text-[11px] font-trading text-muted/70">{fmtCap(stock.market_cap)}</p>
        <p className="text-[9px] text-muted/30">市值</p>
      </div>

      {/* PE */}
      <div className="w-12 text-right shrink-0">
        <p className="text-[11px] font-trading" style={{ color: peColor(stock.pe_ratio) }}>
          {fmtPE(stock.pe_ratio)}
        </p>
        <p className="text-[9px] text-muted/30">PE</p>
      </div>

      {/* Revenue growth */}
      <div className="w-16 text-right shrink-0">
        <p className={`text-[11px] font-trading ${
          stock.revenue_growth != null && stock.revenue_growth > 0 ? "text-up" : "text-dn"
        }`}>
          {fmtPct(stock.revenue_growth)}
        </p>
        <p className="text-[9px] text-muted/30">营收增长</p>
      </div>

      {/* Profit margin */}
      <div className="w-16 text-right shrink-0 hidden md:block">
        <p className={`text-[11px] font-trading ${
          stock.profit_margin != null && stock.profit_margin > 0 ? "text-up" : "text-muted/50"
        }`}>
          {fmtPct(stock.profit_margin)}
        </p>
        <p className="text-[9px] text-muted/30">利润率</p>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────

interface Props {
  result: NLSearchResult;
}

export default function NLResultsPanel({ result }: Props) {
  const filterEntries = Object.entries(result.filters);

  return (
    <div className="panel p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] tracking-widest text-gold/70">◈ AI 筛选结果</span>
            {result.display_name && (
              <span className="tag tag-gold text-[9px]">{result.display_name}</span>
            )}
          </div>
          <p className="text-[11px] text-muted/70 font-chinese leading-relaxed max-w-2xl">
            {result.reasoning}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-trading text-txt leading-none">{result.total_matched}</p>
          <p className="text-[10px] text-muted/40">S&amp;P 500 匹配</p>
        </div>
      </div>

      {/* Active filter badges */}
      {filterEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filterEntries.map(([k, v]) => (
            <span key={k} className="tag tag-muted text-[9px] font-trading">
              {filterLabel(k, v)}
            </span>
          ))}
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 text-[10px] text-muted/30 font-trading flex-wrap">
        <span>基本面数据: {result.fundamentals_date}</span>
        <span>·</span>
        <span>{result.scan_time}</span>
      </div>

      {/* Stock list */}
      {result.stocks.length === 0 ? (
        <p className="text-[11px] text-muted/50 text-center py-6 font-chinese">
          没有找到符合条件的股票，请尝试放宽筛选条件
        </p>
      ) : (
        <div>
          {result.stocks.map((stock) => (
            <StockRow key={stock.ticker} stock={stock} />
          ))}
        </div>
      )}
    </div>
  );
}
