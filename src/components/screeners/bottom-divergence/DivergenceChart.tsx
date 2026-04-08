"use client";

import { useRef, useEffect } from "react";
import type { DivergenceChartData, DivergenceDetail } from "@/types";

interface Props {
  chart: DivergenceChartData;
  macdDetail?: DivergenceDetail;
  rsiDetail?: DivergenceDetail;
}

// ─── Layout ───────────────────────────────────────────────────────
const CANDLE_H = 180;
const VOL_RATIO = 0.18;
const MACD_H   = 90;
const RSI_H    = 70;
const PAD      = { top: 10, right: 54, bottom: 20, left: 6 };
const FONT     = '"Share Tech Mono", monospace';
const TOTAL_H  = CANDLE_H + MACD_H + RSI_H;

// ─── Colors ───────────────────────────────────────────────────────
const C_BULL   = "#26a69a";
const C_BEAR   = "#ef5350";
const C_GOLD   = "#c9a84c";
const C_PURPLE = "#a78bfa";
const C_MUTED  = "#94a3b8";
const C_GRID   = "rgba(46,58,80,0.6)";
const C_SEP    = "#2e3a50";
const C_BG     = "#111827";

export default function DivergenceChart({ chart, macdDetail, rsiDetail }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef   = useRef({ start: 0, end: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const n = chart.close.length;
    viewRef.current = { start: Math.max(0, n - 80), end: n };

    // ─── Derived marker indices from detail ──────────────────────
    function detailToIndices(d: DivergenceDetail) {
      const b2 = n - 1 - d.bars_ago;
      const b1 = Math.max(0, b2 - d.gap_bars);
      return { b1, b2 };
    }

    const macdM = macdDetail ? detailToIndices(macdDetail) : null;
    const rsiM  = rsiDetail  ? detailToIndices(rsiDetail)  : null;
    // Use price markers from whichever is available
    const priceM = macdM ?? rsiM;

    // ─── Draw ─────────────────────────────────────────────────────
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

      // ── Candle panel ──────────────────────────────────────────
      const priceBottom = CANDLE_H - Math.round((CANDLE_H - PAD.top - PAD.bottom) * VOL_RATIO) - PAD.bottom - 2;
      const volTop      = CANDLE_H - Math.round((CANDLE_H - PAD.top - PAD.bottom) * VOL_RATIO) - PAD.bottom;
      const volBottom   = CANDLE_H - PAD.bottom;

      let pLo = Infinity, pHi = -Infinity;
      for (let i = vs; i < ve; i++) {
        if (chart.high[i] != null) { pHi = Math.max(pHi, chart.high[i]); pLo = Math.min(pLo, chart.low[i]); }
      }
      if (!isFinite(pLo)) { pLo = 0; pHi = 100; }
      const pPad = (pHi - pLo) * 0.06 || 1;
      pLo -= pPad; pHi += pPad;
      const yP = (v: number) => PAD.top + (1 - (v - pLo) / (pHi - pLo)) * (priceBottom - PAD.top);

      // Grid
      ctx.font = `9px ${FONT}`; ctx.textAlign = "right"; ctx.fillStyle = C_MUTED;
      for (let g = 0; g <= 4; g++) {
        const y = PAD.top + (g / 4) * (priceBottom - PAD.top);
        const val = pHi - (g / 4) * (pHi - pLo);
        ctx.strokeStyle = C_GRID; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        ctx.fillText("$" + (val >= 1000 ? val.toFixed(0) : val >= 100 ? val.toFixed(1) : val.toFixed(2)), W - PAD.right + 50, y + 3.5);
      }

      // Volume
      let vMax = 0;
      for (let i = vs; i < ve; i++) if (chart.volume[i] > 0) vMax = Math.max(vMax, chart.volume[i]);
      const yV = (v: number) => vMax > 0 ? volTop + (1 - v / vMax) * (volBottom - volTop - 1) : volBottom;
      for (let i = vs; i < ve; i++) {
        const bull = chart.close[i] >= chart.open[i];
        ctx.fillStyle = bull ? "rgba(38,166,154,0.35)" : "rgba(239,83,80,0.35)";
        ctx.fillRect(xBar(i) - barW / 2, yV(chart.volume[i]), barW, volBottom - yV(chart.volume[i]));
      }

      // Candles
      for (let i = vs; i < ve; i++) {
        const O = chart.open[i], H = chart.high[i], L = chart.low[i], C = chart.close[i];
        const bull = C >= O;
        ctx.strokeStyle = bull ? C_BULL : C_BEAR; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xBar(i), yP(H)); ctx.lineTo(xBar(i), yP(L)); ctx.stroke();
        ctx.fillStyle = bull ? C_BULL : C_BEAR;
        const top = yP(Math.max(C, O)), bot = yP(Math.min(C, O));
        ctx.fillRect(xBar(i) - barW / 2, top, barW, Math.max(bot - top, 1));
      }

      // Price divergence markers
      if (priceM && priceM.b1 >= vs && priceM.b2 < ve) {
        const x1 = xBar(priceM.b1), y1 = yP(chart.low[priceM.b1]);
        const x2 = xBar(priceM.b2), y2 = yP(chart.low[priceM.b2]);
        ctx.save();
        ctx.strokeStyle = C_GOLD; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(x1, y1 + 4); ctx.lineTo(x2, y2 + 4); ctx.stroke();
        ctx.setLineDash([]);
        for (const [x, y] of [[x1, y1 + 4], [x2, y2 + 4]] as [number, number][]) {
          ctx.fillStyle = C_GOLD; ctx.strokeStyle = C_BG; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }

      // X-axis dates
      const step = Math.max(1, Math.floor(barCnt / 5));
      ctx.fillStyle = C_MUTED; ctx.font = `9px ${FONT}`; ctx.textAlign = "center";
      for (let i = vs; i < ve; i += step) {
        const d = chart.dates[i];
        if (d) ctx.fillText(d.slice(5), xBar(i), CANDLE_H - PAD.bottom / 2 + 8);
      }

      // ── MACD panel ───────────────────────────────────────────
      drawPanel(ctx, "MACD", CANDLE_H, W, PAD);
      {
        const pT = CANDLE_H + 16, pB = CANDLE_H + MACD_H - 4;
        let lo = Infinity, hi = -Infinity;
        for (let i = vs; i < ve; i++) {
          const vals = [chart.hist[i], chart.diff[i], chart.dea[i]];
          for (const v of vals) if (isFinite(v)) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
        }
        if (!isFinite(lo)) { lo = -0.5; hi = 0.5; }
        const mp = (hi - lo) * 0.08 || 0.05; lo -= mp; hi += mp;
        const yM = (v: number) => pT + (1 - (v - lo) / (hi - lo)) * (pB - pT);
        const zero = yM(0);

        // Zero line
        ctx.strokeStyle = "rgba(46,58,80,0.9)"; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(PAD.left, zero); ctx.lineTo(W - PAD.right, zero); ctx.stroke();

        // Histogram
        for (let i = vs; i < ve; i++) {
          const h = chart.hist[i];
          if (!isFinite(h)) continue;
          ctx.fillStyle = h >= 0 ? "rgba(0,230,118,0.6)" : "rgba(255,23,68,0.6)";
          const y0 = yM(0), y1 = yM(h);
          ctx.fillRect(xBar(i) - barW / 2, Math.min(y0, y1), barW, Math.abs(y1 - y0) || 1);
        }
        // DIFF line (purple)
        drawLine(ctx, chart.diff, vs, ve, xBar, yM, C_PURPLE, 1.5);
        // DEA line (gold)
        drawLine(ctx, chart.dea, vs, ve, xBar, yM, C_GOLD, 1.2);

        // Scale labels
        ctx.fillStyle = C_MUTED; ctx.font = `9px ${FONT}`; ctx.textAlign = "right";
        ctx.fillText(hi.toFixed(3), W - PAD.right + 50, pT + 10);
        ctx.fillText(lo.toFixed(3), W - PAD.right + 50, pB);

        // MACD divergence markers
        if (macdM && macdM.b1 >= vs && macdM.b2 < ve) {
          const x1 = xBar(macdM.b1), y1 = yM(chart.diff[macdM.b1]);
          const x2 = xBar(macdM.b2), y2 = yM(chart.diff[macdM.b2]);
          ctx.save();
          ctx.strokeStyle = C_PURPLE; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.setLineDash([]);
          for (const [x, y] of [[x1, y1], [x2, y2]] as [number, number][]) {
            ctx.fillStyle = C_PURPLE; ctx.strokeStyle = C_BG; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          }
          ctx.restore();
        }
      }

      // ── RSI panel ────────────────────────────────────────────
      drawPanel(ctx, "RSI 14", CANDLE_H + MACD_H, W, PAD);
      {
        const pT = CANDLE_H + MACD_H + 14, pB = TOTAL_H - 4;
        const yR = (v: number) => pT + (1 - v / 100) * (pB - pT);

        // Reference lines 70 / 35 / 30
        for (const [level, color, dash] of [
          [70, "rgba(239,83,80,0.35)",  [3, 3]],
          [35, "rgba(247,201,72,0.4)",  [4, 3]],
          [30, "rgba(0,230,118,0.35)",  [3, 3]],
        ] as [number, string, number[]][]) {
          ctx.strokeStyle = color; ctx.lineWidth = 0.8; ctx.setLineDash(dash);
          ctx.beginPath(); ctx.moveTo(PAD.left, yR(level)); ctx.lineTo(W - PAD.right, yR(level)); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = C_MUTED; ctx.font = `9px ${FONT}`; ctx.textAlign = "right";
          ctx.fillText(String(level), W - PAD.right + 50, yR(level) + 3.5);
        }

        // RSI line
        drawLine(ctx, chart.rsi, vs, ve, xBar, yR, C_BULL, 1.5);

        // RSI divergence markers
        if (rsiM && rsiM.b1 >= vs && rsiM.b2 < ve) {
          const x1 = xBar(rsiM.b1), y1 = yR(chart.rsi[rsiM.b1]);
          const x2 = xBar(rsiM.b2), y2 = yR(chart.rsi[rsiM.b2]);
          ctx.save();
          ctx.strokeStyle = C_BULL; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.setLineDash([]);
          for (const [x, y] of [[x1, y1], [x2, y2]] as [number, number][]) {
            ctx.fillStyle = C_BULL; ctx.strokeStyle = C_BG; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          }
          ctx.restore();
        }
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
  }, [chart, macdDetail, rsiDetail]);

  return (
    <div className="overflow-hidden rounded-b">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair touch-none select-none"
      />
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function drawPanel(
  ctx: CanvasRenderingContext2D,
  label: string,
  yOffset: number,
  W: number,
  pad: typeof PAD,
) {
  ctx.strokeStyle = C_SEP; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.left, yOffset); ctx.lineTo(W - pad.right, yOffset); ctx.stroke();
  ctx.fillStyle = C_MUTED; ctx.font = `9px ${FONT}`; ctx.textAlign = "left";
  ctx.fillText(label, pad.left + 4, yOffset + 12);
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  arr: number[],
  vs: number, ve: number,
  xBar: (i: number) => number,
  yFn: (v: number) => number,
  color: string,
  lineWidth: number,
) {
  ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
  ctx.beginPath();
  let started = false;
  for (let i = vs; i < ve; i++) {
    const v = arr[i];
    if (!isFinite(v)) { started = false; continue; }
    if (!started) { ctx.moveTo(xBar(i), yFn(v)); started = true; }
    else ctx.lineTo(xBar(i), yFn(v));
  }
  ctx.stroke();
}
