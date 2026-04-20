import { PARENT_MAP } from "./constants";
import {
  calcATR,
  calcHV,
  calcIVRank,
  calcSMA,
  calcTrendStrength,
  estimateGreeks,
  generateMockPuts,
} from "./math";
import {
  runGate0,
  runGate1,
  runGate2,
  runGate3,
  runGate4,
  runGate5,
  runRiskReflections,
  calcCompositeScore,
  getVixValues,
} from "./gates";
import type {
  AnalysisResult,
  AnalysisError,
  ChartData,
  EarningsInfo,
  PutContract,
  ScanParams,
  ValuationData,
} from "./types";

// ─── Config ───────────────────────────────────────────────────────────────

const CF_PROXY = "https://yahoo-proxy.hejintang.workers.dev/?url=";
const YF_BASE = "https://query2.finance.yahoo.com";

function getBackendUrl(): string {
  const env = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
  if (!env || env.includes("localhost")) return "https://signalmatrix-api.onrender.com";
  return env;
}

function getApiKey(): string {
  return process.env.NEXT_PUBLIC_SCAN_API_KEY ?? "";
}

// ─── fetchSellPutChart ────────────────────────────────────────────────────

export async function fetchSellPutChart(
  ticker: string,
  range = "2y"
): Promise<ChartData> {
  const url = `${YF_BASE}/v8/finance/chart/${ticker}?range=${range}&interval=1d`;
  const res = await fetch(`${CF_PROXY}${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Chart fetch failed for ${ticker}: ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${ticker}`);

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const closes: number[] = (quote.close ?? []).map((v: number | null) => v ?? NaN);
  const highs: number[]  = (quote.high  ?? []).map((v: number | null) => v ?? NaN);
  const lows: number[]   = (quote.low   ?? []).map((v: number | null) => v ?? NaN);
  const volumes: number[] = (quote.volume ?? []).map((v: number | null) => v ?? 0);

  // filter out NaN days
  const valid: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(closes[i]) && closes[i] > 0) valid.push(i);
  }

  return {
    closes:     valid.map(i => closes[i]),
    highs:      valid.map(i => highs[i]),
    lows:       valid.map(i => lows[i]),
    volumes:    valid.map(i => volumes[i]),
    timestamps: valid.map(i => timestamps[i]),
    meta:       result.meta ?? {},
  };
}

// ─── fetchYfOptions (ATM IV from Yahoo Finance) ────────────────────────────

export async function fetchYfOptions(
  ticker: string,
  expTimestamp?: number
): Promise<{ atmIV: number | null; expirations: number[] }> {
  try {
    const base = `${YF_BASE}/v7/finance/options/${ticker}`;
    const qs = expTimestamp ? `?date=${expTimestamp}` : "";
    const res = await fetch(`${CF_PROXY}${encodeURIComponent(base + qs)}`);
    if (!res.ok) return { atmIV: null, expirations: [] };
    const json = await res.json();
    const chain = json?.optionChain?.result?.[0];
    if (!chain) return { atmIV: null, expirations: [] };

    const expirations: number[] = chain.expirationDates ?? [];
    const price: number = chain.quote?.regularMarketPrice ?? 0;

    if (!expTimestamp || !chain.options?.length) return { atmIV: null, expirations };

    const puts: { strike: number; impliedVolatility: number }[] =
      chain.options[0]?.puts ?? [];
    if (!puts.length) return { atmIV: null, expirations };

    // find the put closest to ATM
    const atm = puts.reduce((best, p) =>
      Math.abs(p.strike - price) < Math.abs(best.strike - price) ? p : best
    );
    return { atmIV: atm.impliedVolatility ?? null, expirations };
  } catch {
    return { atmIV: null, expirations: [] };
  }
}

// ─── fetchBackendOptions ──────────────────────────────────────────────────

