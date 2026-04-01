"use client";

export type TopDivFilterMode = "all" | "both" | "MACD" | "RSI";

interface Props {
  active: TopDivFilterMode;
  counts: { all: number; both: number; MACD: number; RSI: number };
  onChange: (mode: TopDivFilterMode) => void;
}

const BUTTONS: { mode: TopDivFilterMode; label: string }[] = [
  { mode: "all",  label: "全部" },
  { mode: "both", label: "⚡ 双重背离" },
  { mode: "MACD", label: "MACD 顶背离" },
  { mode: "RSI",  label: "RSI 顶背离" },
];

export default function FilterBar({ active, counts, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {BUTTONS.map(({ mode, label }) => {
        const isActive = active === mode;
        const isBoth = mode === "both";
        const activeClass = isBoth
          ? "border-gold text-gold bg-gold/5"
          : "border-dn text-dn bg-dn/5";
        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={`btn text-[11px] font-trading tracking-wide ${
              isActive ? activeClass : "text-muted/60 border-border/60"
            }`}
          >
            {label}
            <span
              className={`ml-1.5 text-[10px] ${
                isActive ? "opacity-80" : "opacity-40"
              }`}
            >
              {counts[mode]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
