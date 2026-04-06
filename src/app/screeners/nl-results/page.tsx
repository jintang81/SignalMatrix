"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { searchNLScreener } from "@/lib/api/screener";
import NLResultsPanel from "@/components/screeners/NLResultsPanel";
import NLSearchBar from "@/components/screeners/NLSearchBar";
import type { NLSearchResult } from "@/types";

// ─── Inner component (uses useSearchParams) ────────────────────────

function NLResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") ?? "";

  const [result, setResult]   = useState<NLSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const runSearch = useCallback((q: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    searchNLScreener(q)
      .then(setResult)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Run search when URL query param changes
  useEffect(() => {
    if (!query) return;
    runSearch(query);
  }, [query, runSearch]);

  const handleSearch = (q: string) => {
    router.push(`/screeners/nl-results?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="py-3 space-y-3 min-h-[calc(100dvh-3.5rem)]">
      {/* Header */}
      <div className="panel p-3 flex items-center gap-3">
        <Link
          href="/screeners"
          className="text-[11px] font-trading text-muted/50 hover:text-muted transition-colors"
        >
          ← SCREENERS
        </Link>
        <div className="w-px h-4 bg-border/60" />
        <p className="text-[10px] tracking-widest text-gold/70">◈ AI 自然语言筛选</p>
      </div>

      {/* Search bar — always visible */}
      <NLSearchBar initialQuery={query} onSearch={handleSearch} />

      {/* Loading */}
      {loading && (
        <div className="panel p-12 flex items-center justify-center gap-3">
          <span className="w-4 h-4 border border-gold/60 border-t-transparent rounded-full animate-spin" />
          <span className="text-[11px] text-muted/60 font-chinese">AI 正在解析条件并筛选…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="panel p-6 text-center">
          <p className="text-[11px] text-dn/80 font-chinese">{error}</p>
        </div>
      )}

      {/* Results */}
      {!loading && result && <NLResultsPanel result={result} />}
    </div>
  );
}

// ─── Page (Suspense boundary for useSearchParams) ──────────────────

export default function NLResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-6">
          <div className="panel p-12 flex items-center justify-center gap-3">
            <span className="w-4 h-4 border border-gold/60 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] text-muted/60 font-chinese">加载中…</span>
          </div>
        </div>
      }
    >
      <NLResultsContent />
    </Suspense>
  );
}
