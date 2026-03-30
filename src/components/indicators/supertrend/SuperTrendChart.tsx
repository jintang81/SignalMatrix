"use client";

import { useRef, useEffect } from "react";
import type { STToggles } from "./ControlBar";

export interface ChartSlice {
  dates: Date[];
  O: (number | null)[];
  H: (number | null)[];
  L: (number | null)[];
  C: (number | null)[];
  V: (number | null)[];
  st: number[];
  trend: number[];
  center: number[];
  support: number[];
  resistance: number[];
  ph: number[];
  pl: number[];
}

interface Props {
  data: ChartSlice;
  toggles: STToggles;
  interval: string;
}

export default function SuperTrendChart({ data, toggles, interval }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, data, toggles, interval);

    const ro = new ResizeObserver(() => draw(canvas, data, toggles, interval));
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [data, toggles, interval]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
        <span className="text-[10px] tracking-widest text-muted/60">K线图 + Pivot Point SuperTrend</span>
        <div className="flex gap-3 flex-wrap">
          {[
            { color: "#00e676", label: "多头线" },
            { color: "#ff1744", label: "空头线" },
            { color: "#5b9cf6", label: "中轴", dashed: true },
            { color: "#ffee00", label: "枢轴高", dot: true },
            { color: "#00e676", label: "枢轴低", dot: true },
            { color: "#26a69a", label: "支撑", dashed: true },
            { color: "#ef5350", label: "阻力", dashed: true },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1">
              {l.dot ? (
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: l.color }} />
              ) : (
                <span
                  className="w-5 h-0.5 inline-block rounded"
                  style={{
                    background: l.color,
                    opacity: l.dashed ? 0.7 : 1,
                    backgroundImage: l.dashed
                      ? `repeating-linear-gradient(90deg,${l.color} 0,${l.color} 3px,transparent 3px,transparent 6px)`
                      : undefined,
                  }}
                />
              )}
              <span className="text-[9px] text-muted/50">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} className="block w-full cursor-crosshair" />
    </div>
  );
}