export async function fetchBackendOptions(
  ticker: string,
  expDate?: string
): Promise<PutContract[]> {
  const base = `${getBackendUrl()}/api/sellput/options/${ticker}`;
  const qs = expDate ? `?expiration=${expDate}` : "";
  const res = await fetch(base + qs, {
    headers: { "X-Api-Key": getApiKey() },
  });
  if (!res.ok) throw new Error(`Backend options failed: ${res.status}`);
  const json = await res.json();
  // Backend returns { options: PutContract[], expiration: string, ... }
  return (json?.options ?? []) as PutContract[];
}

// ─── fetchEarningsDate ────────────────────────────────────────────────────

async function fetchEarningsDate(ticker: string): Promise<EarningsInfo | null> {
  try {
    const url = `${YF_BASE}/v10/finance/quoteSummary/${ticker}?modules=calendarEvents`;
    const res = await fetch(`${CF_PROXY}${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const json = await res.json();
    const events = json?.quoteSummary?.result?.[0]?.calendarEvents;
    const earningsDate = events?.earnings?.earningsDate?.[0]?.raw;
    if (!earningsDate) return null;
    const d = new Date(earningsDate * 1000);
    return {
      ticker,
      date: d.toISOString().slice(0, 10),
    };
  } catch {
    return null;
  }
}

// ─── fetchValuation ────────────────────────────────────────────────────────

export async function fetchValuation(ticker: string, currentPrice?: number): Promise<ValuationData> {
  try {
    const backendUrl = `${getBackendUrl()}/api/sellput/valuation/${ticker}`;
    const res = await fetch(backendUrl, {
      headers: { "X-Api-Key": getApiKey() },
    });
    if (res.ok) {
      const json = await res.json();
      // Backend returns { ticker, forward_pe, trailing_pe, annual_eps, data_source, fetched_at }
      // — no `ok` field. Only use if backend actually has data; otherwise fall through
      // to CF Worker fallback (Yahoo Finance may block Render server-side requests).
      if (json?.ticker) {
        const annualEps = (json.annual_eps ?? []) as ValuationData["annual_eps"];
        const forwardPE = (json.forward_pe ?? null) as number | null;
        const trailingPE = (json.trailing_pe ?? null) as number | null;
        if (annualEps.length > 0 || forwardPE != null || trailingPE != null) {
          return { ticker: json.ticker, forward_pe: forwardPE, trailing_pe: trailingPE, annual_eps: annualEps, ok: true };
        }
        // Backend returned empty data — fall through to CF Worker fallback
      }
    }
  } catch {
    // fall through to CF Worker fallback
  }

  // fallback: Yahoo Finance quoteSummary via CF Worker proxy (single reliable call)
  // modules=defaultKeyStatistics,summaryDetail  → P/E ratios
  // modules=incomeStatementHistory              → annual diluted EPS history
  try {
    let forwardPE: number | null = null;
    let trailingPE: number | null = null;
    const annualEpsArr: { date: string; eps: number }[] = [];

    // price module: most reliable source of trailingPE; defaultKeyStatistics/summaryDetail: forwardPE
    const summaryUrl = `${YF_BASE}/v10/finance/quoteSummary/${ticker}?modules=price,defaultKeyStatistics,summaryDetail,incomeStatementHistory`;
    const summaryRes = await fetch(`${CF_PROXY}${encodeURIComponent(summaryUrl)}`);
    if (summaryRes.ok) {
      const sj = await summaryRes.json();
      const r0 = (sj?.quoteSummary?.result ?? [{}])[0] ?? {};
      const pr = r0?.price ?? {};
      const ks = r0?.defaultKeyStatistics ?? {};
      const sd = r0?.summaryDetail ?? {};
      forwardPE  = pr?.forwardPE?.raw  ?? ks?.forwardPE?.raw  ?? sd?.forwardPE?.raw  ?? null;
      trailingPE = pr?.trailingPE?.raw ?? ks?.trailingPE?.raw ?? sd?.trailingPE?.raw ?? null;

      // Annual EPS from income statement history
      const stmts = (r0?.incomeStatementHistory?.incomeStatementHistory ?? []) as Array<{
        endDate?: { raw?: number };
        dilutedEps?: { raw?: number };
      }>;
      for (const stmt of stmts) {
        const ts = stmt?.endDate?.raw;
        const eps = stmt?.dilutedEps?.raw;
        if (ts != null && eps != null && eps > 0) {
          annualEpsArr.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), eps });
        }
      }
    }

    // Last resort: if P/E still null but we have EPS + current price, compute trailing P/E
    if (forwardPE == null && trailingPE == null && currentPrice && currentPrice > 0 && annualEpsArr.length > 0) {
      const recentEPS = [...annualEpsArr].sort((a, b) => b.date.localeCompare(a.date))[0]?.eps;
      if (recentEPS && recentEPS > 0) {
        trailingPE = Math.round((currentPrice / recentEPS) * 10) / 10;
      }
    }

    return {
      ticker,
      forward_pe: forwardPE,
      trailing_pe: trailingPE,
      annual_eps: annualEpsArr,
      ok: annualEpsArr.length > 0 || forwardPE != null || trailingPE != null,
    };
  } catch {
    return { ticker, forward_pe: null, trailing_pe: null, annual_eps: [], ok: false };
  }
}

// ─── chooseDTE ────────────────────────────────────────────────────────────

function chooseDTE(
  expirationDates: number[],
  dteMin: number,
  dteMax: number
): { dte: number; expDate: string; expTimestamp: number } | null {
  const now = Date.now();
  const candidates = expirationDates
    .map(ts => {
      const dte = Math.round((ts * 1000 - now) / 86400000);
      const expDate = new Date(ts * 1000).toISOString().slice(0, 10);
      return { dte, expDate, expTimestamp: ts };
    })
    .filter(c => c.dte >= dteMin && c.dte <= dteMax)
    .sort((a, b) => Math.abs(a.dte - (dteMin + dteMax) / 2) - Math.abs(b.dte - (dteMin + dteMax) / 2));

  return candidates[0] ?? null;
}

// ─── analyzeTicker ────────────────────────────────────────────────────────

export async function analyzeTicker(
  ticker: string,
  params: ScanParams
): Promise<AnalysisResult | AnalysisError> {
  const { cash, dteMin, dteMax, entryMode, dataSource } = params;

  try {
    const parentTicker = PARENT_MAP[ticker] ?? ticker;

    // 1. Fetch ETF chart (2y for IVR calc)
    const etfData = await fetchSellPutChart(ticker, "2y");
    if (!etfData.closes.length) throw new Error("No ETF price data");

    // 2. Fetch parent chart (5y for MA200 + valuation PE matching)
    const parentData =
      parentTicker === ticker
        ? etfData
        : await fetchSellPutChart(parentTicker, "5y");

    // 3. VIX data
    let vixData: ChartData | null = null;
    try { vixData = await fetchSellPutChart("^VIX", "5d"); } catch { /* ok */ }
    const { vixCur, vixPrev } = getVixValues(vixData);

    // 4. Current prices
    const currentPrice = etfData.closes.at(-1)!;
    const parentPrice  = parentData.closes.at(-1)!;

    // 5. Parent MA200
    const parentMA200 = calcSMA(parentData.closes, 200) ?? parentPrice;
    const parentMA200Dist = (parentPrice - parentMA200) / parentPrice;

    // 6. ATM IV + expirations
    let atmIV: number | null = null;
    let expirationTimestamps: number[] = [];

    if (dataSource === "mock") {
      // Use HV as proxy for IV in mock mode
      const hv = calcHV(etfData.closes, 20);
      atmIV = hv ? hv * 1.1 : 0.8;
      // Generate mock expirations: 3 dates at ~30, 45, 60 dte
      const now = Date.now();
      expirationTimestamps = [30, 45, 60].map(d =>
        Math.floor((now + d * 86400000) / 1000)
      );
    } else {
      const yfOpts = await fetchYfOptions(ticker);
      expirationTimestamps = yfOpts.expirations;
      atmIV = yfOpts.atmIV;
    }

    // 7. Choose DTE
    const chosen = chooseDTE(expirationTimestamps, dteMin, dteMax);
    const chosenDTE    = chosen?.dte ?? Math.round((dteMin + dteMax) / 2);
    const chosenExpDate = chosen?.expDate ?? "";

    // If we still have no ATM IV, try fetching with specific expiration
    if (atmIV == null && chosen && dataSource !== "mock") {
      const yfOpts2 = await fetchYfOptions(ticker, chosen.expTimestamp);
      atmIV = yfOpts2.atmIV;
    }

    // Final IV fallback
    if (atmIV == null) {
      atmIV = calcHV(etfData.closes, 20) ?? 0.8;
    }

    // 8. Fetch options chain
    let puts: PutContract[] = [];
    if (dataSource === "mock") {
      puts = generateMockPuts(currentPrice, atmIV, chosenDTE);
    } else {
      try {
        puts = await fetchBackendOptions(ticker, chosenExpDate);
      } catch {
        // Fall back to mock if backend fails
        puts = generateMockPuts(currentPrice, atmIV, chosenDTE);
      }
    }

    // 9. Earnings
    const watchTickers = [...new Set([ticker, parentTicker])];
    const earningsResults = await Promise.allSettled(
      watchTickers.map(t => fetchEarningsDate(t))
    );
    const earnings = earningsResults
      .map(r => (r.status === "fulfilled" ? r.value : null))
      .filter((e): e is NonNullable<typeof e> => e != null);

    // 10. Valuation (parent only — ETFs typically have no P/E)
    const valuation = await fetchValuation(parentTicker, parentPrice);

    // 11. Computed metrics
    const hv = calcHV(etfData.closes, 20);
    const ivHv = hv && hv > 0 ? atmIV / hv : null;
    const ivr = calcIVRank(atmIV, etfData.closes);
    const trendStrength = calcTrendStrength(etfData.closes, 20);
    const atr = calcATR(etfData.highs, etfData.lows, etfData.closes, 14);
    const atrPct = atr && currentPrice > 0 ? atr / currentPrice : null;

    // 12. Run Gates
    const gate0 = runGate0(valuation, parentData);
    const gate1 = runGate1({
      atmIV,
      closes: etfData.closes,
      vixCur,
      vixPrev,
    });
    const gate2 = runGate2({
      ticker,
      parentTicker,
      expDateStr: chosenExpDate,
      earnings,
    });
    const gate3 = runGate3({
      ticker,
      etfData,
      puts,
      currentPrice,
      entryMode,
      gate1,
      gate2,
      parentPrice,
      parentMA200,
      dte: chosenDTE,
      expDateStr: chosenExpDate,
    });

    const gate4 =
      gate3.bestCandidate
        ? runGate4({
            contract: gate3.bestCandidate,
            parentTicker,
            parentPrice,
            parentMA200,
            cash,
            dte: chosenDTE,
          })
        : null;

    const gate5 =
      gate3.bestCandidate
        ? runGate5({ contract: gate3.bestCandidate, parentTicker })
        : null;

    // 13. Reflections + score
    const reflections = runRiskReflections({
      ticker,
      etfData,
      parentData,
      gate2,
      gate3,
      parentMA200Dist,
    });

    const { score, breakdown } = calcCompositeScore({
      gate1,
      gate2,
      gate3,
      reflections,
    });

    return {
      ticker,
      parentTicker,
      currentPrice,
      parentPrice,
      parentMA200,
      parentMA200Dist,
      chosenDTE,
      chosenExpDate,
      atmIV,
      puts,
      gate0,
      gate1,
      gate2,
      gate3,
      gate4,
      gate5,
      reflections,
      score,
      breakdown,
      noCandidate: !gate3.bestCandidate,
      trendStrength,
      vixCur,
      vixPrev,
    } satisfies AnalysisResult;
  } catch (err) {
    return {
      ticker,
      error: err instanceof Error ? err.message : String(err),
    } satisfies AnalysisError;
  }
}
