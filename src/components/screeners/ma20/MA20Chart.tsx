"use client";

import { useRef, useEffect } from "react";
import type { MA20ChartData } from "@/types";

interface Props {
  chart:     MA20ChartData;
  direction: "up" | "dn";
}

const PRICE_H = 200;
const PAD     = { top: 10, right: 54, bottom: 18, left: 6 };
const FONT    = '"Share Tech Mono", monospace';

const C_BULL  = "#26a69a";
const C_BEAR  = "#ef5350";
const C_GOLD  = "#c9a84c";
const C_MUTED = "#94a3b8";
const C_GRID  = "rgba(46,58,80,0.6)";
const C_BG    = "#111827";

export default function MA20Chart({ chart, direction }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef   = useRef({ start: 0, end: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const n = chart.close.length;
    viewRef.current = { start: Math.max(0, n - 60), end: n };

    const maColor = direction === "up" ? "#00e676" : "#ff1744";

    function draw() {
      const W = Math.max(canvas!.parentElement!.clientWidth || 400, 200);
      const DPR = window.devicePixelRatio || 1;
      canvas!.width  = W * DPR;
      canvas!.height = PRICE_H * DPR;
      canvas!.style.width  = W + "px";
      canvas!.style.height = PRICE_H + "px";
      const ctx = canvas!.getContext("2d")!;
      ctx.scale(DPR, DPR);

      const vs = Math.max(0, Math.floor(viewRef.current.start));
      const ve = Math.min(n, Math.ceil(viewRef.current.end));
      const chartW = W - PAD.left - PAD.right;
      const barCnt = Math.max(1, ve - vs);
      const barUnit = chartW / barCnt;
      const barW  = Math.max(1, barUnit * 0.65);
      const xBar  = (i: number) => PAD.left + (i - vs + 0.5) * barUnit;

      ctx.fillStyle = C_BG;
      ctx.fillRect(0, 0, W, PRICE_H);

      const pT = PAD.top;
      const pB = PRICE_H - PAD.bottom;

      // Price range (include MA20 in range)
      let pLo = Infinity, pHi = -Infinity;
      for (let i = vs; i < ve; i++) {
        if (chart.high[i] != null) {
          pHi = Math.max(pHi, chart.high[i]);
          pLo = Math.min(pLo, chart.low[i]);
        }
        const m = chart.ma20[i];
        if (m != null) { pHi = Math.max(pHi, m); pLo = Math.min(pLo, m); }
      }
      if (!isFinite(pLo)) { pLo = 0; pHi = 100; }
      const pPad = (pHi - pLo) * 0.07 || 1;
      pLo -= pPad; pHi += pPad;
      const yP = (v: number) => pT + (1 - (v - pLo) / (pHi - pLo)) * (pB - pT);

      // Grid lines + Y labels
      ctx.font = `9px ${FONT}`; ctx.textAlign = "right"; ctx.fillStyle = C_MUTED;
      for (let g = 0; g <= 4; g++) {
        const y   = pT + (g / 4) * (pB - pT);
        const val = pHi - (g / 4) * (pHi - pLo);
        ctx.strokeStyle = C_GRID; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        ctx.fillText(
          "$" + (val >= 1000 ? val.toFixed(0) : val >= 100 ? val.toFixed(1) : val.toFixed(2)),
          W - PAD.right + 50,
          y + 3.5,
        );
      }

      // MA20 line
      ctx.strokeStyle = maColor; ctx.lineWidth = 1.5;
      ctx.beginPath();
      let maStarted = false;
      for (let i = vs; i < ve; i++) {
        const v = chart.ma20[i];
        if (v == null) { maStarted = false; continue; }
        if (!maStarted) { ctx.moveTo(xBar(i), yP(v)); maStarted = true; }
        else ctx.lineTo(xBar(i), yP(v));
      }
      ctx.stroke();

      // Candles
      for (let i = vs; i < ve; i++) {
        const O = chart.open[i], H = chart.high[i], L = chart.low[i], C = chart.close[i];
        if (O == null) continue;
        const bull = C >= O;
        ctx.strokeStyle = bull ? C_BULL : C_BEAR; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xBar(i), yP(H)); ctx.lineTo(xBar(i), yP(L)); ctx.stroke();
        ctx.fillStyle = bull ? C_BULL : C_BEAR;
        const top = yP(Math.max(C, O)), bot = yP(Math.min(C, O));
        ctx.fillRect(xBar(i) - barW / 2, top, barW, Math.max(bot - top, 1));
      }

      // Last price label
      const lastC = chart.close[ve - 1];
      if (lastC != null) {
        ctx.fillStyle = C_GOLD; ctx.font = `bold 9px ${FONT}`; ctx.textAlign = "right";
        ctx.fillText(
          "$" + (lastC >= 1000 ? lastC.toFixed(0) : lastC >= 100 ? lastC.toFixed(1) : lastC.toFixed(2)),
          W - PAD.right + 50,
          yP(lastC) - 5,
        );
      }

      // MA20 legend
      ctx.fillStyle = maColor; ctx.font = `9px ${FONT}`; ctx.textAlign = "left";
      ctx.fillText("MA20", PAD.left + 4, pT + 12);

      // X-axis dates
      const step = Math.max(1, Math.floor(barCnt / 5));
      ctx.fillStyle = C_MUTED; ctx.font = `9px ${FONT}`; ctx.textAlign = "center";
      for (let i = vs; i < ve; i += step) {
        const d = chart.dates[i];
        if (d) ctx.fillText(d.slice(5), xBar(i), PRICE_H - PAD.bottom / 2 + 5);
      }
    }

    // ─── Wheel zoom ───────────────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const W = Math.max(canvas!.parentElement!.clientWidth || 400, 200);
      const chartW = W - PAD.left - PAD.right;
      const rect = canvas!.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD.left) / chartW));
      const vs = viewRef.current.start, ve = viewRef.current.end;
      const vis = ve - vs;
      const factor = e.deltaY > 0 ? 1.2 : 0.83;
      const newVis = Math.max(10, Math.min(n, vis * factor));
      const anchor = vs + frac * vis;
      viewRef.current.start = Math.max(0, anchor - frac * newVis);
      viewRef.current.end   = Math.min(n, viewRef.current.start + newVis);
      if (viewRef.current.end > n) {
        viewRef.current.end   = n;
        viewRef.current.start = Math.max(0, n - newVis);
      }
      draw();
    };

    // ─── Drag (pointer) + Pinch (touch) ───────────────────────────
    const drag = { active: false, startX: 0, startS: 0, startE: 0 };
    let isPinching = false;
    let touchPinch: { startDist: number; startVis: number; startS: number; midFrac: number } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isPinching = true;
        drag.active = false;
        e.preventDefault();
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.abs(t0.clientX - t1.clientX);
        const midX = (t0.clientX + t1.clientX) / 2;
        const W = Math.max(canvas!.parentElement!.clientWidth || 400, 200);
        const chartW = W - PAD.left - PAD.right;
        const rect = canvas!.getBoundingClientRect();
        touchPinch = {
          startDist: Math.max(dist, 1),
          startVis:  viewRef.current.end - viewRef.current.start,
          startS:    viewRef.current.start,
          midFrac:   Math.max(0, Math.min(1, (midX - rect.left - PAD.left) / chartW)),
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchPinch) {
        e.preventDefault();
        const t0 = e.touches[0], t1 = e.touches[1];
        const newDist = Math.max(Math.abs(t0.clientX - t1.clientX), 1);
        const scale = touchPinch.startDist / newDist;
        const newVis = Math.max(10, Math.min(n, touchPinch.startVis * scale));
        const anchor = touchPinch.startS + touchPinch.midFrac * touchPinch.startVis;
        viewRef.current.start = Math.max(0, anchor - touchPinch.midFrac * newVis);
        viewRef.current.end   = Math.min(n, viewRef.current.start + newVis);
        if (viewRef.current.end > n) { viewRef.current.end = n; viewRef.current.start = Math.max(0, n - newVis); }
        draw();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) { touchPinch = null; isPinching = false; }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (isPinching) return;
      canvas!.setPointerCapture(e.pointerId);
      drag.active = true;
      drag.startX = e.clientX;
      drag.startS = viewRef.current.start;
      drag.startE = viewRef.current.end;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isPinching || !drag.active) return;
      const W = Math.max(canvas!.parentElement!.clientWidth || 400, 200);
      const chartW = W - PAD.left - PAD.right;
      const vis = drag.startE - drag.startS;
      const bpp = vis / chartW;
      const delta = -(e.clientX - drag.startX) * bpp;
      let ns = drag.startS + delta, ne = drag.startE + delta;
      if (ns < 0) { ns = 0; ne = vis; }
      if (ne > n) { ne = n; ns = n - vis; }
      viewRef.current.start = ns;
      viewRef.current.end   = ne;
      draw();
    };

    const onPointerUp = () => { drag.active = false; };

    const ro = new ResizeObserver(draw);
    ro.observe(canvas.parentElement!);

    canvas.addEventListener("wheel",        onWheel,       { passive: false });
    canvas.addEventListener("touchstart",   onTouchStart,  { passive: false });
    canvas.addEventListener("touchmove",    onTouchMove,   { passive: false });
    canvas.addEventListener("touchend",     onTouchEnd);
    canvas.addEventListener("touchcancel",  onTouchEnd);
    canvas.addEventListener("pointerdown",  onPointerDown);
    canvas.addEventListener("pointermove",  onPointerMove);
    canvas.addEventListener("pointerup",    onPointerUp);

    draw();

    return () => {
      ro.disconnect();
      canvas.removeEventListener("wheel",        onWheel);
      canvas.removeEventListener("touchstart",   onTouchStart);
      canvas.removeEventListener("touchmove",    onTouchMove);
      canvas.removeEventListener("touchend",     onTouchEnd);
      canvas.removeEventListener("touchcancel",  onTouchEnd);
      canvas.removeEventListener("pointerdown",  onPointerDown);
      canvas.removeEventListener("pointermove",  onPointerMove);
      canvas.removeEventListener("pointerup",    onPointerUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, direction]);

  return (
    <div className="overflow-hidden rounded-b">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair touch-none select-none"
      />
    </div>
  );
}
