"use client";

import { useState } from "react";

interface SearchBarProps {
  onQuery: (symbol: string) => void;
  loading: boolean;
}

export default function SearchBar({ onQuery, loading }: SearchBarProps) {
  const [value, setValue] = useState("");

  function submit() {
    const sym = value.trim().toUpperCase();
    if (sym) onQuery(sym);
  }

  return (
    <section className="panel p-5">
      <p className="text-sm tracking-[0.18em] text-muted mb-1">STOCK QUERY</p>
      <p className="text-xs text-muted/60 mb-3">
        输入美股代码，查看基本信息、AI 综合评分与最新新闻
      </p>
      <div className="flex gap-2 max-w-sm">
        <div className="flex flex-1 bg-bg-3 border border-border rounded overflow-hidden focus-within:border-up/60 transition-colors">
          <span className="flex items-center px-3 text-muted/50 text-xs border-r border-border font-trading select-none">
            $
          </span>
          <input
            className="flex-1 bg-transparent px-3 py-2 text-sm text-txt placeholder:text-muted/40
                       focus:outline-none font-trading tracking-widest uppercase"
            placeholder="AAPL · TSLA · NVDA · SPY"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button
          className="btn min-w-[80px] justify-center"
          onClick={submit}
          disabled={loading}
        >
          {loading ? (
            <span className="w-3.5 h-3.5 border border-muted/40 border-t-muted rounded-full animate-spin" />
          ) : (
            "QUERY"
          )}
        </button>
      </div>
    </section>
  );
}
