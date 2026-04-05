"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { searchNLScreener } from "@/lib/api/screener";
import NLResultsPanel from "@/components/screeners/NLResultsPanel";
import type { NLSearchResult } from "@/types";

// ─── Inner component (uses useSearchParams) ────────────────────────

function NLResultsContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";

  const [result, setResult]   = useState<NLSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    searchNLScreener(query)
      .then(setResult)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="py-6 space-y-3 min-h-[calc(100dvh-3.5rem)]">
      {/* Header */}
      <div className="panel p-3 flex items-center gap-3">
        <Link
          href="/screeners"
          className="text-[11px] font-trading text-muted/50 hover:text-muted transition-colors"
        >
          ← SCREENERS
        </Link>
        <div className="w-px h-4 bg-border/60" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] tracking-widest text-gold/70">◈ AI 自然语言筛选</p>
          <p className="text-[11px] text-txt/80 font-chinese truncate mt-0.5">{query}</p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="panel p-12 flex items-center justify-center gap-3">
          <span className="w-4 h-4 border border-gold/60 border-t-transparent rounded-full animate-spin" />
          <span className="text-[11px] text-muted/60 font-chinese">AI 正在解析条件并筛选…</span>
        </div>
      )}

      {/* No query */}
      {!loading && !query && (
        <div className="panel p-8 text-center">
          <p className="text-[11px] text-muted/50 font-chinese">请先输入筛选条件</p>
          <Link href="/screeners" className="text-[11px] text-gold/60 hover:text-gold mt-2 inline-block font-trading transition-colors">
            ← 返回筛选器
          </Link>
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
