"use client";

import { useRef, useEffect } from "react";
import type { CInterval, OverlayToggles, IndicatorParams } from "./ControlBar";
import type { OHLCVData } from "@/types";
import {
  calcMACD,
  calcRSI,
  calcKDJ,
  calcPPSuperTrend,
  calcGMMA,
  calcGMMASignals,
  calcMA,
  calcBollingerBands,
  calcMCDX,
} from "@/lib/indicators";

export interface CompositeChartData extends OHLCVData {
  dates: Date[];
}

interface Props {
  data: CompositeChartData;
  overlays: OverlayToggles;
  params: IndicatorParams;
  interval: CInterval;
}

// ─── Colors ───────────────────────────────────────────────────────
const MA_CFG = [
  { key: "ma5" as const, period: 5, color: "#f0e040" },
  { key: "ma10" as const, period: 10, color: "#ff9800" },
  { key: "ma20" as const, period: 20, color: "#e040fb" },
  { key: "ma50" as const, period: 50, color: "#29b6f6" },
  { key: "ma200" as const, period: 200, color: "#ff5252" },
  { key: "ma240" as const, period: 240, color: "#ff8a80" },
] as const;

const SHORT_COLORS = ["#00e676", "#00c853", "#69f0ae", "#b9f6ca", "#76ff03", "#ccff90"];
const LONG_COLORS  = ["#ff1744", "#ff5252", "#ff6d00", "#ff9100", "#ffab40", "#ffd740"];

const FONT = '"Share Tech Mono", monospace';

// ─── Layout constants ─────────────────────────────────────────────
const MAIN_H = 380;
const SUB_H  = 120;
const PAD    = { top: 24, right: 84, bottom: 26, left: 8 };
const VOL_RATIO = 0.18;

