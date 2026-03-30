"use client";

import { useRef, useEffect } from "react";
import type { YFChartResult } from "@/types";

interface CandlestickChartProps {
  chart: YFChartResult;
  ma20: (number | null)[];
  ma50: (number | null)[];
  ma200: (number | null)[];
  volMa20: (number | null)[];
}

const PAD = { l: 60, r: 16, t: 16, b: 28 };
const VOL_RATIO = 0.22; // volume pane = 22% of total height

export default function CandlestickChart({ chart, ma20, ma50, ma200, volMa20 }: CandlestickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = container.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    draw(ctx, W, H, chart, ma20, ma50, ma200, volMa20);
  }, [chart, ma20, ma50, ma200, volMa20]);

  // Re-draw on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = container.clientWidth;
      const H = container.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      draw(ctx, W, H, chart, ma20, ma50, ma200, volMa20);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [chart, ma20, ma50, ma200, volMa20]);

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-5 mb-3 text-[10px] font-trading">
        <span className="text-muted/60 tracking-widest">60D CHART</span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-px" style={{ background: "#f0cc6e" }} />
          <span className="text-muted/60">MA20</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-px" style={{ background: "#94a3b8" }} />
          <span className="text-muted/60">MA50</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-px" style={{ background: "#ef5350" }} />
          <span className="text-muted/60">MA200</span>
        </span>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: 300 }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  chart: YFChartResult,
  ma20: (number | null)[],
  ma50: (number | null)[],
  ma200: (number | null)[],
  volMa20: (number | null)[]
) {
  ctx.clearRect(0, 0, W, H);

  // Use last 60 bars
  const n = Math.min(60, chart.closes.length);
  const offset = chart.closes.length - n;
  const closes = chart.closes.slice(-n);
  const opens = chart.opens.slice(-n);
  const highs = chart.highs.slice(-n);
  const lows = chart.lows.slice(-n);
  const volumes = chart.volumes.slice(-n);
  const timestamps = chart.timestamps.slice(-n);

  if (!n) return;

  const priceH = Math.floor(H * (1 - VOL_RATIO));
  const volH = H - priceH;

  // ── Price range ──────────────────────────────────────────────────
  const validHighs = highs.filter((v): v is number => v != null);
  const validLows = lows.filter((v): v is number => v != null);
  const allMa = [...ma20, ...ma50, ...ma200].filter((v): v is number => v != null);
  const maxP = Math.max(...validHighs, ...allMa);
  const minP = Math.min(...validLows, ...allMa);
  const rng = maxP - minP || 1;

  const yP = (v: number) => PAD.t + (1 - (v - minP) / rng) * (priceH - PAD.t - PAD.b);
  const xOf = (i: number) => PAD.l + (i + 0.5) * ((W - PAD.l - PAD.r) / n);
  const candleW = Math.max(1, Math.floor((W - PAD.l - PAD.r) / n * 0.7));

  // ── Grid lines ───────────────────────────────────────────────────
  ctx.strokeStyle = "#1c2535";
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 4; i++) {
    const y = PAD.t + (i / 4) * (priceH - PAD.t - PAD.b);
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(W - PAD.r, y);
    ctx.stroke();
  }

  // ── Y labels ─────────────────────────────────────────────────────
  ctx.fillStyle = "#3d5468";
  ctx.font = `9px monospace`;
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const v = minP + (i / 4) * rng;
    const label = v >= 1000 ? v.toFixed(0) : v.toFixed(2);
    ctx.fillText("$" + label, PAD.l - 4, yP(v) + 3);
  }

  // ── X labels ─────────────────────────────────────────────────────
  ctx.fillStyle = "#3d5468";
  ctx.textAlign = "center";
  const step = Math.ceil(n / 5);
  for (let i = 0; i < n; i += step) {
    const ts = timestamps[i];
    if (!ts) continue;
    const d = new Date(ts * 1000);
    const label = (d.getUTCMonth() + 1) + "/" + d.getUTCDate();
    ctx.fillText(label, xOf(i), priceH - 6);
  }

  // ── MA lines ─────────────────────────────────────────────────────
  function drawMALine(series: (number | null)[], color: string, width = 1.2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let first = true;
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (v == null) { first = true; continue; }
      const x = xOf(i);
      const y = yP(v);
      if (first) { ctx.moveTo(x, y); first = false; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawMALine(ma200, "#ef5350", 1);
  drawMALine(ma50, "#94a3b8", 1.2);
  drawMALine(ma20, "#f0cc6e", 1.2);

  // ── Candles ───────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    if (o == null || c == null) continue;

    const x = xOf(i);
    const isUp = c >= o;
    const bodyColor = isUp ? "#26a69a" : "#ef5350";
    const bodyAlpha = isUp ? "d9" : "d9"; // ~85% opacity

    // Wick
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 1;
    if (h != null && l != null) {
      ctx.beginPath();
      ctx.moveTo(x, yP(h));
      ctx.lineTo(x, yP(l));
      ctx.stroke();
    }

    // Body
    const y1 = yP(Math.max(o, c));
    const y2 = yP(Math.min(o, c));
    const bodyH = Math.max(1, y2 - y1);
    ctx.fillStyle = bodyColor + bodyAlpha;
    ctx.fillRect(x - candleW / 2, y1, candleW, bodyH);
  }

  // ── Volume pane ───────────────────────────────────────────────────
  const volTop = priceH + 4;
  const volBot = H - 2;
  const volPaneH = volBot - volTop;

  const validVols = volumes.filter((v): v is number => v != null);
  const maxVol = validVols.length ? Math.max(...validVols) : 1;

  for (let i = 0; i < n; i++) {
    const v = volumes[i];
    if (v == null) continue;
    const c = closes[i];
    const o = opens[i];
    const isUp = (c ?? 0) >= (o ?? 0);
    const barH = Math.max(1, (v / maxVol) * volPaneH);
    ctx.fillStyle = isUp ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)";
    ctx.fillRect(xOf(i) - candleW / 2, volBot - barH, candleW, barH);
  }

  // Vol MA20 line
  ctx.strokeStyle = "rgba(240,204,110,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  let firstVol = true;
  for (let i = 0; i < volMa20.length; i++) {
    const vm = volMa20[i];
    if (vm == null) { firstVol = true; continue; }
    const x = xOf(i);
    const y = volBot - (vm / maxVol) * volPaneH;
    if (firstVol) { ctx.moveTo(x, y); firstVol = false; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Divider between price and vol
  ctx.strokeStyle = "#2e3a50";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(PAD.l, priceH);
  ctx.lineTo(W - PAD.r, priceH);
  ctx.stroke();
}
