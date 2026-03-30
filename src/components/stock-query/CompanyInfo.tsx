import type { YFProfileModule } from "@/types";

interface CompanyInfoProps {
  profile: YFProfileModule;
}

export default function CompanyInfo({ profile }: CompanyInfoProps) {
  const sp = profile.summaryProfile;
  if (!sp) return null;

  const rows = [
    ["行业", sp.industry],
    ["板块", sp.sector],
    ["员工人数", sp.fullTimeEmployees?.toLocaleString()],
    ["城市", [sp.city, sp.state, sp.country].filter(Boolean).join(", ")],
    ["官网", sp.website],
  ].filter(([, v]) => v);

  if (!rows.length) return null;

  return (
    <div className="panel p-5">
      <p className="text-[10px] tracking-[0.18em] text-muted/60 mb-3">// COMPANY INFO</p>
      <div className="divide-y divide-border/30">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between items-center py-1.5">
            <span className="text-xs text-muted/70">{label}</span>
            <span className="text-sm text-txt">
              {label === "官网" ? (
                <a
                  href={value as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-up/80 hover:text-up transition-colors font-trading text-xs"
                >
                  {value}
                </a>
              ) : (
                value
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