export default function CompositeChart({ data, overlays, params, interval }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef   = useRef({ start: 0, end: 0 });
  const computedRef = useRef<ReturnType<typeof computeIndicators> | null>(null);
  const prevDataRef = useRef<CompositeChartData | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const n = data.dates.length;

    // Recompute indicators when data changes
    if (data !== prevDataRef.current) {
      computedRef.current = computeIndicators(data, params);
      viewRef.current = { start: Math.max(0, n - 200), end: n };
      prevDataRef.current = data;
    } else {
      // params may have changed — recompute without resetting view
      computedRef.current = computeIndicators(data, params);
    }

    const comp = computedRef.current!;
    const view = viewRef.current;

    // ─── Determine active sub-panels ──────────────────────────────
    const subPanels: Array<{ key: "macd" | "rsi" | "kdj" | "mcdx"; label: string }> = [];
    if (overlays.macd) subPanels.push({ key: "macd", label: "MACD" });
    if (overlays.rsi)  subPanels.push({ key: "rsi",  label: "RSI" });
    if (overlays.kdj)  subPanels.push({ key: "kdj",  label: "KDJ" });
    if (overlays.mcdx) subPanels.push({ key: "mcdx", label: "六彩神龙 MCDX" });

    // ─── Canvas dimensions ────────────────────────────────────────
    function getHTOT() {
      return MAIN_H + subPanels.length * SUB_H;
    }

    function getW() {
      return Math.max(canvas!.parentElement!.clientWidth, 300);
    }

    // ─── Draw function ────────────────────────────────────────────
    function draw() {
      const W = getW();
      const HTOT = getHTOT();
      const DPR = window.devicePixelRatio || 1;
      canvas!.width  = W * DPR;
      canvas!.height = HTOT * DPR;
      canvas!.style.width  = W + "px";
      canvas!.style.height = HTOT + "px";
      const ctx = canvas!.getContext("2d")!;
      ctx.scale(DPR, DPR);

      const vs = Math.max(0, Math.floor(view.start));
      const ve = Math.min(n, Math.ceil(view.end));
      const slice = { vs, ve };

      const chartW  = W - PAD.left - PAD.right;
      const barCnt  = Math.max(1, ve - vs);
      const barUnit = chartW / barCnt;
      const barW    = Math.max(1, barUnit * 0.7);

      const xBar = (i: number) => PAD.left + (i - vs + 0.5) * barUnit;

      // ── Subpanel y-helpers ──────────────────────────────────────
      const priceBottom = MAIN_H - Math.round((MAIN_H - PAD.top - PAD.bottom) * VOL_RATIO) - PAD.bottom - 4;
      const volTop      = MAIN_H - Math.round((MAIN_H - PAD.top - PAD.bottom) * VOL_RATIO) - PAD.bottom;
      const volBottom   = MAIN_H - PAD.bottom + 2;

      // Price range
      let pLo = Infinity, pHi = -Infinity;
      for (let i = vs; i < ve; i++) {
        if (data.highs[i] != null) { pHi = Math.max(pHi, data.highs[i]!); pLo = Math.min(pLo, data.lows[i]!); }
        if (overlays.supertrend && !isNaN(comp.st.st[i])) { pHi = Math.max(pHi, comp.st.st[i]); pLo = Math.min(pLo, comp.st.st[i]); }
        if (overlays.bollinger && comp.bb.upper[i] != null) { pHi = Math.max(pHi, comp.bb.upper[i]!); pLo = Math.min(pLo, comp.bb.lower[i]!); }
      }
      if (!isFinite(pLo)) { pLo = 0; pHi = 100; }
      const pPad = (pHi - pLo) * 0.06 || 1;
      pLo -= pPad; pHi += pPad;

      const yP = (v: number) => PAD.top + (1 - (v - pLo) / (pHi - pLo)) * (priceBottom - PAD.top);

      // Volume range
      let vMax = 0;
      for (let i = vs; i < ve; i++) { if (data.volumes[i] != null && data.volumes[i]! > 0) vMax = Math.max(vMax, data.volumes[i]!); }
      const yV = (v: number) => vMax > 0 ? volTop + (1 - v / vMax) * (volBottom - volTop - 2) : volBottom;

      // ── Background ──────────────────────────────────────────────
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, W, HTOT);

      // ── Main panel grid + price scale ───────────────────────────
      ctx.font = `10px ${FONT}`;
      ctx.textAlign = "right";
      const gridLevels = 6;
      for (let g = 0; g <= gridLevels; g++) {
        const y = PAD.top + (g / gridLevels) * (priceBottom - PAD.top);
        const val = pHi - (g / gridLevels) * (pHi - pLo);
        ctx.strokeStyle = "rgba(46,58,80,0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("$" + val.toFixed(2), W - PAD.right + 80, y + 4);
      }

      // ── Volume bars ─────────────────────────────────────────────
      for (let i = vs; i < ve; i++) {
        const v = data.volumes[i];
        if (!v || v <= 0) continue;
        const bull = (data.closes[i] ?? 0) >= (data.opens[i] ?? data.closes[i] ?? 0);
        ctx.fillStyle = bull ? "rgba(38,166,154,0.35)" : "rgba(239,83,80,0.35)";
        const x = xBar(i);
        ctx.fillRect(x - barW / 2, yV(v), barW, volBottom - yV(v));
      }

      // ── Bollinger Bands ─────────────────────────────────────────
      if (overlays.bollinger) {
        // Fill between upper and lower
        ctx.beginPath();
        let started = false;
        for (let i = vs; i < ve; i++) {
          if (comp.bb.upper[i] == null) { started = false; continue; }
          if (!started) { ctx.moveTo(xBar(i), yP(comp.bb.upper[i]!)); started = true; }
          else ctx.lineTo(xBar(i), yP(comp.bb.upper[i]!));
        }
        for (let i = ve - 1; i >= vs; i--) {
          if (comp.bb.lower[i] == null) continue;
          ctx.lineTo(xBar(i), yP(comp.bb.lower[i]!));
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(91,156,246,0.06)";
        ctx.fill();

        // Lines
        const bbLines: Array<{ arr: (number | null)[]; dash: number[] }> = [
          { arr: comp.bb.upper,  dash: [4, 3] },
          { arr: comp.bb.middle, dash: [2, 4] },
          { arr: comp.bb.lower,  dash: [4, 3] },
        ];
        for (const { arr, dash } of bbLines) {
          ctx.strokeStyle = "rgba(91,156,246,0.75)";
          ctx.lineWidth = 1.2;
          ctx.setLineDash(dash);
          ctx.beginPath();
          let s = false;
          for (let i = vs; i < ve; i++) {
            if (arr[i] == null) { s = false; continue; }
            if (!s) { ctx.moveTo(xBar(i), yP(arr[i]!)); s = true; }
            else ctx.lineTo(xBar(i), yP(arr[i]!));
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      // ── GMMA lines ──────────────────────────────────────────────
      if (overlays.gmma) {
        const drawGMMAGroup = (emas: Array<(number | null)[]>, colors: string[]) => {
          for (let g = 0; g < emas.length; g++) {
            ctx.strokeStyle = colors[g] + "90";
            ctx.lineWidth = 1;
            ctx.beginPath();
            let s = false;
            for (let i = vs; i < ve; i++) {
              const v = emas[g][i];
              if (v == null) { s = false; continue; }
              if (!s) { ctx.moveTo(xBar(i), yP(v)); s = true; }
              else ctx.lineTo(xBar(i), yP(v));
            }
            ctx.stroke();
          }
        };
        drawGMMAGroup(comp.gmma.short, SHORT_COLORS);
        drawGMMAGroup(comp.gmma.long, LONG_COLORS);
      }

      // ── MA lines ─────────────────────────────────────────────────
      for (const { key, color } of MA_CFG) {
        if (!overlays[key]) continue;
        const arr = comp.mas[key];
        ctx.strokeStyle = color + "cc";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let s = false;
        for (let i = vs; i < ve; i++) {
          const v = arr[i];
          if (v == null) { s = false; continue; }
          if (!s) { ctx.moveTo(xBar(i), yP(v)); s = true; }
          else ctx.lineTo(xBar(i), yP(v));
        }
        ctx.stroke();
      }

      // ── Candles ──────────────────────────────────────────────────
      for (let i = vs; i < ve; i++) {
        const O = data.opens[i], H = data.highs[i], L = data.lows[i], C = data.closes[i];
        if (C == null || O == null || H == null || L == null) continue;
        const bull = C >= O;
        // GMMA+ signal colors override default candle color
        let col = bull ? "#26a69a" : "#ef5350";
        if (overlays.gmma) {
          if (comp.gmmaSignals.break12[i])      col = "#00e5ff";
          else if (comp.gmmaSignals.tripleCross[i]) col = "#69f0ae";
        }
        const x = xBar(i);
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, yP(H)); ctx.lineTo(x, yP(L)); ctx.stroke();
        ctx.fillStyle = col;
        const top = yP(Math.max(C, O));
        const bot = yP(Math.min(C, O));
        ctx.fillRect(x - barW / 2, top, barW, Math.max(bot - top, 1));
      }

      // ── GMMA+ signal markers (drawn on top of candles) ───────────
      if (overlays.gmma) {
        ctx.textAlign = "center";
        for (let i = vs; i < ve; i++) {
          const x = xBar(i);
          const baseY = data.lows[i] != null ? yP(data.lows[i]!) + 16 : priceBottom - 4;
          let offset = 0;
          if (comp.gmmaSignals.break12[i]) {
            ctx.font = `bold 14px ${FONT}`; ctx.fillStyle = "#00e5ff";
            ctx.fillText("⬆", x, baseY + offset); offset += 17;
          } else if (comp.gmmaSignals.tripleCross[i]) {
            ctx.font = `bold 13px ${FONT}`; ctx.fillStyle = "#69f0ae";
            ctx.fillText("↑", x, baseY + offset); offset += 16;
          }
          if (comp.gmmaSignals.smiley[i]) {
            ctx.font = `13px ${FONT}`; ctx.fillStyle = "#ffd740";
            ctx.fillText("😊", x, baseY + offset); offset += 17;
          }
          if (comp.gmmaSignals.kdCross[i]) {
            ctx.font = `bold 15px ${FONT}`; ctx.fillStyle = "#00e676";
            ctx.fillText("$", x, baseY + offset);
          }
        }
      }

      // ── SuperTrend ───────────────────────────────────────────────
      if (overlays.supertrend) {
        const { st, trend } = comp.st;
        let segStart = -1, segTrend = 0;
        const drawSeg = (from: number, to: number, t: number) => {
          ctx.strokeStyle = t === 1 ? "#00e676" : "#ff1744";
          ctx.lineWidth = 2;
          ctx.beginPath();
          let s = false;
          for (let j = from; j <= to; j++) {
            if (j < vs || j >= ve || isNaN(st[j])) continue;
            if (!s) { ctx.moveTo(xBar(j), yP(st[j])); s = true; }
            else ctx.lineTo(xBar(j), yP(st[j]));
          }
          ctx.stroke();
        };
        for (let i = vs; i < ve; i++) {
          if (isNaN(st[i])) continue;
          if (segStart < 0) { segStart = i; segTrend = trend[i]; continue; }
          if (trend[i] !== segTrend) {
            drawSeg(segStart, i - 1, segTrend);
            segStart = i; segTrend = trend[i];
          }
        }
        if (segStart >= 0) drawSeg(segStart, ve - 1, segTrend);

        // Buy/Sell markers
        for (let i = vs + 1; i < ve; i++) {
          if (isNaN(st[i])) continue;
          const buy  = trend[i] === 1 && trend[i - 1] === -1;
          const sell = trend[i] === -1 && trend[i - 1] === 1;
          if (buy) {
            const x = xBar(i), base = yP(st[i]) + 24, tip = yP(st[i]) + 8;
            ctx.fillStyle = "#00e676";
            ctx.beginPath(); ctx.moveTo(x, tip); ctx.lineTo(x - 7, base); ctx.lineTo(x + 7, base); ctx.closePath(); ctx.fill();
          }
          if (sell) {
            const x = xBar(i), base = yP(st[i]) - 20, tip = yP(st[i]) - 8;
            ctx.fillStyle = "#ff1744";
            ctx.beginPath(); ctx.moveTo(x, tip); ctx.lineTo(x - 7, base); ctx.lineTo(x + 7, base); ctx.closePath(); ctx.fill();
          }
        }
      }

      // ── X-axis labels ────────────────────────────────────────────
      const step = Math.max(1, Math.floor(barCnt / 9));
      ctx.fillStyle = "#94a3b8"; ctx.font = `10px ${FONT}`; ctx.textAlign = "center";
      for (let i = vs; i < ve; i += step) {
        if (!data.dates[i]) continue;
        const d = data.dates[i];
        let label: string;
        if (interval === "1h") {
          label = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
        } else if (interval === "1d") {
          label = `${d.getMonth() + 1}/${d.getDate()}`;
        } else {
          label = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        }
        ctx.fillText(label, xBar(i), MAIN_H - PAD.bottom / 2 + 8);
      }

      // ── Sub-panels ───────────────────────────────────────────────
      subPanels.forEach(({ key, label }, idx) => {
        const panelTop    = MAIN_H + idx * SUB_H;
        const panelBottom = panelTop + SUB_H;
        const innerTop    = panelTop + 6;
        const innerBottom = panelBottom - PAD.bottom;

        // Separator line
        ctx.strokeStyle = "#2e3a50";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD.left, panelTop); ctx.lineTo(W - PAD.right, panelTop); ctx.stroke();

        // Label
        ctx.fillStyle = "#94a3b8"; ctx.font = `9px ${FONT}`; ctx.textAlign = "left";
        ctx.fillText(label, PAD.left + 4, panelTop + 14);

        if (key === "macd") {
          drawMACDPanel(ctx, comp, vs, ve, xBar, barW, barUnit, W, innerTop, innerBottom);
        } else if (key === "rsi") {
          drawRSIPanel(ctx, comp, vs, ve, xBar, W, innerTop, innerBottom);
        } else if (key === "kdj") {
          drawKDJPanel(ctx, comp, vs, ve, xBar, W, innerTop, innerBottom);
        } else if (key === "mcdx") {
          drawMCDXPanel(ctx, comp, vs, ve, xBar, barW, W, innerTop, innerBottom);
        }
      });
    }

    // ─── Crosshair + tooltip draw overlay ─────────────────────────
    function drawCrosshair(mouseX: number, mouseY: number) {
      const W = getW();
      const chartW = W - PAD.left - PAD.right;
      const vs = Math.max(0, Math.floor(view.start));
      const ve = Math.min(n, Math.ceil(view.end));
      const barCnt = Math.max(1, ve - vs);
      const barUnit = chartW / barCnt;
      const idx = vs + Math.round((mouseX - PAD.left) / barUnit - 0.5);
      if (idx < vs || idx >= ve) return -1;

      const x = PAD.left + (idx - vs + 0.5) * barUnit;

      const ctx = canvas!.getContext("2d")!;
      ctx.strokeStyle = "rgba(160,174,192,0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, MAIN_H - PAD.bottom + 2); ctx.stroke();
      if (mouseY < MAIN_H) {
        ctx.beginPath(); ctx.moveTo(PAD.left, mouseY); ctx.lineTo(W - PAD.right, mouseY); ctx.stroke();
      }
      ctx.setLineDash([]);

      // Price bubble
      if (data.closes[idx] != null) {
        const priceBottom = MAIN_H - Math.round((MAIN_H - PAD.top - PAD.bottom) * VOL_RATIO) - PAD.bottom - 4;
        const pLo2 = getViewPriceLo(vs, ve);
        const pHi2 = getViewPriceHi(vs, ve);
        const pPad2 = (pHi2 - pLo2) * 0.06 || 1;
        const pLo = pLo2 - pPad2, pHi = pHi2 + pPad2;
        const yClose = PAD.top + (1 - (data.closes[idx]! - pLo) / (pHi - pLo)) * (priceBottom - PAD.top);
        ctx.fillStyle = "rgba(201,168,76,0.9)";
        ctx.fillRect(W - PAD.right + 1, yClose - 9, 80, 17);
        ctx.fillStyle = "#000"; ctx.font = `bold 10px ${FONT}`; ctx.textAlign = "left";
        ctx.fillText("$" + data.closes[idx]!.toFixed(2), W - PAD.right + 4, yClose + 4);
      }

      return idx;
    }

    function getViewPriceLo(vs: number, ve: number) {
      let lo = Infinity;
      for (let i = vs; i < ve; i++) {
        if (data.lows[i] != null) lo = Math.min(lo, data.lows[i]!);
        if (overlays.bollinger && computedRef.current?.bb.lower[i] != null) lo = Math.min(lo, computedRef.current.bb.lower[i]!);
      }
      return isFinite(lo) ? lo : 0;
    }

    function getViewPriceHi(vs: number, ve: number) {
      let hi = -Infinity;
      for (let i = vs; i < ve; i++) {
        if (data.highs[i] != null) hi = Math.max(hi, data.highs[i]!);
        if (overlays.bollinger && computedRef.current?.bb.upper[i] != null) hi = Math.max(hi, computedRef.current.bb.upper[i]!);
      }
      return isFinite(hi) ? hi : 100;
    }

    // ─── Tooltip ──────────────────────────────────────────────────
    let tooltipEl = document.getElementById("composite-tooltip");
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.id = "composite-tooltip";
      tooltipEl.style.cssText =
        "position:fixed;z-index:200;background:rgba(8,8,18,0.97);border:1px solid #2e3a50;border-radius:8px;padding:10px 14px;font-size:0.72rem;pointer-events:none;display:none;box-shadow:0 6px 24px rgba(0,0,0,0.7);min-width:190px;font-family:'Share Tech Mono',monospace;color:#e2e8f0;";
      document.body.appendChild(tooltipEl);
    }

    // ─── Event listeners ──────────────────────────────────────────
    const drag = { active: false, startX: 0, startS: 0, startE: 0 };
    const pointers = new Map<number, number>();
    let pinch: { startDist: number; startVis: number; startS: number; midFrac: number } | null = null;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const W = getW();
      const chartW = W - PAD.left - PAD.right;
      const rect = canvas!.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD.left) / chartW));
      const vs = view.start, ve = view.end;
      const vis = ve - vs;
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      const newVis = Math.max(10, Math.min(n, vis * factor));
      const anchor = vs + frac * vis;
      view.start = Math.max(0, anchor - frac * newVis);
      view.end = Math.min(n, view.start + newVis);
      if (view.end > n) { view.end = n; view.start = Math.max(0, n - newVis); }
      draw();
    };

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, e.clientX);
      canvas!.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        drag.active = true;
        drag.startX = e.clientX;
        drag.startS = view.start;
        drag.startE = view.end;
      } else if (pointers.size === 2) {
        drag.active = false;
        const xs = Array.from(pointers.values());
        const dist = Math.abs(xs[1] - xs[0]);
        const midX = (xs[0] + xs[1]) / 2;
        const W = getW();
        const chartW = W - PAD.left - PAD.right;
        const rect = canvas!.getBoundingClientRect();
        pinch = {
          startDist: Math.max(dist, 1),
          startVis: view.end - view.start,
          startS: view.start,
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
        view.start = Math.max(0, anchor - pinch.midFrac * newVis);
        view.end = Math.min(n, view.start + newVis);
        if (view.end > n) { view.end = n; view.start = Math.max(0, n - newVis); }
        tooltipEl!.style.display = "none";
        draw();
        return;
      }
      const W = getW();
      const chartW = W - PAD.left - PAD.right;
      const rect = canvas!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (drag.active) {
        const vis = drag.startE - drag.startS;
        const bpp = vis / chartW;
        const delta = -(e.clientX - drag.startX) * bpp;
        let ns = drag.startS + delta;
        let ne = drag.startE + delta;
        if (ns < 0) { ns = 0; ne = vis; }
        if (ne > n) { ne = n; ns = n - vis; }
        view.start = ns; view.end = ne;
        tooltipEl!.style.display = "none";
        draw();
        return;
      }

      // Crosshair + tooltip
      draw();
      const idx = drawCrosshair(mouseX, mouseY);
      if (idx < 0 || idx >= n) { tooltipEl!.style.display = "none"; return; }

      const d = data.dates[idx];
      const dStr = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${interval === "1h" ? String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") : ""}` : "";

      const comp2 = computedRef.current!;
      const rsiVal = comp2.rsi[idx];
      const macdVal = comp2.macd.macd[idx];
      const histVal = comp2.macd.histogram[idx];
      const kVal = comp2.kdj.k[idx];
      const dVal = comp2.kdj.d[idx];
      const bankerVal = comp2.mcdx.banker[idx];
      const hotMoneyVal = comp2.mcdx.hotMoney[idx];

      let html = `<div style="color:#c9a84c;font-weight:700;margin-bottom:6px">${dStr.trim()}</div>`;
      html += row("O", "$" + (data.opens[idx]?.toFixed(2) ?? "—"), "#94a3b8");
      html += row("H", "$" + (data.highs[idx]?.toFixed(2) ?? "—"), "#26a69a");
      html += row("L", "$" + (data.lows[idx]?.toFixed(2) ?? "—"), "#ef5350");
      html += row("C", "$" + (data.closes[idx]?.toFixed(2) ?? "—"), "#e2e8f0");
      html += `<div style="border-top:1px solid #2e3a50;margin:5px 0"></div>`;
      if (rsiVal != null) html += row("RSI", rsiVal.toFixed(1), rsiVal > 70 ? "#ff5252" : rsiVal < 30 ? "#00e676" : "#a78bfa");
      if (macdVal != null) html += row("MACD", macdVal.toFixed(3), "#f0e040");
      if (histVal != null) html += row("Hist", histVal.toFixed(3), (histVal as number) >= 0 ? "#00e676" : "#ff1744");
      if (kVal != null) html += row("K/D", kVal.toFixed(1) + "/" + dVal.toFixed(1), "#f0e040");
      if (bankerVal != null) html += row("庄家", bankerVal.toFixed(2), "#ff3a3a");
      if (hotMoneyVal != null) html += row("游资", hotMoneyVal.toFixed(2), "#d8c200");
      if (overlays.gmma) {
        const gs = comp2.gmmaSignals;
        const sig = gs.break12[idx] ? "⬆ 一阳穿12线" : gs.tripleCross[idx] ? "↑ 三线金叉" : null;
        const sig2 = gs.smiley[idx] ? "😊 双涨" : gs.kdCross[idx] ? "$ KD金叉" : null;
        if (sig) html += row("GMMA", sig, "#00e5ff");
        if (sig2) html += row("GMMA", sig2, gs.smiley[idx] ? "#ffd740" : "#00e676");
      }

      // MA values
      for (const { key, color, period } of MA_CFG) {
        if (!overlays[key]) continue;
        const v = comp2.mas[key][idx];
        if (v != null) html += row("MA" + period, "$" + v.toFixed(2), color);
      }

      tooltipEl!.innerHTML = html;
      tooltipEl!.style.display = "block";
      tooltipEl!.style.left = Math.min(e.clientX + 14, window.innerWidth - 210) + "px";
      tooltipEl!.style.top  = Math.max(e.clientY - 10, 0) + "px";
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
        drag.startS = view.start;
        drag.startE = view.end;
      }
    };
    const onLeave = () => { tooltipEl!.style.display = "none"; draw(); };

    const ro = new ResizeObserver(draw);
    ro.observe(canvas.parentElement!);

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("mouseleave", onLeave);

    draw();

    return () => {
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("mouseleave", onLeave);
      tooltipEl!.style.display = "none";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, params, overlays, interval]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 flex-wrap gap-2">
        <span className="text-[10px] tracking-widest text-muted/60">COMPOSITE CHART — 综合技术指标图表</span>
        <div className="flex flex-wrap gap-3">
          {(
            [
              { color: "#26a69a", label: "多头" },
              { color: "#ef5350", label: "空头" },
            ] as const
          ).map((l) => (
            <div key={l.label} className="flex items-center gap-1">
              <span className="w-4 h-0.5 inline-block rounded" style={{ background: l.color }} />
              <span className="text-[9px] text-muted/50">{l.label}</span>
            </div>
          ))}
          <span className="text-[9px] text-muted/40">滚轮/双指缩放 · 拖动平移</span>
        </div>
      </div>
      <canvas ref={canvasRef} className="block w-full cursor-crosshair touch-none" />
    </div>
  );
}

