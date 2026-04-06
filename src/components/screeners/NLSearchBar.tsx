"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  className?: string;
  initialQuery?: string;
  onSearch?: (query: string) => void;
}

const EXAMPLES = [
  "找低估值高成长的科技股",
  "高股息防御性板块",
  "低负债高盈利的大型股",
  "半导体行业营收增长强劲",
];

export default function NLSearchBar({ className, initialQuery = "", onSearch }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;
    if (onSearch) {
      onSearch(q);
    } else {
      router.push(`/screeners/nl-results?q=${encodeURIComponent(q)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className={`panel p-3 space-y-2${className ? ` ${className}` : ""}`}>
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
          className="flex-1 bg-bg-2 border border-border rounded px-3 py-1.5 text-[12px]
                     text-txt placeholder:text-muted/40 outline-none
                     focus:border-gold/50 transition-colors font-chinese"
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim()}
          className="btn text-[11px] px-4 whitespace-nowrap disabled:opacity-40 hover:border-gold/50 hover:text-gold transition-colors"
        >
          AI 筛选 →
        </button>
      </div>

      {/* Example chips */}
      <div className="flex flex-wrap gap-1">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setQuery(ex); inputRef.current?.focus(); }}
            className="text-[10px] text-muted/50 border border-border/50 rounded px-2 py-0.5
                       hover:border-gold/40 hover:text-gold/70 transition-colors font-chinese"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
