"use client";

import type { OptionsSignal, OptionsContract } from "@/types";

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ─── Contract table (for UNUSUAL_VOLUME) ──────────────────────────

function ContractTable({ contracts }: { contracts: OptionsContract[] }) {
  return (
    <table className="w-full text-[10px] border-collapse mt-1.5">
      <thead>
        <tr className="text-muted/40">
          <th className="text-left py-1 pr-2 font-normal">Type</th>
          <th className="text-left py-1 pr-2 font-normal">Strike</th>
          <th className="text-left py-1 pr-2 font-normal">Expiry</th>
          <th className="text-right py-1 pr-2 font-normal">Vol</th>
          <th className="text-right py-1 pr-2 font-normal">OI</th>
          <th className="text-right py-1 font-normal">Ratio</th>
        </tr>
      </thead>
      <tbody>
        {contracts.map((c, i) => (
          <tr key={i} className="border-t border-border/30">
            <td className={`py-1 pr-2 font-trading font-bold ${c.type === "CALL" ? "text-bull" : "text-bear"}`}>
              {c.type}
            </td>
            <td className="py-1 pr-2 font-trading">${c.strike.toFixed(0)}</td>
            <td className="py-1 pr-2 text-muted/60">{c.expiry}</td>
            <td className="py-1 pr-2 text-right font-trading">{fmtVol(c.volume)}</td>
            <td className="py-1 pr-2 text-right font-trading text-muted/60">{fmtVol(c.oi)}</td>
            <td className="py-1 text-right font-trading text-gold font-bold">{c.ratio.toFixed(1)}x</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Individual signal renderers ──────────────────────────────────

function UnusualVolumeBlock({ signal }: { signal: OptionsSignal }) {
  const d = signal.data as {
    contracts: OptionsContract[];
    uv_call_vol: number;
    uv_put_vol: number;
  };
  const dirColor = signal.direction === "BULLISH" ? "text-bull" : signal.direction === "BEARISH" ? "text-bear" : "text-gold";
  const borderColor = signal.direction === "BULLISH" ? "border-bull/40" : signal.direction === "BEARISH" ? "border-bear/40" : "border-gold/40";

  return (
    <div className={`border-l-2 pl-3 ${borderColor}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted/50 tracking-wider">UNUSUAL VOLUME</span>
        <span className={`text-[10px] font-trading font-bold ${dirColor}`}>{signal.direction}</span>
      </div>
      <ContractTable contracts={d.contracts} />
      <div className="flex gap-4 mt-2 text-[10px] text-muted/50">
        <span>Unusual call vol: <span className="text-bull font-trading">{fmtVol(d.uv_call_vol)}</span></span>
        <span>Unusual put vol: <span className="text-bear font-trading">{fmtVol(d.uv_put_vol)}</span></span>
      </div>
    </div>
  );
}

function PutCallRatioBlock({ signal }: { signal: OptionsSignal }) {
  const d = signal.data as { pc_ratio: number; threshold: number; call_vol: number; put_vol: number };
  return (
    <div className="border-l-2 border-bull/40 pl-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted/50 tracking-wider">LOW PUT/CALL RATIO</span>
        <span className="text-[10px] font-trading font-bold text-bull">BULLISH</span>
      </div>
      <div className="flex gap-4 text-[10px]">
        <div>
          <span className="text-muted/40">P/C Ratio </span>
          <span className="text-bull font-trading font-bold text-[13px]">{d.pc_ratio}</span>
          <span className="text-muted/40"> &lt; {d.threshold}</span>
        </div>
        <div className="text-muted/50">
          Call <span className="text-txt font-trading">{fmtVol(d.call_vol)}</span>
          {" · "}Put <span className="text-txt font-trading">{fmtVol(d.put_vol)}</span>
        </div>
      </div>
    </div>
  );
}

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

function HeavyFlowBlock({ signal }: { signal: OptionsSignal }) {
  const d = signal.data as { call_vol: number; put_vol: number; ratio: number };
  const isBull = signal.name === "HEAVY_CALL_FLOW";
  return (
    <div className={`border-l-2 pl-3 ${isBull ? "border-bull/40" : "border-bear/40"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted/50 tracking-wider">
          {isBull ? "HEAVY CALL FLOW" : "HEAVY PUT FLOW"}
        </span>
        <span className={`text-[10px] font-trading font-bold ${isBull ? "text-bull" : "text-bear"}`}>
          {isBull ? "BULLISH" : "BEARISH"}
        </span>
      </div>
      <div className="text-[10px] text-muted/50">
        Unusual {isBull ? "call" : "put"} vol{" "}
        <span className={`font-trading font-bold ${isBull ? "text-bull" : "text-bear"}`}>
          {fmtVol(isBull ? d.call_vol : d.put_vol)}
        </span>
        {" is "}
        <span className="text-gold font-trading">{d.ratio}x</span>
        {" unusual "}
        {isBull ? "put" : "call"} vol{" "}
        <span className="font-trading">{fmtVol(isBull ? d.put_vol : d.call_vol)}</span>
      </div>
    </div>
  );
}

function DipBuyBlock({ signal }: { signal: OptionsSignal }) {
  const d = signal.data as {
    triggers: string[];
    drop_52w: number;
    drop_5d: number;
    drop_1d: number;
    pc_ratio: number;
    call_vol: number;
    put_vol: number;
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
      <div className="text-[10px] text-muted/40">
        Options P/C: <span className="text-txt font-trading">{d.pc_ratio}</span>
        {" · "}Call vol <span className="text-bull font-trading">{fmtVol(d.call_vol)}</span>
        {" · "}Put vol <span className="text-bear font-trading">{fmtVol(d.put_vol)}</span>
      </div>
      {d.notable_calls.length > 0 && (
        <div className="mt-1.5">
          <div className="text-[10px] text-muted/40 mb-1">Notable call activity:</div>
          {d.notable_calls.map((c, i) => (
            <div key={i} className="text-[10px] font-trading text-muted/60">
              CALL ${c.strike.toFixed(0)} exp {c.expiry} — vol {fmtVol(c.volume)} vs OI {fmtVol(c.oi)} ({c.ratio.toFixed(1)}x)
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
  if (name === "UNUSUAL_VOLUME")     return <UnusualVolumeBlock signal={signal} />;
  if (name === "LOW_PUT_CALL_RATIO") return <PutCallRatioBlock signal={signal} />;
  if (name === "HIGH_PUT_OI")        return <HighPutOIBlock signal={signal} />;
  if (name === "HEAVY_CALL_FLOW" || name === "HEAVY_PUT_FLOW") return <HeavyFlowBlock signal={signal} />;
  if (name.startsWith("DIP_BUY"))    return <DipBuyBlock signal={signal} />;
  return null;
}