// ─── Tooltip row helper ───────────────────────────────────────────
function row(label: string, val: string, color: string) {
  return `<div style="display:flex;justify-content:space-between;gap:14px;margin:2px 0"><span style="color:#94a3b8">${label}</span><span style="color:${color}">${val}</span></div>`;
}

// ─── Indicator computation ────────────────────────────────────────
function computeIndicators(data: CompositeChartData, params: IndicatorParams) {
  const { highs, lows, closes, volumes } = data;
  const cleanCloses = closes.map((v) => v ?? 0); // forward-fill for EMA calcs
  let last = closes.find((v) => v != null) ?? 0;
  const ffCloses = closes.map((v) => { if (v != null) last = v; return last; });

  const gmma = calcGMMA(closes);
  const gmmaSignals = calcGMMASignals(closes, highs, lows, gmma);

  return {
    macd:  calcMACD(ffCloses as number[], params.macdFast, params.macdSlow, params.macdSig),
    rsi:   calcRSI(closes, params.rsiPeriod),
    kdj:   calcKDJ(highs, lows, closes, params.kdjPeriod),
    st:    calcPPSuperTrend(highs, lows, closes, params.stPrd, params.stFactor, params.stAtrPd),
    gmma,
    gmmaSignals,
    bb:    calcBollingerBands(closes, params.bbPeriod, params.bbStdDev),
    mcdx:  calcMCDX(closes),
    mas: {
      ma5:   calcMA(closes, 5),
      ma10:  calcMA(closes, 10),
      ma20:  calcMA(closes, 20),
      ma50:  calcMA(closes, 50),
      ma200: calcMA(closes, 200),
      ma240: calcMA(closes, 240),
    },
    volumes,
    cleanCloses,
  };
}

