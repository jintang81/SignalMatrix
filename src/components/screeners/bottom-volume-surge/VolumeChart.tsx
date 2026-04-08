"use client";

import { useRef, useEffect } from "react";
import type { VolumeSurgeChartData } from "@/types";

interface Props {
  chart: VolumeSurgeChartData;
}

// ─── Layout ───────────────────────────────────────────────────────
const PRICE_H = 180;
const VOL_H   = 60;
const TOTAL_H = PRICE_H + VOL_H;
const PAD     = { top: 10, right: 54, bottom: 18, left: 6 };
const FONT    = '"Share Tech Mono", monospace';

// ─── Colors ───────────────────────────────────────────────────────
const C_BULL   = "#26a69a";
const C_BEAR   = "#ef5350";
const C_GOLD   = "#c9a84c";
const C_PURPLE = "#a78bfa";
const C_BLUE   = "#3b82f6";
const C_MUTED  = "#94a3b8";
const C_GRID   = "rgba(46,58,80,0.6)";
const C_SEP    = "#2e3a50";
const C_BG     = "#111827";

export default function VolumeChart({ chart }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef   = useRef({ start: 0, end: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const n = chart.close.length;
    viewRef.current = { start: Math.max(0, n - 60), end: n };

    function draw() {
      const W = Math.max(canvas!.parentElement!.clientWidth || 400, 200);
      const DPR = window.devicePixelRatio || 1;
      canvas!.width  = W * DPR;
      canvas!.height = TOTAL_H * DPR;
      canvas!.style.width  = W + "px";
      canvas!.style.height = TOTAL_H + "px";
      const ctx = canvas!.getContext("2d")!;
      ctx.scale(DPR, DPR);

      const vs = Math.max(0, Math.floor(viewRef.current.start));
      const ve = Math.min(n, Math.ceil(viewRef.current.end));
      const chartW = W - PAD.left - PAD.right;
      const barCnt = Math.max(1, ve - vs);
      const barUnit = chartW / barCnt;
      const barW = Math.max(1, barUnit * 0.65);
      const xBar = (i: number) => PAD.left + (i - vs + 0.5) * barUnit;

      ctx.fillStyle = C_BG;
      ctx.fillRect(0, 0, W, TOTAL_H);

      // ── Price Panel ─────────────────────────────────────────────
      const pT = PAD.top;
      const pB = PRICE_H - PAD.bottom;

      let pLo = Infinity, pHi = -Infinity;
      for (let i = vs; i < ve; i++) {
        if (chart.high[i] != null) {
          pHi = Math.max(pHi, chart.high[i]);
          pLo = Math.min(pLo, chart.low[i]);
        }
        // Include MA50 in range
        const m = chart.ma50[i];
        if (m != null) { pHi = Math.max(pHi, m); pLo = Math.min(pLo, m); }
      }
      if (!isFinite(pLo)) { pLo = 0; pHi = 100; }
      const pPad = (pHi - pLo) * 0.07 || 1;
      pLo -= pPad; pHi += pPad;
      const yP = (v: number) => pT + (1 - (v - pLo) / (pHi - pLo)) * (pB - pT);

      // Grid lines + Y axis labels
      ctx.font = `9px ${FONT}`; ctx.textAlign = "right"; ctx.fillStyle = C_MUTED;
      for (let g = 0; g <= 4; g++) {
        const y = pT + (g / 4) * (pB - pT);
        const val = pHi - (g / 4) * (pHi - pLo);
        ctx.strokeStyle = C_GRID; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        ctx.fillText(
          "$" + (val >= 1000 ? val.toFixed(0) : val >= 100 ? val.toFixed(1) : val.toFixed(2)),
          W - PAD.right + 50,
          y + 3.5,
        );
      }

      // MA50 line (purple)
      ctx.strokeStyle = C_PURPLE; ctx.lineWidth = 1.5;
      ctx.beginPath();
      let maStarted = false;
      for (let i = vs; i < ve; i++) {
        const v = chart.ma50[i];
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

      // MA50 legend
      ctx.fillStyle = C_PURPLE; ctx.font = `9px ${FONT}`; ctx.textAlign = "left";
      ctx.fillText("MA50", PAD.left + 4, pT + 12);

      // X-axis dates
      const step = Math.max(1, Math.floor(barCnt / 5));
      ctx.fillStyle = C_MUTED; ctx.font = `9px ${FONT}`; ctx.textAlign = "center";
      for (let i = vs; i < ve; i += step) {
        const d = chart.dates[i];
        if (d) ctx.fillText(d.slice(5), xBar(i), PRICE_H - PAD.bottom / 2 + 5);
      }

      // ── Volume Panel ────────────────────────────────────────────
      ctx.strokeStyle = C_SEP; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, PRICE_H); ctx.lineTo(W - PAD.right, PRICE_H); ctx.stroke();
      ctx.fillStyle = C_MUTED; ctx.font = `9px ${FONT}`; ctx.textAlign = "left";
      ctx.fillText("VOL MA20", PAD.left + 4, PRICE_H + 10);

      const vT = PRICE_H + 16;
      const vB = TOTAL_H - 4;

      let vMax = 0;
      for (let i = vs; i < ve; i++) {
        if (chart.volume[i] > 0) vMax = Math.max(vMax, chart.volume[i]);
      }
      const yV = (v: number) => vMax > 0 ? vT + (1 - v / vMax) * (vB - vT - 1) : vB;

      // Volume bars — highlight last 2 bars (surge bars) in gold
      const surgeStart = n - 2;
      for (let i = vs; i < ve; i++) {
        const v = chart.volume[i];
        if (v == null) continue;
        const isSurge = i >= surgeStart;
        if (isSurge) {
          ctx.fillStyle = "rgba(201,168,76,0.85)";
        } else {
          const bull = chart.close[i] >= chart.open[i];
          ctx.fillStyle = bull ? "rgba(38,166,154,0.45)" : "rgba(239,83,80,0.45)";
        }
        const bh = Math.max(1, vB - yV(v));
        ctx.fillRect(xBar(i) - barW / 2, yV(v), barW, bh);
      }

      // Vol MA20 line (blue)
      ctx.strokeStyle = C_BLUE; ctx.lineWidth = 1.2;
      ctx.beginPath();
      let vmStarted = false;
      for (let i = vs; i < ve; i++) {
        const v = chart.vol_ma20[i];
        if (v == null) { vmStarted = false; continue; }
        if (!vmStarted) { ctx.moveTo(xBar(i), yV(v)); vmStarted = true; }
        else ctx.lineTo(xBar(i), yV(v));
      }
      ctx.stroke();
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

    // ─── Drag + pinch ─────────────────────────────────────────────
    const drag = { active: false, startX: 0, startS: 0, startE: 0 };
    const pointers = new Map<number, number>();
    let pinch: { startDist: number; startVis: number; startS: number; midFrac: number } | null = null;

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, e.clientX);
      canvas!.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        drag.active = true;
        drag.startX = e.clientX;
        drag.startS = viewRef.current.start;
        drag.startE = viewRef.current.end;
      } else if (pointers.size === 2) {
        drag.active = false;
        const xs = Array.from(pointers.values());
        const dist = Math.abs(xs[1] - xs[0]);
        const midX = (xs[0] + xs[1]) / 2;
        const W = Math.max(canvas!.parentElement!.clientWidth || 400, 200);
        const chartW = W - PAD.left - PAD.right;
        const rect = canvas!.getBoundingClientRect();
        pinch = {
          startDist: Math.max(dist, 1),
          startVis: viewRef.current.end - viewRef.current.start,
          startS: viewRef.current.start,
          midFrac: Math.max(0, Math.min(1, (midX - rect.left - PAD.left) / chartW)),
        };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pointers.set(e.pointerId, e.clientX);
      if (pointers.size >= 2 && pinch) {
        const xs = Array.from(pointers.values());
        const newDist = Math.max(Math.abs(xs[1] - xs[0]), 1);
        const scale = pinch.startDist / newDist;
        const newVis = Math.max(10, Math.min(n, pinch.startVis * scale));
        const anchor = pinch.startS + pinch.midFrac * pinch.startVis;
        viewRef.current.start = Math.max(0, anchor - pinch.midFrac * newVis);
        viewRef.current.end   = Math.min(n, viewRef.current.start + newVis);
        if (viewRef.current.end > n) { viewRef.current.end = n; viewRef.current.start = Math.max(0, n - newVis); }
        draw();
        return;
      }
      if (!drag.active) return;
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

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        drag.active = false;
      } else if (pointers.size === 1) {
        const [lastX] = Array.from(pointers.values());
        drag.active = true;
        drag.startX = lastX;
        drag.startS = viewRef.current.start;
        drag.startE = viewRef.current.end;
      }
    };

    const ro = new ResizeObserver(draw);
    ro.observe(canvas.parentElement!);

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);

    draw();

    return () => {
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart]);

  return (
    <div className="overflow-hidden rounded-b">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair touch-none select-none"
      />
    </div>
  );
}
