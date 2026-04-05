"use client";

import { useState, useRef, useCallback } from "react";
import { searchNLScreener } from "@/lib/api/screener";
import type { NLSearchResult } from "@/types";

interface Props {
  onResults: (result: NLSearchResult | null) => void;
  onLoading: (loading: boolean) => void;
}

const EXAMPLES = [
  "找低估值高成长的科技股",
  "高股息防御性板块",
  "低负债高盈利的大型股",
  "半导体行业营收增长强劲",
];

export default function NLSearchBar({ onResults, onLoading }: Props) {
  const [query, setQuery]       = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || isSearching) return;

    setIsSearching(true);
    setError(null);
    onLoading(true);
    onResults(null);

    try {
      const result = await searchNLScreener(q);
      onResults(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      onResults(null);
    } finally {
      setIsSearching(false);
      onLoading(false);
    }
  }, [query, isSearching, onResults, onLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="panel p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] tracking-widest text-gold/80">◈ AI 自然语言筛选</span>
        <span className="tag tag-muted text-[9px]">S&amp;P 500 基本面</span>
        <span className="tag tag-muted text-[9px]">claude-haiku</span>
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你想找的股票，例如：找低估值高成长的科技股…"
          className="flex-1 bg-bg-2 border border-border rounded px-3 py-2 text-[12px]
                     text-txt placeholder:text-muted/40 outline-none
                     focus:border-gold/50 transition-colors font-chinese"
          disabled={isSearching}
        />
        <button
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
          className="btn text-[11px] px-4 whitespace-nowrap disabled:opacity-40 hover:border-gold/50 hover:text-gold transition-colors"
        >
          {isSearching ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 border border-gold/60 border-t-transparent rounded-full animate-spin" />
              筛选中…
            </span>
          ) : "AI 筛选 →"}
        </button>
      </div>

      {/* Example chips */}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setQuery(ex); inputRef.current?.focus(); }}
            disabled={isSearching}
            className="text-[10px] text-muted/50 border border-border/50 rounded px-2 py-0.5
                       hover:border-gold/40 hover:text-gold/70 transition-colors font-chinese
                       disabled:opacity-30"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="text-[11px] text-dn/80 font-chinese">{error}</p>
      )}
    </div>
  );
}
