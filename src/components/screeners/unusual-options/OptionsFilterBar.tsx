"use client";

export type OptionsFilter = {
  minStars: number;
  direction: "ALL" | "BUY" | "BEARISH" | "WARNING" | "WATCH";
};

const DIRECTIONS: OptionsFilter["direction"][] = ["ALL", "BUY", "BEARISH", "WARNING", "WATCH"];
const STAR_OPTIONS = [0, 1, 2, 3, 4, 5];

const DIR_STYLES: Record<string, string> = {
  ALL:     "text-muted border-border hover:border-muted/60",
  BUY:     "text-bull border-bull/40 hover:border-bull/70",
  BEARISH: "text-bear border-bear/40 hover:border-bear/70",
  WARNING: "text-gold border-gold/40 hover:border-gold/70",
  WATCH:   "text-[#4f9cf9] border-[#4f9cf9]/40 hover:border-[#4f9cf9]/70",
};

const DIR_ACTIVE: Record<string, string> = {
  ALL:     "bg-muted/10 border-muted/60 text-txt",
  BUY:     "bg-bull/10 border-bull/60 text-bull",
  BEARISH: "bg-bear/10 border-bear/60 text-bear",
  WARNING: "bg-gold/10 border-gold/60 text-gold",
  WATCH:   "bg-[#4f9cf9]/10 border-[#4f9cf9]/60 text-[#4f9cf9]",
};

export function OptionsFilterBar({
  filter,
  onChange,
  total,
}: {
  filter: OptionsFilter;
  onChange: (f: OptionsFilter) => void;
  total: number;
}) {
  return (
    <div className="panel px-4 py-3 flex flex-wrap items-center gap-4">
      {/* Direction */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted/50 mr-1">方向</span>
        {DIRECTIONS.map((d) => (
          <button
            key={d}
            onClick={() => onChange({ ...filter, direction: d })}
            className={`text-[10px] font-trading px-2.5 py-0.5 rounded border transition-colors ${
              filter.direction === d ? DIR_ACTIVE[d] : DIR_STYLES[d]
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Min stars */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted/50 mr-1">最低评级</span>
        {STAR_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onChange({ ...filter, minStars: s })}
            className={`text-[10px] font-trading w-7 h-6 rounded border transition-colors ${
              filter.minStars === s
                ? "bg-gold/10 border-gold/60 text-gold"
                : "border-border text-muted/50 hover:border-muted/60"
            }`}
          >
            {s === 0 ? "全部" : `${s}★`}
          </button>
        ))}
      </div>

      <div className="ml-auto text-[10px] text-muted/40 font-trading">
        {total} 只触发
      </div>
    </div>
  );
}
