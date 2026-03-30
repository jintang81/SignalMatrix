"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "@/components/stock-query/SearchBar";
import PriceHero from "@/components/stock-query/PriceHero";
import CompanyDescription from "@/components/stock-query/CompanyDescription";
import CandlestickChart from "@/components/stock-query/CandlestickChart";
import ValuationMetrics from "@/components/stock-query/ValuationMetrics";
import FinancialMetrics from "@/components/stock-query/FinancialMetrics";
import DividendOwnership from "@/components/stock-query/DividendOwnership";
import AnalystRatings from "@/components/stock-query/AnalystRatings";
import TechnicalIndicators from "@/components/stock-query/TechnicalIndicators";
import MAReferenceTable from "@/components/stock-query/MAReferenceTable";
import CompanyInfo from "@/components/stock-query/CompanyInfo";
import AIScore from "@/components/stock-query/AIScore";
import NewsPanel from "@/components/stock-query/NewsPanel";
import { fetchStockQueryData } from "@/lib/api";
import { computeTechnicalSnapshot } from "@/lib/indicators";
import { raw } from "@/lib/utils";
import type { StockQueryData, TechnicalSnapshot, AIScoreResponse } from "@/types";

type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; symbol: string; data: StockQueryData; snapshot: TechnicalSnapshot };

type AIState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: AIScoreResponse }
  | { status: "error"; code?: string };

function SearchParamsTrigger({ onQuery }: { onQuery: (sym: string) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const sym = searchParams.get("q");
    if (sym) onQuery(sym.toUpperCase());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function StockQueryPage() {
  const [state, setState] = useState<PageState>({ status: "idle" });
  const [aiState, setAIState] = useState<AIState>({ status: "idle" });

  const handleQuery = useCallback(async (symbol: string) => {
    setState({ status: "loading" });
    setAIState({ status: "idle" });

    try {
      const data = await fetchStockQueryData(symbol);
      const snapshot = computeTechnicalSnapshot(data.chart);
      setState({ status: "loaded", symbol, data, snapshot });

      // Non-blocking AI score fetch
      setAIState({ status: "loading" });
      const fd = data.summary.financialData;
      const ks = data.summary.defaultKeyStatistics;
      const sd = data.summary.summaryDetail;
      const fundamentals = {
        symbol,
        price: data.quote.regularMarketPrice,
        marketCap: data.quote.marketCap,
        trailingPE: raw(sd?.trailingPE),
        forwardPE: raw(sd?.forwardPE),
        priceToBook: raw(ks?.priceToBook),
        eps: raw(ks?.trailingEps),
        pegRatio: raw(ks?.pegRatio),
        revenueGrowth: raw(fd?.revenueGrowth),
        earningsGrowth: raw(fd?.earningsGrowth),
        grossMargins: raw(fd?.grossMargins),
        profitMargins: raw(fd?.profitMargins),
        freeCashflow: raw(fd?.freeCashflow),
        debtToEquity: raw(fd?.debtToEquity),
        returnOnEquity: raw(fd?.returnOnEquity),
        beta: raw(ks?.beta),
        analystConsensus: fd?.recommendationKey,
        analystTargetPrice: raw(fd?.targetMeanPrice),
        rsi14: snapshot.rsi14,
        weekPos52: snapshot.weekPos52,
        maTrend: snapshot.maTrend,
      };

      fetch("/api/stock-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, fundamentals }),
      })
        .then(async (r) => {
          const json = await r.json();
          if (!r.ok) {
            setAIState({ status: "error", code: json.error });
          } else {
            setAIState({ status: "done", result: json as AIScoreResponse });
          }
        })
        .catch(() => setAIState({ status: "error" }));
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, []);

  const isLoading = state.status === "loading";

  return (
    <div className="py-6 space-y-4">
      <Suspense fallback={null}>
        <SearchParamsTrigger onQuery={handleQuery} />
      </Suspense>
      <SearchBar onQuery={handleQuery} loading={isLoading} />

      {state.status === "error" && (
        <div className="panel p-4">
          <p className="text-sm text-dn/80">⚠ {state.message}</p>
          <p className="text-xs text-muted/50 mt-1">请检查代码是否正确，或稍后重试</p>
        </div>
      )}

      {state.status === "loaded" && (
        <>
          <PriceHero quote={state.data.quote} />

          {state.data.profile.summaryProfile?.longBusinessSummary && (
            <CompanyDescription
              description={state.data.profile.summaryProfile.longBusinessSummary}
            />
          )}

          <CandlestickChart
            chart={state.data.chart}
            ma20={state.snapshot.maLines.ma20}
            ma50={state.snapshot.maLines.ma50}
            ma200={state.snapshot.maLines.ma200}
            volMa20={state.snapshot.maLines.volMa20}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ValuationMetrics summary={state.data.summary} price={state.data.quote.regularMarketPrice} />
            <FinancialMetrics summary={state.data.summary} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DividendOwnership summary={state.data.summary} />
            <AnalystRatings
              summary={state.data.summary}
              profile={state.data.profile}
              currentPrice={state.data.quote.regularMarketPrice}
            />
          </div>

          <TechnicalIndicators snapshot={state.snapshot} />
          <MAReferenceTable mas={state.snapshot.mas} price={state.data.quote.regularMarketPrice} />
          <CompanyInfo profile={state.data.profile} />

          <div className="grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-4">
            <AIScore state={aiState} />
            {state.data.news.length > 0 && <NewsPanel news={state.data.news} />}
          </div>
        </>
      )}
    </div>
  );
}
