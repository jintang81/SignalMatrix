import type { MCDXResult } from "@/types";

interface Props {
  mcdx: MCDXResult;
  sliceStart: number;
}

function lastValid(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null) return arr[i];
  }
  return null;
}

function bankerLabel(v: number): string {
  if (v >= 15) return "🔥 最强庄家控盘";
  if (v >= 10) return "💪 庄家明显入场";
  if (v >= 5)  return "🔹 庄家轻仓";
  return "🔴 庄家缺席";
}

function hotMoneyLabel(v: number): string {
  if (v >= 12) return "⚡ 游资大量收入";
  if (v >= 7)  return "🔶 游资活跃";
  if (v >= 3)  return "🧊 游资试探";
  return "☯️ 游资离场";
}

function overallSignal(bk: number, hm: number): { text: string; sub: string; color: string } {
  const s = bk * 0.7 + hm * 0.3;
  if (s >= 12) return { text: "强龙出水", sub: "绝佳买入信号", color: "text-bear" };
  if (s >= 7)  return { text: "龙蛇混杂", sub: "谨慎观察", color: "text-gold" };
  if (s >= 3)  return { text: "小龙调优", sub: "观察散户走势", color: "text-up" };
  return { text: "神龙潜渊", sub: "暂不宜入场", color: "text-muted" };
}

export default function SignalCards({ mcdx, sliceStart }: Props) {
  // Use last valid value from the full mcdx arrays starting from sliceStart
  const slicedBanker   = mcdx.banker.slice(sliceStart);
  const slicedHotMoney = mcdx.hotMoney.slice(sliceStart);

  const bk = lastValid(slicedBanker);
  const hm = lastValid(slicedHotMoney);

  const bkLabel = bk !== null ? bankerLabel(bk) : "—";
  const hmLabel = hm !== null ? hotMoneyLabel(hm) : "—";
  const overall = bk !== null && hm !== null ? overallSignal(bk, hm) : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Banker */}
      <div className="panel p-4 text-center border-dn/20 bg-dn/[0.03]">
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">🔴 庄家能量 BANKER</p>
        <p className="text-lg font-trading text-dn">{bk !== null ? bk.toFixed(2) : "—"}</p>
        <p className="text-[10px] text-muted/50 mt-1 font-chinese">{bkLabel}</p>
      </div>

      {/* HotMoney */}
      <div className="panel p-4 text-center border-gold/20 bg-gold/[0.03]">
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">🟡 游资能量 HOT MONEY</p>
        <p className="text-lg font-trading text-gold">{hm !== null ? hm.toFixed(2) : "—"}</p>
        <p className="text-[10px] text-muted/50 mt-1 font-chinese">{hmLabel}</p>
      </div>

      {/* Retailer */}
      <div className="panel p-4 text-center border-up/20 bg-up/[0.03]">
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">🟢 散户底线 RETAILER</p>
        <p className="text-lg font-trading text-up">20.00</p>
        <p className="text-[10px] text-muted/50 mt-1 font-chinese">固定基准线</p>
      </div>

      {/* Overall */}
      <div className="panel p-4 text-center">
        <p className="text-[9px] tracking-widest text-muted/60 mb-2">⚡ 龙蛇信号</p>
        {overall ? (
          <>
            <p className={`text-base font-trading font-bold ${overall.color}`}>{overall.text}</p>
            <p className="text-[10px] text-muted/50 mt-1 font-chinese">{overall.sub}</p>
          </>
        ) : (
          <p className="text-lg font-trading text-muted">—</p>
        )}
      </div>
    </div>
  );
}
