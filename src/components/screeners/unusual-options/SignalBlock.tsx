"use client";

import type { OptionsSignal, OptionsContract } from "@/types";

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const BUCKET_COLORS: Record<string, string> = {
  SPECULATIVE:   "text-dn",
  SHORT_TERM:    "text-gold",
  INSTITUTIONAL: "text-bull",
  STRATEGIC:     "text-[#4f9cf9]",
};

const POS_LABELS: Record<string, { text: string; color: string }> = {
  OPENING:   { text: "开仓", color: "text-bull" },
  CLOSING:   { text: "平仓", color: "text-bear" },
  UNCHANGED: { text: "–",   color: "text-muted/40" },
  UNKNOWN:   { text: "?",   color: "text-muted/30" },
};

// ─── v2 Contract table ─────────────────────────────────────────────

function ContractTableV2({ contracts }: { contracts: OptionsContract[] }) {
  return (
    <table className="w-full text-[10px] border-collapse mt-1.5">
      <thead>
        <tr className="text-muted/40">
          <th className="text-left py-1 pr-2 font-normal">Type</th>
          <th className="text-left py-1 pr-2 font-normal">Strike</th>
          <th className="text-left py-1 pr-2 font-normal">Expiry</th>
          <th className="text-left py-1 pr-2 font-normal">DTE</th>
          <th className="text-right py-1 pr-2 font-normal">Premium</th>
          <th className="text-right py-1 pr-2 font-normal">Mid✓</th>
          <th className="text-right py-1 font-normal">仓位</th>
        </tr>
      </thead>
      <tbody>
        {contracts.map((c, i) => {
          const pos = POS_LABELS[c.position_type ?? "UNKNOWN"] ?? POS_LABELS.UNKNOWN;
          const bucketColor = BUCKET_COLORS[c.dte_bucket ?? ""] ?? "text-muted/60";
          return (
            <tr key={i} className="border-t border-border/30">
              <td className={`py-1 pr-2 font-trading font-bold ${c.type === "CALL" ? "text-bull" : "text-bear"}`}>
                {c.type}
              </td>
              <td className="py-1 pr-2 font-trading">${c.strike.toFixed(0)}</td>
              <td className="py-1 pr-2 text-muted/60">{c.expiry}</td>
              <td className={`py-1 pr-2 font-trading text-[9px] ${bucketColor}`}>
                {c.dte_bucket?.slice(0, 4) ?? `${c.dte}d`}
              </td>
              <td className="py-1 pr-2 text-right font-trading text-gold font-bold">
                {fmtMoney(c.premium ?? 0)}
              </td>
              <td className="py-1 pr-2 text-right">
                {c.above_mid
                  ? <span className="text-bull">✓</span>
                  : <span className="text-muted/30">–</span>}
              </td>
              <td className={`py-1 text-right font-trading ${pos.color}`}>{pos.text}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── M1: SMART_MONEY_SWEEP ─────────────────────────────────────────

function SmartMoneySweepBlock({ signal }: { signal: OptionsSignal }) {
  const d = signal.data as {
    contracts: OptionsContract[];
    sm_call_premium: number;
    sm_put_premium: number;
    opening_count: number;
    uv_call_vol: number;
    uv_put_vol: number;
  };
  const dirColor =
    signal.direction === "BULLISH" ? "text-bull" :
    signal.direction === "BEARISH" ? "text-bear" : "text-gold";
  const borderColor =
    signal.direction === "BULLISH" ? "border-bull/40" :
    signal.direction === "BEARISH" ? "border-bear/40" : "border-gold/40";

  return (
    <div className={`border-l-2 pl-3 ${borderColor}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted/50 tracking-wider">SMART MONEY SWEEP</span>
        <span className={`text-[10px] font-trading font-bold ${dirColor}`}>{signal.direction}</span>
      </div>
      <ContractTableV2 contracts={d.contracts} />
      <div className="flex gap-4 mt-2 text-[10px] text-muted/50">
        <span>机构Call: <span className="text-bull font-trading">{fmtMoney(d.sm_call_premium)}</span></span>
        <span>机构Put: <span className="text-bear font-trading">{fmtMoney(d.sm_put_premium)}</span></span>
        {d.opening_count > 0 && (
          <span>新开仓: <span className="text-bull font-trading">{d.opening_count}</span></span>
        )}
      </div>
    </div>
  );
}

// ─── M2: PREMIUM_BIAS ──────────────────────────────────────────────

function PremiumBiasBlock({ signal }: { signal: OptionsSignal }) {
  const d = signal.data as { call_premium: number; put_premium: number; ratio: number };
  const isBull = signal.direction === "BULLISH";
  const total = d.call_premium + d.put_premium;
  const callPct = total > 0 ? (d.call_premium / total) * 100 : 50;

  return (
    <div className={`border-l-2 pl-3 ${isBull ? "border-bull/40" : "border-bear/40"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted/50 tracking-wider">PREMIUM BIAS</span>
        <span className={`text-[10px] font-trading font-bold ${isBull ? "text-bull" : "text-bear"}`}>
          {signal.direction}
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden mb-2 bg-border/30">
        <div className="bg-bull/60 transition-all" style={{ width: `${callPct}%` }} />
        <div className="bg-bear/60 transition-all" style={{ width: `${100 - callPct}%` }} />
      </div>
      <div className="flex gap-4 text-[10px]">
        <div>
          <span className="text-muted/40">Call Premium </span>
          <span className="text-bull font-trading font-bold">{fmtMoney(d.call_premium)}</span>
        </div>
        <div>
          <span className="text-muted/40">Put Premium </span>
          <span className="text-bear font-trading font-bold">{fmtMoney(d.put_premium)}</span>
        </div>
        <div className="text-muted/50">
          比率 <span className="text-gold font-trading">{d.ratio}×</span>
        </div>
      </div>
    </div>
  );
}

// ─── M3: SUSTAINED_FLOW ────────────────────────────────────────────

function SustainedFlowBlock({ signal }: { signal: OptionsSignal }) {
  const isBull = signal.name === "SUSTAINED_CALL_FLOW";
  const d = signal.data as {
    net_call_premium_5d?: number;
    net_put_premium_5d?: number;
    days_tracked: number;
    threshold: number;
  };
  const net = isBull ? (d.net_call_premium_5d ?? 0) : (d.net_put_premium_5d ?? 0);

  return (
    <div className={`border-l-2 pl-3 ${isBull ? "border-bull/40" : "border-bear/40"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted/50 tracking-wider">
          {isBull ? "SUSTAINED CALL FLOW" : "SUSTAINED PUT FLOW"}
        </span>
        <span className={`text-[10px] font-trading font-bold ${isBull ? "text-bull" : "text-bear"}`}>
          {isBull ? "BULLISH" : "BEARISH"}
        </span>
      </div>
      <div className="flex gap-4 text-[10px]">
        <div>
          <span className="text-muted/40">5日净权利金 </span>
          <span className={`font-trading font-bold text-[13px] ${isBull ? "text-bull" : "text-bear"}`}>
            {fmtMoney(net)}
          </span>
        </div>
        <div className="text-muted/50">
          追踪 <span className="text-txt font-trading">{d.days_tracked}天</span>
          <span className="text-muted/30 ml-1">· 阈值 {fmtMoney(d.threshold)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── M4: OPENING_POSITION ─────────────────────────────────────────

function OpeningPositionBlock({ signal }: { signal: OptionsSignal }) {
  const d = signal.data as {
    contracts: OptionsContract[];
    opening_call_premium: number;
    opening_put_premium: number;
  };
  const isBull = signal.direction === "BULLISH";

  return (
    <div className={`border-l-2 pl-3 ${isBull ? "border-[#4f9cf9]/40" : "border-bear/40"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted/50 tracking-wider">OPENING POSITION (OI确认)</span>
        <span className={`text-[10px] font-trading font-bold ${isBull ? "text-[#4f9cf9]" : "text-bear"}`}>
          {signal.direction}
        </span>
      </div>
      <ContractTableV2 contracts={d.contracts} />
      <div className="flex gap-4 mt-2 text-[10px] text-muted/50">
        <span>Call开仓: <span className="text-bull font-trading">{fmtMoney(d.opening_call_premium)}</span></span>
        <span>Put开仓: <span className="text-bear font-trading">{fmtMoney(d.opening_put_premium)}</span></span>
      </div>
    </div>
  );
}

// ─── M5: HIGH_PUT_OI (unchanged) ──────────────────────────────────

function HighPutOIBlock({ signal }: { signal: OptionsSignal }) {
  const d = signal.data as { put_oi: number; call_oi: number; ratio: number };
  return (
    <div className="border-l-2 border-gold/40 pl-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted/50 tracking-wider">HIGH PUT OI</span>
        <span className="text-[10px] font-trading font-bold text-gold">⚠ RISK WARNING</span>
      </div>
      <div className="flex gap-4 text-[10px]">
        <div>
          <span className="text-muted/40">Put OI / Call OI </span>
          <span className="text-gold font-trading font-bold text-[13px]">{d.ratio}x</span>
        </div>
        <div className="text-muted/50">
          Put OI <span className="text-bear font-trading">{fmtVol(d.put_oi)}</span>
          {" · "}Call OI <span className="text-txt font-trading">{fmtVol(d.call_oi)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── M6: DIP_BUY_SIGNAL (updated data fields) ─────────────────────

function DipBuyBlock({ signal }: { signal: OptionsSignal }) {
  const d = signal.data as {
    triggers: string[];
    drop_52w: number;
    drop_5d: number;
    drop_1d: number;
    sm_call_premium: number;
    notable_calls: OptionsContract[];
  };
  return (
    <div className="border-l-2 border-up/40 pl-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted/50 tracking-wider">DIP BUY SIGNAL</span>
        <span className="text-[10px] font-trading font-bold text-up">BUY SIGNAL</span>
      </div>
      <div className="space-y-0.5 mb-2">
        {d.triggers.map((t, i) => (
          <div key={i} className="text-[10px] text-bear font-trading">▼ {t}</div>
        ))}
      </div>
      {d.sm_call_premium > 0 && (
        <div className="text-[10px] text-muted/40">
          机构Call权利金: <span className="text-bull font-trading">{fmtMoney(d.sm_call_premium)}</span>
        </div>
      )}
      {d.notable_calls?.length > 0 && (
        <div className="mt-1.5">
          <div className="text-[10px] text-muted/40 mb-1">Smart-money call activity:</div>
          {d.notable_calls.map((c, i) => (
            <div key={i} className="text-[10px] font-trading text-muted/60">
              CALL ${c.strike.toFixed(0)} exp {c.expiry} — {fmtMoney(c.premium ?? 0)} ({c.ratio.toFixed(1)}×)
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────

export function SignalBlock({ signal }: { signal: OptionsSignal }) {
  const name = signal.name;
  if (name === "SMART_MONEY_SWEEP")  return <SmartMoneySweepBlock  signal={signal} />;
  if (name === "PREMIUM_BIAS")       return <PremiumBiasBlock       signal={signal} />;
  if (name === "SUSTAINED_CALL_FLOW" || name === "SUSTAINED_PUT_FLOW")
                                     return <SustainedFlowBlock     signal={signal} />;
  if (name === "OPENING_POSITION")   return <OpeningPositionBlock   signal={signal} />;
  if (name === "HIGH_PUT_OI")        return <HighPutOIBlock         signal={signal} />;
  if (name.startsWith("DIP_BUY"))    return <DipBuyBlock            signal={signal} />;
  // Legacy fallback
  return (
    <div className="border-l-2 border-border/40 pl-3">
      <span className="text-[10px] text-muted/30 font-trading">{name} ({signal.direction})</span>
    </div>
  );
}