function draw(
  canvas: HTMLCanvasElement,
  data: ChartSlice,
  toggles: STToggles,
  interval: string
) {
  const { dates, O, H, L, C, V, st, trend, center, support, resistance, ph, pl } = data;
  const { showPivots, showLabels, showCenter, showSR } = toggles;
  const n = C.length;
  if (n === 0) return;

  const W = canvas.parentElement!.clientWidth;
  const HTOT = Math.max(300, Math.min(440, Math.round(W * 0.32)));
  const DPR = window.devicePixelRatio || 1;
  canvas.width = W * DPR;
  canvas.height = HTOT * DPR;
  canvas.style.width = W + "px";
  canvas.style.height = HTOT + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);

  const PAD = { top: 28, right: 82, bottom: 28, left: 8 };
  const priceH = HTOT * 0.78;
  const volTop = priceH + HTOT * 0.03;
  const volH = HTOT * 0.16;
  const barUnit = (W - PAD.left - PAD.right) / n;
  const barW = barUnit * 0.68;

  // Price range
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (H[i] != null) { hi = Math.max(hi, H[i]!); lo = Math.min(lo, L[i]!); }
    if (!isNaN(st[i])) { hi = Math.max(hi, st[i]); lo = Math.min(lo, st[i]); }
    if (!isNaN(center[i])) { hi = Math.max(hi, center[i]); lo = Math.min(lo, center[i]); }
    if (showSR) {
      if (!isNaN(support[i])) lo = Math.min(lo, support[i]);
      if (!isNaN(resistance[i])) hi = Math.max(hi, resistance[i]);
    }
  }
  const rp = (hi - lo) * 0.06;
  lo -= rp; hi += rp;

  const yP = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (priceH - PAD.top - PAD.bottom);
  const xBar = (i: number) => PAD.left + (i + 0.5) * barUnit;
  const maxV = Math.max(...V.filter((v): v is number => v != null && v > 0));
  const yV = (v: number) => volTop + (1 - v / maxV) * (volH - 6);

  const redraw = () => {
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, W, HTOT);

    // Grid + labels
    ctx.strokeStyle = "rgba(46,58,80,0.9)";
    ctx.lineWidth = 1;
    ctx.font = '10px "Share Tech Mono"';
    ctx.textAlign = "right";
    ctx.fillStyle = "#94a3b8";
    for (let g = 0; g <= 5; g++) {
      const y = PAD.top + (g * (priceH - PAD.top - PAD.bottom)) / 5;
      const val = hi - (g * (hi - lo)) / 5;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      ctx.fillText("$" + val.toFixed(2), W - PAD.right + 76, y + 4);
    }

    // Trend shading
    for (let i = 0; i < n; i++) {
      if (!trend[i]) continue;
      ctx.fillStyle = trend[i] === 1 ? "rgba(0,230,118,0.05)" : "rgba(255,23,68,0.05)";
      ctx.fillRect(xBar(i) - barUnit / 2, PAD.top, barUnit, priceH - PAD.top - PAD.bottom);
    }

    // Volume
    for (let i = 0; i < n; i++) {
      const v = V[i]; if (!v || v <= 0) continue;
      ctx.fillStyle = (C[i] ?? 0) >= (O[i] ?? C[i] ?? 0) ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)";
      ctx.fillRect(xBar(i) - barW / 2, yV(v), barW, HTOT - PAD.bottom - yV(v));
    }

    // S/R step lines
    if (showSR) {
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      for (const [arr, color] of [
        [support, "rgba(38,166,154,0.65)"],
        [resistance, "rgba(239,83,80,0.65)"],
      ] as [number[], string][]) {
        ctx.strokeStyle = color;
        let started = false;
        let pv = NaN;
        for (let i = 0; i < n; i++) {
          if (isNaN(arr[i])) { started = false; pv = NaN; continue; }
          if (!started || arr[i] !== pv) {
            if (started) ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(xBar(i) - barUnit / 2, yP(arr[i]));
            started = true;
          }
          ctx.lineTo(xBar(i) + barUnit / 2, yP(arr[i]));
          pv = arr[i];
        }
        if (started) ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Center line
    if (showCenter) {
      ctx.strokeStyle = "rgba(91,156,246,0.72)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      let started = false;
      for (let i = 0; i < n; i++) {
        if (isNaN(center[i])) { started = false; continue; }
        if (!started) { ctx.beginPath(); ctx.moveTo(xBar(i), yP(center[i])); started = true; }
        else ctx.lineTo(xBar(i), yP(center[i]));
      }
      if (started) ctx.stroke();
      ctx.setLineDash([]);
    }

    // Candles
    for (let i = 0; i < n; i++) {
      if (C[i] == null || O[i] == null) continue;
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

    // SuperTrend line (colored segments)
    let segStart = -1, segTrend = 0;
    const drawSeg = (from: number, to: number, t: number) => {
      ctx.strokeStyle = t === 1 ? "#00e676" : "#ff1744";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let s = false;
      for (let j = from; j <= to; j++) {
        if (isNaN(st[j])) continue;
        if (!s) { ctx.moveTo(xBar(j), yP(st[j])); s = true; }
        else ctx.lineTo(xBar(j), yP(st[j]));
      }
      ctx.stroke();
    };
    for (let i = 0; i < n; i++) {
      if (isNaN(st[i])) continue;
      if (segStart < 0) { segStart = i; segTrend = trend[i]; continue; }
      if (trend[i] !== segTrend) {
        drawSeg(segStart, i - 1, segTrend);
        ctx.beginPath();
        ctx.arc(xBar(i - 1), yP(st[i - 1]), 5.5, 0, Math.PI * 2);
        ctx.fillStyle = trend[i] === 1 ? "#00e676" : "#ff1744";
        ctx.fill();
        ctx.strokeStyle = "#111827"; ctx.lineWidth = 1.5; ctx.stroke();
        segStart = i; segTrend = trend[i];
      }
    }
    if (segStart >= 0) drawSeg(segStart, n - 1, segTrend);

    // Pivot markers
    if (showPivots) {
      for (let i = 0; i < n; i++) {
        if (!isNaN(ph[i]) && H[i] != null) {
          const x = xBar(i), y = yP(H[i]!) - 10;
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#ffee00"; ctx.fill();
          ctx.strokeStyle = "#88888880"; ctx.lineWidth = 0.8; ctx.stroke();
          ctx.fillStyle = "#ef5350"; ctx.font = 'bold 9px "Share Tech Mono"'; ctx.textAlign = "center";
          ctx.fillText("H", x, y - 7);
        }
        if (!isNaN(pl[i]) && L[i] != null) {
          const x = xBar(i), y = yP(L[i]!) + 10;
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#00e676"; ctx.fill();
          ctx.strokeStyle = "#88888880"; ctx.lineWidth = 0.8; ctx.stroke();
          ctx.fillStyle = "#00e676"; ctx.font = 'bold 9px "Share Tech Mono"'; ctx.textAlign = "center";
          ctx.fillText("L", x, y + 17);
        }
      }
    }

    // Buy / Sell labels
    if (showLabels) {
      for (let i = 1; i < n; i++) {
        if (isNaN(st[i])) continue;
        const buy = trend[i] === 1 && trend[i - 1] === -1;
        const sell = trend[i] === -1 && trend[i - 1] === 1;
        if (buy) {
          const x = xBar(i), base = yP(st[i]) + 28, tip = yP(st[i]) + 8;
          ctx.fillStyle = "#00e676";
          ctx.beginPath(); ctx.moveTo(x, tip); ctx.lineTo(x - 9, base); ctx.lineTo(x + 9, base); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#00e676"; ctx.font = 'bold 8px "Share Tech Mono"'; ctx.textAlign = "center";
          ctx.fillText("BUY", x, base + 11);
        }
        if (sell) {
          const x = xBar(i), sy = yP(st[i]) - 24;
          ctx.fillStyle = "#ff1744";
          ctx.beginPath(); ctx.moveTo(x, yP(st[i]) - 8); ctx.lineTo(x - 9, sy); ctx.lineTo(x + 9, sy); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.font = 'bold 8px "Share Tech Mono"'; ctx.textAlign = "center";
          ctx.fillText("SELL", x, sy - 5);
        }
      }
    }

    // X-axis dates
    const step = Math.max(1, Math.floor(n / 9));
    ctx.fillStyle = "#94a3b8"; ctx.font = '10px "Share Tech Mono"'; ctx.textAlign = "center";
    for (let i = 0; i < n; i += step) {
      if (!dates[i]) continue;
      const d = dates[i];
      const label = interval === "1h"
        ? `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
        : `${d.getMonth() + 1}/${d.getDate()}`;
      ctx.fillText(label, xBar(i), HTOT - 8);
    }
  };

  redraw();

  // Tooltip & crosshair
  let tooltipEl = document.getElementById("st-tooltip");
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "st-tooltip";
    tooltipEl.style.cssText =
      "position:fixed;z-index:200;background:rgba(8,8,18,0.97);border:1px solid #2e3a50;border-radius:8px;padding:10px 14px;font-size:0.75rem;pointer-events:none;display:none;box-shadow:0 6px 24px rgba(0,0,0,0.7);min-width:200px;font-family:'Share Tech Mono',monospace;color:#e2e8f0;";
    document.body.appendChild(tooltipEl);
  }

  // Remove old listeners by replacing canvas clone pattern — instead just use onmousemove
  const onMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const idx = Math.round((e.clientX - rect.left - PAD.left) / barUnit - 0.5);
    if (idx < 0 || idx >= n) { tooltipEl!.style.display = "none"; return; }

    redraw();
    ctx.strokeStyle = "rgba(160,174,192,0.45)"; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(xBar(idx), PAD.top); ctx.lineTo(xBar(idx), priceH - PAD.bottom); ctx.stroke();
    if (C[idx] != null) {
      ctx.beginPath(); ctx.moveTo(PAD.left, yP(C[idx]!)); ctx.lineTo(W - PAD.right, yP(C[idx]!)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(201,168,76,0.9)";
      ctx.fillRect(W - PAD.right + 2, yP(C[idx]!) - 9, 72, 16);
      ctx.fillStyle = "#000"; ctx.font = 'bold 10px "Share Tech Mono"'; ctx.textAlign = "left";
      ctx.fillText("$" + C[idx]!.toFixed(2), W - PAD.right + 5, yP(C[idx]!) + 4);
    }
    ctx.setLineDash([]);

    const d = dates[idx];
    const dStr = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
    const tHtml = trend[idx] === 1
      ? '<span style="color:#00e676">▲ 多头</span>'
      : trend[idx] === -1 ? '<span style="color:#ff1744">▼ 空头</span>' : "—";
    const buy = idx > 0 && trend[idx] === 1 && trend[idx - 1] === -1;
    const sell = idx > 0 && trend[idx] === -1 && trend[idx - 1] === 1;
    const sigHtml = buy
      ? `<div style="margin:4px 0;color:#00e676">🟢 买入信号</div>`
      : sell ? `<div style="margin:4px 0;color:#ff1744">🔴 卖出信号</div>` : "";

    tooltipEl!.innerHTML = `
      <div style="color:#c9a84c;font-weight:700;margin-bottom:6px">${dStr}</div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">开</span><span>$${O[idx]?.toFixed(2) ?? "—"}</span></div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">高</span><span style="color:#26a69a">$${H[idx]?.toFixed(2) ?? "—"}</span></div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">低</span><span style="color:#ef5350">$${L[idx]?.toFixed(2) ?? "—"}</span></div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">收</span><span>$${C[idx]?.toFixed(2) ?? "—"}</span></div>
      <div style="border-top:1px solid #2e3a50;margin:5px 0"></div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">趋势</span><span>${tHtml}</span></div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">ST</span><span>${isNaN(st[idx]) ? "—" : "$" + st[idx].toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">Center</span><span style="color:#5b9cf6">${isNaN(center[idx]) ? "—" : "$" + center[idx].toFixed(2)}</span></div>
      ${showSR ? `<div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">支撑</span><span style="color:#26a69a">${isNaN(support[idx]) ? "—" : "$" + support[idx].toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">阻力</span><span style="color:#ef5350">${isNaN(resistance[idx]) ? "—" : "$" + resistance[idx].toFixed(2)}</span></div>` : ""}
      ${sigHtml}
    `;
    tooltipEl!.style.display = "block";
    tooltipEl!.style.left = Math.min(e.clientX + 14, window.innerWidth - 215) + "px";
    tooltipEl!.style.top = Math.max(e.clientY - 10, 0) + "px";
  };

  const onLeave = () => { if (tooltipEl) tooltipEl.style.display = "none"; };

  canvas.removeEventListener("mousemove", (canvas as unknown as Record<string, unknown>)._stMove as EventListener);
  canvas.removeEventListener("mouseleave", (canvas as unknown as Record<string, unknown>)._stLeave as EventListener);
  (canvas as unknown as Record<string, unknown>)._stMove = onMove;
  (canvas as unknown as Record<string, unknown>)._stLeave = onLeave;
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseleave", onLeave);
}
