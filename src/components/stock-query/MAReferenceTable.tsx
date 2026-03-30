import type { TechnicalSnapshot } from "@/types";

interface MAReferenceTableProps {
  mas: TechnicalSnapshot["mas"];
  price: number;
}

export default function MAReferenceTable({ mas, price }: MAReferenceTableProps) {
  return (
    <div className="panel p-5">
      <p className="text-[10px] tracking-[0.18em] text-muted/60 mb-3">// MA REFERENCE</p>
      <div className="divide-y divide-border/30">
        {mas.map(({ period, value, distancePct }) => (
          <div key={period} className="flex justify-between items-center py-1.5">
            <span className="text-xs text-muted/70 font-trading">MA{period}</span>
            <div className="flex items-center gap-3 font-trading">
              <span className={`text-sm ${value != null && price > value ? "text-up" : "text-dn"}`}>
                {value != null ? "$" + value.toFixed(2) : "—"}
              </span>
              {distancePct != null && (
                <span className={`text-[10px] ${distancePct >= 0 ? "text-up/70" : "text-dn/70"}`}>
                  {distancePct >= 0 ? "+" : ""}{distancePct.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
