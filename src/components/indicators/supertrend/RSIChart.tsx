"use client";

import { useRef, useEffect } from "react";

interface Props {
  dates: Date[];
  rsi: number[];
  rsiMA: number[];
  interval: string;
}

export default function RSIChart({ dates, rsi, rsiMA, interval }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, dates, rsi, rsiMA, interval);

    const ro = new ResizeObserver(() => draw(canvas, dates, rsi, rsiMA, interval));
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [dates, rsi, rsiMA, interval]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
        <span className="text-[10px] tracking-widest text-muted/60">RSI 相对强弱指数</span>
        <div className="flex gap-3">
          {[
            { color: "#c9a84c", label: "RSI(14)" },
            { color: "#5b9cf6", label: "MA(6)" },
            { color: "#ef5350", label: "超买 70", dashed: true },
            { color: "#26a69a", label: "超卖 30", dashed: true },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1">
              <span
                className="w-5 h-0.5 inline-block rounded"
                style={{ background: l.color, opacity: l.dashed ? 0.6 : 1 }}
              />
              <span className="text-[9px] text-muted/50">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}

function draw(
  canvas: HTMLCanvasElement,
  dates: Date[],
  rsi: number[],
  rsiMA: number[],
  interval: string
) {
  const n = rsi.length;
  if (n === 0) return;

  const W = canvas.parentElement!.clientWidth;
  const H = 90;
  const DPR = window.devicePixelRatio || 1;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);

  const PAD = { top: 10, right: 82, bottom: 22, left: 8 };
  const plotH = H - PAD.top - PAD.bottom;
  const barUnit = (W - PAD.left - PAD.right) / n;
  const xBar = (i: number) => PAD.left + (i + 0.5) * barUnit;
  const yR = (v: number) => PAD.top + (1 - v / 100) * plotH;

  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, W, H);

  // Zones
  ctx.fillStyle = "rgba(239,83,80,0.07)";
  ctx.fillRect(PAD.left, yR(100), W - PAD.left - PAD.right, yR(70) - yR(100));
  ctx.fillStyle = "rgba(38,166,154,0.07)";
  ctx.fillRect(PAD.left, yR(30), W - PAD.left - PAD.right, yR(0) - yR(30));

  // Grid lines
  ctx.lineWidth = 1;
  ctx.font = '9px "Share Tech Mono"';
  ctx.textAlign = "right";
  for (const level of [70, 50, 30]) {
    const y = yR(level);
    ctx.strokeStyle = level === 50 ? "rgba(160,174,192,0.2)" : "rgba(160,174,192,0.12)";
    ctx.setLineDash(level === 50 ? [] : [4, 4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(String(level), W - PAD.right + 30, y + 3);
  }

  // RSI line (colored by zone)
  for (let i = 1; i < n; i++) {
    if (isNaN(rsi[i]) || isNaN(rsi[i - 1])) continue;
    const avg = (rsi[i] + rsi[i - 1]) / 2;
    ctx.strokeStyle = avg >= 70 ? "#ef5350" : avg <= 30 ? "#26a69a" : "#c9a84c";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(xBar(i - 1), yR(rsi[i - 1]));
    ctx.lineTo(xBar(i), yR(rsi[i]));
    ctx.stroke();
  }

  // RSI MA6
  ctx.strokeStyle = "rgba(91,156,246,0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < n; i++) {
    if (isNaN(rsiMA[i])) { started = false; continue; }
    if (!started) { ctx.moveTo(xBar(i), yR(rsiMA[i])); started = true; }
    else ctx.lineTo(xBar(i), yR(rsiMA[i]));
  }
  ctx.stroke();

  // X-axis dates
  const step = Math.max(1, Math.floor(n / 9));
  ctx.fillStyle = "#94a3b8"; ctx.font = '10px "Share Tech Mono"'; ctx.textAlign = "center";
  for (let i = 0; i < n; i += step) {
    if (!dates[i]) continue;
    const d = dates[i];
    const label = interval === "1h"
      ? `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
      : `${d.getMonth() + 1}/${d.getDate()}`;
    ctx.fillText(label, xBar(i), H - 5);
  }

  // Tooltip
  let tooltipEl = document.getElementById("st-tooltip");
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "st-tooltip";
    tooltipEl.style.cssText =
      "position:fixed;z-index:200;background:rgba(8,8,18,0.97);border:1px solid #2e3a50;border-radius:8px;padding:10px 14px;font-size:0.75rem;pointer-events:none;display:none;box-shadow:0 6px 24px rgba(0,0,0,0.7);min-width:200px;font-family:'Share Tech Mono',monospace;color:#e2e8f0;";
    document.body.appendChild(tooltipEl);
  }

  const onMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const idx = Math.round((e.clientX - rect.left - PAD.left) / barUnit - 0.5);
    if (idx < 0 || idx >= n) { tooltipEl!.style.display = "none"; return; }
    const d = dates[idx];
    const dStr = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
    const rVal = isNaN(rsi[idx]) ? "—" : rsi[idx].toFixed(2);
    const mVal = isNaN(rsiMA[idx]) ? "—" : rsiMA[idx].toFixed(2);
    const zone = !isNaN(rsi[idx])
      ? rsi[idx] >= 70 ? '<span style="color:#ef5350">超买</span>'
        : rsi[idx] <= 30 ? '<span style="color:#26a69a">超卖</span>'
        : '<span style="color:#94a3b8">中性</span>'
      : "—";
    tooltipEl!.innerHTML = `
      <div style="color:#c9a84c;font-weight:700;margin-bottom:6px">${dStr}</div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">RSI(14)</span><span style="color:#c9a84c">${rVal}</span></div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">MA(6)</span><span style="color:#5b9cf6">${mVal}</span></div>
      <div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">状态</span><span>${zone}</span></div>
    `;
    tooltipEl!.style.display = "block";
    tooltipEl!.style.left = Math.min(e.clientX + 14, window.innerWidth - 215) + "px";
    tooltipEl!.style.top = Math.max(e.clientY - 10, 0) + "px";
  };
  const onLeave = () => { if (tooltipEl) tooltipEl.style.display = "none"; };

  canvas.removeEventListener("mousemove", (canvas as unknown as Record<string, unknown>)._rsiMove as EventListener);
  canvas.removeEventListener("mouseleave", (canvas as unknown as Record<string, unknown>)._rsiLeave as EventListener);
  (canvas as unknown as Record<string, unknown>)._rsiMove = onMove;
  (canvas as unknown as Record<string, unknown>)._rsiLeave = onLeave;
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseleave", onLeave);
}