// ─── Sub-panel drawing helpers ────────────────────────────────────
function drawMACDPanel(
  ctx: CanvasRenderingContext2D,
  comp: ReturnType<typeof computeIndicators>,
  vs: number, ve: number,
  xBar: (i: number) => number,
  barW: number,
  barUnit: number,
  W: number,
  top: number, bottom: number
) {
  const { macd, signal, histogram } = comp.macd;

  // Find range
  let lo = Infinity, hi = -Infinity;
  for (let i = vs; i < ve; i++) {
    if (histogram[i] != null) { hi = Math.max(hi, histogram[i]!); lo = Math.min(lo, histogram[i]!); }
    if (macd[i] != null) { hi = Math.max(hi, macd[i]!); lo = Math.min(lo, macd[i]!); }
    if (signal[i] != null) { hi = Math.max(hi, signal[i]!); lo = Math.min(lo, signal[i]!); }
  }
  if (!isFinite(lo)) { lo = -1; hi = 1; }
  const pad = (hi - lo) * 0.1 || 0.1;
  lo -= pad; hi += pad;

  const yM = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (bottom - top);
  const zero = yM(0);

  // Zero line
  ctx.strokeStyle = "rgba(46,58,80,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.left, zero); ctx.lineTo(W - PAD.right, zero); ctx.stroke();

  // Histogram
  for (let i = vs; i < ve; i++) {
    const h = histogram[i];
    if (h == null) continue;
    ctx.fillStyle = h >= 0 ? "rgba(0,230,118,0.65)" : "rgba(255,23,68,0.65)";
    const x = xBar(i);
    const y0 = yM(0), y1 = yM(h);
    ctx.fillRect(x - barW / 2, Math.min(y0, y1), barW, Math.abs(y1 - y0) || 1);
  }

  // MACD line
  drawLine(ctx, macd, vs, ve, xBar, yM, "#f0e040", 1.5);
  // Signal line
  drawLine(ctx, signal, vs, ve, xBar, yM, "#ff9800", 1.2);

  // Scale label
  ctx.fillStyle = "#94a3b8"; ctx.font = `9px ${FONT}`; ctx.textAlign = "right";
  ctx.fillText(hi.toFixed(3), W - PAD.right + 80, top + 12);
  ctx.fillText(lo.toFixed(3), W - PAD.right + 80, bottom - 2);
}

