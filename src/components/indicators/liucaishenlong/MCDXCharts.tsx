"use client";

import { useRef, useEffect } from "react";

export interface MCDXChartSlice {
  dates: Date[];
  O: (number | null)[];
  H: (number | null)[];
  L: (number | null)[];
  C: (number | null)[];
  V: (number | null)[];
  ma5:   (number | null)[];
  ma10:  (number | null)[];
  ma20:  (number | null)[];
  ma50:  (number | null)[];
  ma200: (number | null)[];
  banker:   (number | null)[];
  hotMoney: (number | null)[];
  bankerMA: (number | null)[];
}

interface Props {
  data: MCDXChartSlice;
  interval: string;
}

const MA_COLORS = ["#f0e040", "#ff9800", "#e040fb", "#29b6f6", "#ff5252"] as const;
const MA_LABELS = ["MA5", "MA10", "MA20", "MA50", "MA200"] as const;

export default function MCDXCharts({ data, interval }: Props) {
  const candleRef = useRef<HTMLCanvasElement>(null);
  const mcdxRef   = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cCanvas = candleRef.current;
    const mCanvas = mcdxRef.current;
    if (!cCanvas || !mCanvas) return;

    let xhairIdx = -1;

    // ── dimensions ──────────────────────────────────────────────────
    function dims() {
      const W = cCanvas!.parentElement!.clientWidth;
      return {
        W,
        cH: Math.max(200, Math.min(260, Math.round(W * 0.19))),
        mH: Math.max(200, Math.min(280, Math.round(W * 0.2))),
      };
    }

    // ── draw candle chart ────────────────────────────────────────────
    function drawCandle() {
      const { W, cH } = dims();
      const DPR = window.devicePixelRatio || 1;
      cCanvas!.width  = W * DPR;
      cCanvas!.height = cH * DPR;
      cCanvas!.style.width  = W + "px";
      cCanvas!.style.height = cH + "px";
      const ctx = cCanvas!.getContext("2d")!;
      ctx.scale(DPR, DPR);

      const { dates, O, H, L, C, V } = data;
      const maArrays = [data.ma5, data.ma10, data.ma20, data.ma50, data.ma200];
      const n = C.length;
      if (n === 0) return;

      const PAD = { top: 16, right: 78, bottom: 22, left: 8 };
      const VOL_R = 0.18;
      const innerH = cH - PAD.top - PAD.bottom;
      const volH   = Math.round(innerH * VOL_R);
      const priceH = innerH - volH - 3;
      const barUnit = (W - PAD.left - PAD.right) / n;
      const barW = Math.max(1, barUnit * 0.72);
      const xBar = (i: number) => PAD.left + (i + 0.5) * barUnit;

      // Price range (include MA)
      let pMin = Infinity, pMax = -Infinity, vMax = 0;
      for (let i = 0; i < n; i++) {
        if (H[i] != null) { pMax = Math.max(pMax, H[i]!); pMin = Math.min(pMin, L[i]!); }
        if (V[i] != null && V[i]! > 0) vMax = Math.max(vMax, V[i]!);
      }
      for (const ma of maArrays) {
        for (let i = 0; i < n; i++) {
          if (ma[i] != null) { pMax = Math.max(pMax, ma[i]!); pMin = Math.min(pMin, ma[i]!); }
        }
      }
      const pad = (pMax - pMin) * 0.05; pMin -= pad; pMax += pad;
      const pRange = pMax - pMin || 1;

      const yP = (v: number) => PAD.top + priceH - ((v - pMin) / pRange) * priceH;
      const yV = (v: number) => PAD.top + priceH + 3 + volH - (v / vMax) * volH;
      const volBase = PAD.top + priceH + 3 + volH;

      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, W, cH);

      // Grid
      ctx.font = '10px "Share Tech Mono"';
      ctx.textAlign = "left";
      for (let g = 0; g <= 5; g++) {
        const v = pMin + (pRange * g / 5);
        const y = yP(v);
        ctx.strokeStyle = "rgba(46,58,80,0.9)"; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("$" + v.toFixed(2), W - PAD.right + 4, y + 3);
      }

      // X labels
      const step = Math.max(1, Math.floor(n / 10));
      ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center";
      for (let i = 0; i < n; i += step) {
        if (!dates[i]) continue;
        const d = dates[i];
        const label = interval === "1wk" || interval === "1mo"
          ? `${d.getFullYear()}/${d.getMonth() + 1}`
          : `${d.getMonth() + 1}/${d.getDate()}`;
        ctx.fillText(label, xBar(i), cH - 5);
      }

      // Volume
      for (let i = 0; i < n; i++) {
        if (!V[i] || V[i]! <= 0) continue;
        ctx.fillStyle = (C[i] ?? 0) >= (O[i] ?? 0) ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)";
        ctx.fillRect(xBar(i) - barW / 2, yV(V[i]!), barW, volBase - yV(V[i]!));
      }

      // Candles
      for (let i = 0; i < n; i++) {
        if (O[i] == null) continue;
        const bull = C[i]! >= O[i]!;
        const col = bull ? "#26a69a" : "#ef5350";
        const x = xBar(i);
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, yP(H[i]!)); ctx.lineTo(x, yP(L[i]!)); ctx.stroke();
        ctx.fillStyle = col;
        const top = yP(Math.max(C[i]!, O[i]!));
        const bot = yP(Math.min(C[i]!, O[i]!));
        ctx.fillRect(x - barW / 2, top, barW, Math.max(bot - top, 1));
      }

      // MA lines
      maArrays.forEach((ma, idx) => {
        ctx.strokeStyle = MA_COLORS[idx];
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
          if (ma[i] == null) { started = false; continue; }
          if (!started) { ctx.moveTo(xBar(i), yP(ma[i]!)); started = true; }
          else ctx.lineTo(xBar(i), yP(ma[i]!));
        }
        ctx.stroke();
      });

      // Crosshair
      if (xhairIdx >= 0 && xhairIdx < n) {
        const x = xBar(xhairIdx);
        ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, cH - PAD.bottom); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── draw mcdx chart ──────────────────────────────────────────────
    function drawMCDX() {
      const { W, mH } = dims();
      const DPR = window.devicePixelRatio || 1;
      mCanvas!.width  = W * DPR;
      mCanvas!.height = mH * DPR;
      mCanvas!.style.width  = W + "px";
      mCanvas!.style.height = mH + "px";
      const ctx = mCanvas!.getContext("2d")!;
      ctx.scale(DPR, DPR);

      const { dates, banker, hotMoney, bankerMA } = data;
      const n = banker.length;
      if (n === 0) return;

      const PAD = { top: 10, right: 78, bottom: 22, left: 8 };
      const chartH = mH - PAD.top - PAD.bottom;
      const barUnit = (W - PAD.left - PAD.right) / n;
      const barW = Math.max(1, barUnit * 0.85);
      const xBar = (i: number) => PAD.left + (i + 0.5) * barUnit;
      const base = PAD.top + chartH;
      const yV = (v: number) => PAD.top + chartH - (v / 20) * chartH;

      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, W, mH);

      // Grid
      ctx.font = '10px "Share Tech Mono"'; ctx.textAlign = "left";
      for (const v of [0, 5, 10, 15, 20]) {
        const y = yV(v);
        if (v === 10) {
          ctx.strokeStyle = "rgba(255,0,128,0.35)"; ctx.setLineDash([4, 3]);
        } else {
          ctx.strokeStyle = "rgba(46,58,80,0.9)"; ctx.setLineDash([]);
        }
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(String(v), W - PAD.right + 4, y + 3);
      }

      // X labels
      const step = Math.max(1, Math.floor(n / 10));
      ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center";
      for (let i = 0; i < n; i += step) {
        if (!dates[i]) continue;
        const d = dates[i];
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        ctx.fillText(label, xBar(i), mH - 5);
      }

      // Stacked histogram: green(20) → yellow(hotMoney) → red(banker)
      for (let i = 0; i < n; i++) {
        const x = xBar(i);
        const bk = banker[i]   ?? 0;
        const hm = hotMoney[i] ?? 0;

        ctx.fillStyle = "#22aa55";
        ctx.fillRect(x - barW / 2, yV(20), barW, base - yV(20));

        if (hm > 0) {
          ctx.fillStyle = "#d8c200";
          ctx.fillRect(x - barW / 2, yV(hm), barW, base - yV(hm));
        }

        if (bk > 0) {
          ctx.fillStyle = "#ff3a3a";
          ctx.fillRect(x - barW / 2, yV(bk), barW, base - yV(bk));
        }
      }

      // BankerMA line (blue)
      ctx.strokeStyle = "#5b9cf6"; ctx.lineWidth = 2.2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        if (bankerMA[i] === null) { started = false; continue; }
        if (!started) { ctx.moveTo(xBar(i), yV(bankerMA[i]!)); started = true; }
        else ctx.lineTo(xBar(i), yV(bankerMA[i]!));
      }
      ctx.stroke();

      // Crosshair
      if (xhairIdx >= 0 && xhairIdx < n) {
        const x = xBar(xhairIdx);
        ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, mH - PAD.bottom); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    function drawAll() { drawCandle(); drawMCDX(); }

    // ── tooltip ─────────────────────────────────────────────────────
    let tooltipEl = document.getElementById("mcdx-tooltip");
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.id = "mcdx-tooltip";
      tooltipEl.style.cssText =
        "position:fixed;z-index:200;background:rgba(8,8,18,0.97);border:1px solid #2e3a50;border-radius:8px;padding:10px 14px;font-size:0.75rem;pointer-events:none;display:none;box-shadow:0 6px 24px rgba(0,0,0,0.7);min-width:200px;font-family:'Share Tech Mono',monospace;color:#e2e8f0;";
      document.body.appendChild(tooltipEl);
    }

    function showTooltip(e: MouseEvent, idx: number) {
      const { dates, O, H, L, C, V, banker, hotMoney, bankerMA } = data;
      const d = dates[idx];
      const dStr = d
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : "";
      const fmt = (v: number | null) => (v != null ? "$" + v.toFixed(2) : "—");
      const fmtV = (v: number | null) => {
        if (!v) return "—";
        if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
        if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
        return (v / 1e3).toFixed(1) + "K";
      };
      const up = (C[idx] ?? 0) >= (O[idx] ?? 0);
      const col = up ? "#26a69a" : "#ef5350";
      const bk = banker[idx];
      const hm = hotMoney[idx];
      const bma = bankerMA[idx];
      const score = bk !== null && hm !== null ? bk * 0.7 + hm * 0.3 : null;
      const signalText = score === null ? "—"
        : score >= 12 ? '<span style="color:#ff3a3a">强龙出水</span>'
        : score >= 7  ? '<span style="color:#d8c200">龙蛇混杂</span>'
        : score >= 3  ? '<span style="color:#22aa55">小龙调优</span>'
        : '<span style="color:#94a3b8">神龙潜渊</span>';

      tooltipEl!.innerHTML = `
        <div style="color:#c9a84c;font-weight:700;margin-bottom:6px">${dStr}</div>
        <div style="display:flex;justify-content:space-between;gap:14px;margin:1px 0"><span style="color:#94a3b8">开</span><span style="color:${col}">${fmt(O[idx])}</span></div>
        <div style="display:flex;justify-content:space-between;gap:14px;margin:1px 0"><span style="color:#94a3b8">高</span><span style="color:#26a69a">${fmt(H[idx])}</span></div>
        <div style="display:flex;justify-content:space-between;gap:14px;margin:1px 0"><span style="color:#94a3b8">低</span><span style="color:#ef5350">${fmt(L[idx])}</span></div>
        <div style="display:flex;justify-content:space-between;gap:14px;margin:1px 0"><span style="color:#94a3b8">收</span><span style="color:${col}">${fmt(C[idx])}</span></div>
        <div style="display:flex;justify-content:space-between;gap:14px;margin:1px 0"><span style="color:#94a3b8">量</span><span>${fmtV(V[idx])}</span></div>
        <div style="border-top:1px solid #2e3a50;margin:5px 0"></div>
        <div style="display:flex;justify-content:space-between;gap:14px;margin:1px 0"><span style="color:#94a3b8">庄家</span><span style="color:#ff3a3a">${bk !== null ? bk.toFixed(2) : "—"}</span></div>
        <div style="display:flex;justify-content:space-between;gap:14px;margin:1px 0"><span style="color:#94a3b8">游资</span><span style="color:#d8c200">${hm !== null ? hm.toFixed(2) : "—"}</span></div>
        <div style="display:flex;justify-content:space-between;gap:14px;margin:1px 0"><span style="color:#94a3b8">BankerMA</span><span style="color:#5b9cf6">${bma !== null ? bma.toFixed(2) : "—"}</span></div>
        <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">信号</span><span>${signalText}</span></div>
      `;
      tooltipEl!.style.display = "block";
      tooltipEl!.style.left = Math.min(e.clientX + 14, window.innerWidth - 220) + "px";
      tooltipEl!.style.top  = Math.max(e.clientY - 10, 0) + "px";
    }

    function hideTooltip() {
      if (tooltipEl) tooltipEl.style.display = "none";
    }

    // ── mouse handlers ───────────────────────────────────────────────
    function makeOnMove(canvas: HTMLCanvasElement) {
      return (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const W = canvas.parentElement!.clientWidth;
        const n = data.C.length;
        const barUnit = (W - 8 - 78) / n; // PAD.left=8, PAD.right=78
        const idx = Math.round((e.clientX - rect.left - 8) / barUnit - 0.5);
        if (idx < 0 || idx >= n) { xhairIdx = -1; drawAll(); hideTooltip(); return; }
        xhairIdx = idx;
        drawAll();
        showTooltip(e, idx);
      };
    }

    const onCandleMove = makeOnMove(cCanvas);
    const onMCDXMove   = makeOnMove(mCanvas);
    const onLeave = () => { xhairIdx = -1; drawAll(); hideTooltip(); };

    // Initial draw
    drawAll();

    // ResizeObserver
    const ro = new ResizeObserver(drawAll);
    ro.observe(cCanvas.parentElement!);

    // Remove stale listeners
    (cCanvas as unknown as Record<string, unknown>)._mcdxCMove &&
      cCanvas.removeEventListener("mousemove", (cCanvas as unknown as Record<string, unknown>)._mcdxCMove as EventListener);
    (mCanvas as unknown as Record<string, unknown>)._mcdxMMove &&
      mCanvas.removeEventListener("mousemove", (mCanvas as unknown as Record<string, unknown>)._mcdxMMove as EventListener);

    (cCanvas as unknown as Record<string, unknown>)._mcdxCMove = onCandleMove;
    (mCanvas as unknown as Record<string, unknown>)._mcdxMMove = onMCDXMove;
    cCanvas.addEventListener("mousemove", onCandleMove);
    mCanvas.addEventListener("mousemove", onMCDXMove);
    cCanvas.addEventListener("mouseleave", onLeave);
    mCanvas.addEventListener("mouseleave", onLeave);

    return () => {
      ro.disconnect();
      cCanvas.removeEventListener("mousemove", onCandleMove);
      mCanvas.removeEventListener("mousemove", onMCDXMove);
      cCanvas.removeEventListener("mouseleave", onLeave);
      mCanvas.removeEventListener("mouseleave", onLeave);
      hideTooltip();
    };
  }, [data, interval]);

  return (
    <div className="panel overflow-hidden">
      {/* Candle chart header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 flex-wrap gap-2">
        <span className="text-[10px] tracking-widest text-muted/60">K线图 + MA均线</span>
        <div className="flex gap-3 flex-wrap">
          {MA_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              <span className="w-5 h-0.5 inline-block rounded" style={{ background: MA_COLORS[i] }} />
              <span className="text-[9px] text-muted/50">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <canvas ref={candleRef} className="block w-full cursor-crosshair" />

      {/* MCDX chart header */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-b border-border/60 flex-wrap gap-2">
        <span className="text-[10px] tracking-widest text-muted/60">六彩神龙 · MCDX Smart Money</span>
        <div className="flex gap-3 flex-wrap">
          {[
            { color: "#22aa55", label: "散户 (20)" },
            { color: "#d8c200", label: "游资" },
            { color: "#ff3a3a", label: "庄家" },
            { color: "#5b9cf6", label: "Banker MA(10)", line: true },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1">
              {l.line
                ? <span className="w-5 h-0.5 inline-block rounded" style={{ background: l.color }} />
                : <span className="w-2.5 h-2.5 inline-block rounded-sm" style={{ background: l.color }} />
              }
              <span className="text-[9px] text-muted/50">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      <canvas ref={mcdxRef} className="block w-full cursor-crosshair" />
    </div>
  );
}
