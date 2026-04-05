"use client";

export type InvertedDuckFilterMode = "all" | "35" | "45";

interface Props {
  active: InvertedDuckFilterMode;
  counts: Record<InvertedDuckFilterMode, number>;
  onChange: (mode: InvertedDuckFilterMode) => void;
}

const FILTERS: { mode: InvertedDuckFilterMode; label: string; color: string }[] = [
  { mode: "all", label: "全部",    color: "text-muted/70 border-border/60 hover:border-muted/40" },
  { mode: "35",  label: "角度≥35°", color: "text-bear/70 border-bear/30 hover:border-bear/60" },
  { mode: "45",  label: "角度≥45°", color: "text-gold/70 border-gold/30 hover:border-gold/60" },
];

const ACTIVE_STYLE: Record<InvertedDuckFilterMode, string> = {
  all: "text-muted border-muted/40 bg-muted/5",
  "35": "text-bear border-bear/50 bg-bear/5",
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