function drawRSIPanel(
  ctx: CanvasRenderingContext2D,
  comp: ReturnType<typeof computeIndicators>,
  vs: number, ve: number,
  xBar: (i: number) => number,
  W: number,
  top: number, bottom: number
) {
  const yR = (v: number) => top + (1 - v / 100) * (bottom - top);

  // Reference lines
  for (const [level, color, dash] of [
    [70, "rgba(239,83,80,0.4)", [3, 3]],
    [50, "rgba(148,163,184,0.25)", [2, 4]],
    [30, "rgba(0,230,118,0.4)", [3, 3]],
  ] as [number, string, number[]][]) {
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(PAD.left, yR(level)); ctx.lineTo(W - PAD.right, yR(level)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#94a3b8"; ctx.font = `9px ${FONT}`; ctx.textAlign = "right";
    ctx.fillText(String(level), W - PAD.right + 80, yR(level) + 4);
  }

  // RSI line
  drawLine(ctx, comp.rsi, vs, ve, xBar, yR, "#a78bfa", 1.5);

  // Current value label
  const lastRsi = comp.rsi.slice(vs, ve).filter((v): v is number => v != null).at(-1);
  if (lastRsi != null) {
    ctx.fillStyle = "#a78bfa"; ctx.font = `bold 9px ${FONT}`; ctx.textAlign = "right";
    ctx.fillText(lastRsi.toFixed(1), W - PAD.right + 80, yR(lastRsi) + 4);
  }
}

function drawKDJPanel(
  ctx: CanvasRenderingContext2D,
  comp: ReturnType<typeof computeIndicators>,
  vs: number, ve: number,
  xBar: (i: number) => number,
  W: number,
  top: number, bottom: number
) {
  const { k, d, j } = comp.kdj;

  // Range with J clamped to 0-120
  const lo = 0, hi = 120;
  const yK = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (bottom - top);

  // Reference lines
  for (const [level, color, dash] of [
    [80, "rgba(239,83,80,0.4)", [3, 3]],
    [50, "rgba(148,163,184,0.25)", [2, 4]],
    [20, "rgba(0,230,118,0.4)", [3, 3]],
  ] as [number, string, number[]][]) {
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(PAD.left, yK(level)); ctx.lineTo(W - PAD.right, yK(level)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#94a3b8"; ctx.font = `9px ${FONT}`; ctx.textAlign = "right";
    ctx.fillText(String(level), W - PAD.right + 80, yK(level) + 4);
  }

  // K, D, J lines
  drawLine(ctx, k.map((v) => Math.min(120, Math.max(-20, v))), vs, ve, xBar, yK, "#f0e040", 1.5);
  drawLine(ctx, d.map((v) => Math.min(120, Math.max(-20, v))), vs, ve, xBar, yK, "#ff9800", 1.5);
  drawLine(ctx, j.map((v) => Math.min(120, Math.max(-20, v))), vs, ve, xBar, yK, "#00e676", 1);

  // Last value labels
  const lastK = k[ve - 1], lastD = d[ve - 1];
  if (!isNaN(lastK)) {
    ctx.fillStyle = "#f0e040"; ctx.font = `9px ${FONT}`; ctx.textAlign = "left";
    ctx.fillText(`K:${lastK.toFixed(1)}  D:${lastD.toFixed(1)}`, PAD.left + 24, top + 14);
  }
}

function drawMCDXPanel(
  ctx: CanvasRenderingContext2D,
  comp: ReturnType<typeof computeIndicators>,
  vs: number, ve: number,
  xBar: (i: number) => number,
  barW: number,
  W: number,
  top: number, bottom: number
) {
  const { banker, hotMoney, bankerMA } = comp.mcdx;

  // Fixed scale 0–20 matching the dedicated 六彩神龙 tool
  const yM = (v: number) => top + (1 - v / 20) * (bottom - top);
  const base = bottom;

  // Grid lines at 0, 5, 10, 15, 20
  for (const v of [0, 5, 10, 15, 20]) {
    const y = yM(v);
    ctx.strokeStyle = v === 10 ? "rgba(255,0,128,0.35)" : "rgba(46,58,80,0.7)";
    ctx.lineWidth = 1;
    if (v === 10) ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#94a3b8"; ctx.font = `9px ${FONT}`; ctx.textAlign = "right";
    ctx.fillText(String(v), W - PAD.right + 80, y + 4);
  }

  // Stacked histogram: green(full 20) → yellow(hotMoney) → red(banker) on top
  for (let i = vs; i < ve; i++) {
    const x = xBar(i);
    const bk = (banker[i]   ?? 0) as number;
    const hm = (hotMoney[i] ?? 0) as number;

    // Green background: full height (0→20)
    ctx.fillStyle = "#22aa55";
    ctx.fillRect(x - barW / 2, yM(20), barW, base - yM(20));

    // Yellow: hotMoney portion
    if (hm > 0) {
      ctx.fillStyle = "#d8c200";
      ctx.fillRect(x - barW / 2, yM(hm), barW, base - yM(hm));
    }

    // Red: banker portion (on top)
    if (bk > 0) {
      ctx.fillStyle = "#ff3a3a";
      ctx.fillRect(x - barW / 2, yM(bk), barW, base - yM(bk));
    }
  }

  // BankerMA line (blue)
  drawLine(ctx, bankerMA, vs, ve, xBar, yM, "#5b9cf6", 2);

  // Last values
  const lastBk = banker[ve - 1], lastHm = hotMoney[ve - 1];
  if (lastBk != null) {
    ctx.fillStyle = "#94a3b8"; ctx.font = `9px ${FONT}`; ctx.textAlign = "left";
    ctx.fillText(`庄:${(lastBk as number).toFixed(1)}  游:${((lastHm ?? 0) as number).toFixed(1)}`, PAD.left + 4, top + 14);
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  arr: (number | null)[] | number[],
  vs: number, ve: number,
  xBar: (i: number) => number,
  yFn: (v: number) => number,
  color: string,
  lineWidth: number
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  let started = false;
  for (let i = vs; i < ve; i++) {
    const v = arr[i];
    if (v == null || isNaN(v as number)) { started = false; continue; }
    if (!started) { ctx.moveTo(xBar(i), yFn(v as number)); started = true; }
    else ctx.lineTo(xBar(i), yFn(v as number));
  }
  ctx.stroke();
}
