"use client";

import { useEffect, useRef, useCallback } from "react";
import type { DuckChartData } from "@/types";

interface Props {
  chart: DuckChartData;
}

// ─── Colors (match design system) ────────────────────────────────
const C = {
  bg:      "#131c2e",
  grid:    "#1e2d42",
  zero:    "#2e3a50",
  bull:    "#26a69a",
  bear:    "#ef5350",
  diff:    "#26a69a",   // teal
  dea:     "#c9a84c",   // gold
  histPos: "rgba(38,166,154,0.75)",
  histNeg: "rgba(239,83,80,0.75)",
  ma5:     "#c9a84c",   // gold
  ma10:    "#26a69a",   // teal
  ma20:    "#94a3b8",   // muted
  volBull: "rgba(38,166,154,0.4)",
  volBear: "rgba(239,83,80,0.4)",
  text:    "#64748b",
  font:    "9px 'Share Tech Mono', monospace",
};

// Panel heights
const CANDLE_H = 180;
const MACD_H   = 120;
const GAP      = 4;
const PAD_L    = 6;
const PAD_R    = 46;
const PAD_T    = 8;
const PAD_B    = 20;

// MA calculation helpers
function calcMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

export default function DuckChart({ chart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const viewRef      = useRef({ start: 0, end: 0 });   // visible bar range [start, end)
  const dragRef      = useRef<{ x: number; start: number } | null>(null);
  const pointersRef  = useRef(new Map<number, number>());
  const pinchRef     = useRef<{ startDist: number; startVis: number; startS: number; midFrac: number } | null>(null);

  const n = chart.dates.length;
  const ma5Series  = calcMA(chart.close, 5);
  const ma10Series = calcMA(chart.close, 10);
  const ma20Series = calcMA(chart.close, 20);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth;
    const H = CANDLE_H + GAP + MACD_H;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width  = W;
      canvas.height = H;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const { start, end } = viewRef.current;
    const visN  = end - start;
    if (visN <= 0) return;

    const plotW = W - PAD_L - PAD_R;
    const barW  = plotW / visN;

    // ── Helper: x coord for bar index i (relative to start)
    const toX = (i: number) => PAD_L + (i - start + 0.5) * barW;

    const c2d = ctx;  // narrowed, non-null reference for use in helper closures

    // ── Grid lines helper
    function drawGrid(yTop: number, yBot: number, nLines: number) {
      c2d.strokeStyle = C.grid;
      c2d.lineWidth   = 0.5;
      for (let g = 0; g <= nLines; g++) {
        const y = yTop + (yBot - yTop) * g / nLines;
        c2d.beginPath();
        c2d.moveTo(PAD_L, y);
        c2d.lineTo(W - PAD_R, y);
        c2d.stroke();
      }
    }

    // ── Y axis labels helper
    function drawYLabels(yTop: number, yBot: number, vMin: number, vMax: number, nLines: number, fmt: (v: number) => string) {
      c2d.fillStyle    = C.text;
      c2d.font         = C.font;
      c2d.textAlign    = "left";
      c2d.textBaseline = "middle";
      const vRange = vMax - vMin;
      for (let g = 0; g <= nLines; g++) {
        const v = vMin + vRange * (1 - g / nLines);
        const y = yTop + (yBot - yTop) * g / nLines;
        c2d.fillText(fmt(v), W - PAD_R + 4, y);
      }
    }

    // ══════════════════════════════════════════
    // Panel 1: Candle chart
    // ══════════════════════════════════════════
    const volH  = Math.round(CANDLE_H * 0.18);
    const candleTop = PAD_T;
    const candleBot = CANDLE_H - volH - 4;

    const visClose = chart.close.slice(start, end);
    const visHigh  = chart.high.slice(start, end);
    const visLow   = chart.low.slice(start, end);

    const priceMax = Math.max(...visHigh) * 1.001;
    const priceMin = Math.min(...visLow)  * 0.999;
    const priceR   = priceMax - priceMin || 1;
    const toY1 = (v: number) => candleTop + (candleBot - candleTop) * (1 - (v - priceMin) / priceR);

    drawGrid(candleTop, candleBot, 4);
    drawYLabels(candleTop, candleBot, priceMin, priceMax, 4, (v) => v >= 1000 ? v.toFixed(0) : v.toFixed(2));

    // MA lines
    const maLines: { series: (number|null)[]; color: string }[] = [
      { series: ma5Series, color: C.ma5 },
      { series: ma10Series, color: C.ma10 },
      { series: ma20Series, color: C.ma20 },
    ];
    for (const { series, color } of maLines) {
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      let started = false;
      for (let i = start; i < end; i++) {
        const v = series[i];
        if (v == null) continue;
        const x = toX(i), y = toY1(v);
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        started = true;
      }
      ctx.stroke();
    }

    // Candles
    for (let i = start; i < end; i++) {
      const o = chart.open[i], c = chart.close[i];
      const h = chart.high[i], l = chart.low[i];
      const bull  = c >= o;
      const color = bull ? C.bull : C.bear;
      const xc    = toX(i);

      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(xc, toY1(h));
      ctx.lineTo(xc, toY1(l));
      ctx.stroke();

      ctx.fillStyle = bull ? "rgba(38,166,154,0.85)" : "rgba(239,83,80,0.85)";
      const bTop = Math.min(toY1(o), toY1(c));
      const bH   = Math.max(Math.abs(toY1(c) - toY1(o)), 1);
      const bw   = Math.max(barW * 0.6, 1.5);
      ctx.fillRect(xc - bw / 2, bTop, bw, bH);
    }

    // Volume bars
    const visVol   = chart.volume.slice(start, end);
    const maxVol   = Math.max(...visVol, 1);
    const volTop   = CANDLE_H - volH;
    const volBot   = CANDLE_H - 2;
    for (let i = start; i < end; i++) {
      const bull = chart.close[i] >= chart.open[i];
      const vh   = ((chart.volume[i] ?? 0) / maxVol) * (volBot - volTop);
      ctx.fillStyle = bull ? C.volBull : C.volBear;
      const bw = Math.max(barW * 0.6, 1.5);
      ctx.fillRect(toX(i) - bw / 2, volBot - vh, bw, vh);
    }

    // X axis dates
    ctx.fillStyle    = C.text;
    ctx.font         = C.font;
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    const step = Math.ceil(visN / 8);
    for (let i = start; i < end; i++) {
      if ((i - start) % step === 0) {
        ctx.fillText(chart.dates[i].slice(5), toX(i), CANDLE_H - 2);
      }
    }

    // ══════════════════════════════════════════
    // Panel 2: MACD chart
    // ══════════════════════════════════════════
    const macdTop = CANDLE_H + GAP + PAD_T;
    const macdBot = CANDLE_H + GAP + MACD_H - PAD_B;

    const visDiff = chart.diff.slice(start, end);
    const visDea  = chart.dea.slice(start, end);
    const visHist = chart.hist.slice(start, end);

    const allMacd = [...visDiff, ...visDea, ...visHist].filter(v => v != null && isFinite(v));
    const macdMax = Math.max(...allMacd, 0.001) * 1.1;
    const macdMin = Math.min(...allMacd, -0.001) * 1.1;
    const macdR   = macdMax - macdMin || 1;
    const toY2    = (v: number) => macdTop + (macdBot - macdTop) * (1 - (v - macdMin) / macdR);

    drawGrid(macdTop, macdBot, 4);

    // Zero axis
    const zeroY = toY2(0);
    ctx.strokeStyle = C.zero;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, zeroY);
    ctx.lineTo(W - PAD_R, zeroY);
    ctx.stroke();

    // Histogram bars
    for (let i = start; i < end; i++) {
      const v  = chart.hist[i];
      if (v == null) continue;
      const yV = toY2(v), y0 = toY2(0);
      ctx.fillStyle = v >= 0 ? C.histPos : C.histNeg;
      const bw = Math.max(barW * 0.6, 1.5);
      ctx.fillRect(toX(i) - bw / 2, Math.min(yV, y0), bw, Math.abs(yV - y0) || 1);
    }

    // DIFF line (teal)
    ctx.strokeStyle = C.diff;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    let started2 = false;
    for (let i = start; i < end; i++) {
      const v = chart.diff[i];
      if (v == null) continue;
      started2 ? ctx.lineTo(toX(i), toY2(v)) : ctx.moveTo(toX(i), toY2(v));
      started2 = true;
    }
    ctx.stroke();

    // DEA line (gold)
    ctx.strokeStyle = C.dea;
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    let started3 = false;
    for (let i = start; i < end; i++) {
      const v = chart.dea[i];
      if (v == null) continue;
      started3 ? ctx.lineTo(toX(i), toY2(v)) : ctx.moveTo(toX(i), toY2(v));
      started3 = true;
    }
    ctx.stroke();

    drawYLabels(macdTop, macdBot, macdMin, macdMax, 4, (v) => v.toFixed(3));
  }, [chart, ma5Series, ma10Series, ma20Series, n]);

  // ── Initialize view ───────────────────────────────────────────
  useEffect(() => {
    const defaultBars = Math.min(60, n);
    viewRef.current = { start: n - defaultBars, end: n };
    draw();
  }, [chart, draw, n]);

  // ── Resize observer ───────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // ── Wheel zoom (non-passive DOM listener to block page scroll) ─
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const { start, end } = viewRef.current;
      const visN   = end - start;
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const newVis = Math.round(Math.max(10, Math.min(n, visN * factor)));
      const ratio  = (e.clientX - rect.left) / rect.width;
      const focalBar = start + visN * ratio;
      let newStart = Math.round(focalBar - newVis * ratio);
      let newEnd   = newStart + newVis;
      if (newStart < 0) { newStart = 0; newEnd = newVis; }
      if (newEnd > n)   { newEnd = n; newStart = n - newVis; }
      viewRef.current = { start: Math.max(0, newStart), end: Math.min(n, newEnd) };
      draw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [draw, n]);

  // ── Pointer drag ─────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pointersRef.current.set(e.pointerId, e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 1) {
      dragRef.current = { x: e.clientX, start: viewRef.current.start };
    } else if (pointersRef.current.size === 2) {
      dragRef.current = null;
      const xs = Array.from(pointersRef.current.values());
      const dist = Math.abs(xs[1] - xs[0]);
      const midX = (xs[0] + xs[1]) / 2;
      const rect = canvas.getBoundingClientRect();
      pinchRef.current = {
        startDist: Math.max(dist, 1),
        startVis: viewRef.current.end - viewRef.current.start,
        startS: viewRef.current.start,
        midFrac: Math.max(0, Math.min(1, (midX - rect.left) / rect.width)),
      };
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, e.clientX);
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const xs = Array.from(pointersRef.current.values());
      const newDist = Math.max(Math.abs(xs[1] - xs[0]), 1);
      const scale = pinchRef.current.startDist / newDist;
      const newVis = Math.max(10, Math.min(n, pinchRef.current.startVis * scale));
      const anchor = pinchRef.current.startS + pinchRef.current.midFrac * pinchRef.current.startVis;
      let newStart = Math.round(anchor - pinchRef.current.midFrac * newVis);
      let newEnd   = newStart + Math.round(newVis);
      if (newStart < 0) { newStart = 0; newEnd = Math.round(newVis); }
      if (newEnd > n)   { newEnd = n; newStart = n - Math.round(newVis); }
      viewRef.current = { start: Math.max(0, newStart), end: Math.min(n, newEnd) };
      draw();
      return;
    }
    if (!dragRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { start, end } = viewRef.current;
    const visN  = end - start;
    const plotW = canvas.width - PAD_L - PAD_R;
    const dx    = e.clientX - dragRef.current.x;
    const dBars = Math.round(-dx / (plotW / visN));
    let newStart = dragRef.current.start + dBars;
    let newEnd   = newStart + visN;
    if (newStart < 0) { newStart = 0; newEnd = visN; }
    if (newEnd > n)   { newEnd = n; newStart = n - visN; }
    viewRef.current = { start: newStart, end: newEnd };
    draw();
  }, [draw, n]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
    } else if (pointersRef.current.size === 1) {
      const [lastX] = Array.from(pointersRef.current.values());
      dragRef.current = { x: lastX, start: viewRef.current.start };
    }
  }, []);

  const totalH = CANDLE_H + GAP + MACD_H;

  return (
    <div ref={containerRef} className="w-full" style={{ height: totalH }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: totalH, cursor: "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
    </div>
  );
}
