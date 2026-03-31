"use client";

export type DuckFilterMode = "all" | "35" | "45";

interface Props {
  active: DuckFilterMode;
  counts: Record<DuckFilterMode, number>;
  onChange: (mode: DuckFilterMode) => void;
}

const FILTERS: { mode: DuckFilterMode; label: string; color: string }[] = [
  { mode: "all", label: "全部",    color: "text-muted/70 border-border/60 hover:border-muted/40" },
  { mode: "35",  label: "角度≥35°", color: "text-bull/70 border-bull/30 hover:border-bull/60" },
  { mode: "45",  label: "角度≥45°", color: "text-gold/70 border-gold/30 hover:border-gold/60" },
];

const ACTIVE_STYLE: Record<DuckFilterMode, string> = {
  all: "text-muted border-muted/40 bg-muted/5",
  "35": "text-bull border-bull/50 bg-bull/5",
  "45": "text-gold border-gold/50 bg-gold/5",
};

export default function FilterBar({ active, counts, onChange }: Props) {
  return (
    <div className="panel p-3 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-muted/40 font-trading mr-1">过滤</span>
      {FILTERS.map(({ mode, label, color }) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`btn text-[11px] font-trading transition-colors ${
            active === mode ? ACTIVE_STYLE[mode] : color
          }`}
        >
          {label}
          <span className="ml-1.5 opacity-60">{counts[mode]}</span>
        </button>
      ))}
    </div>
  );
}
