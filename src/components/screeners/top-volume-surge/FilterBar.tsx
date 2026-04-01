"use client";

export type TopVolumeFilterMode = "all" | "2x" | "3x" | "5x";

interface Props {
  active: TopVolumeFilterMode;
  counts: { all: number; "2x": number; "3x": number; "5x": number };
  onChange: (mode: TopVolumeFilterMode) => void;
}

const BUTTONS: { mode: TopVolumeFilterMode; label: string }[] = [
  { mode: "all", label: "全部" },
  { mode: "2x",  label: "≥ 2x" },
  { mode: "3x",  label: "≥ 3x" },
  { mode: "5x",  label: "≥ 5x" },
];

export default function FilterBar({ active, counts, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {BUTTONS.map(({ mode, label }) => {
        const isActive = active === mode;
        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={`btn text-[11px] font-trading tracking-wide ${
              isActive
                ? "border-dn text-dn bg-dn/5"
                : "text-muted/60 border-border/60"
            }`}
          >
            {label}
            <span className={`ml-1.5 text-[10px] ${isActive ? "opacity-80" : "opacity-40"}`}>
              {counts[mode]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
