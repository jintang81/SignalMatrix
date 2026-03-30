"use client";

import { useEffect, useRef } from "react";
import type { GMMAInterval } from "./ControlBar";

export interface GMMAChartSlice {
  dates: Date[];
  O: (number | null)[];
  H: (number | null)[];
  L: (number | null)[];
  C: (number | null)[];
  V: (number | null)[];
  short: Array<(number | null)[]>;  // [ema3, ema5, ema8, ema10, ema12, ema15]
  long:  Array<(number | null)[]>;  // [ema30, ema35, ema40, ema45, ema50, ema60]
  tripleCross: boolean[];
  break12:     boolean[];
  smiley:      boolean[];
  kdCross:     boolean[];
}

const SHORT_COLORS  = ["#00e676", "#00c853", "#69f0ae", "#b9f6ca", "#76ff03", "#ccff90"];
const LONG_COLORS   = ["#ff1744", "#ff5252", "#ff6d00", "#ff9100", "#ffab40", "#ffd740"];
const SHORT_PERIODS = [3, 5, 8, 10, 12, 15];
const LONG_PERIODS  = [30, 35, 40, 45, 50, 60];
const UP = "#26a69a", DN = "#ef5350";

interface Props {
  data: GMMAChartSlice;
  interval: GMMAInterval;
}

export default function GMMACharts({ data, interval }: Props) {
  const mainRef    = useRef<HTMLCanvasElement>(null);
  const volRef     = useRef<HTMLCanvasElement>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const mainLblRef = useRef<HTMLSpanElement>(null);
  const volLblRef  = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const mainEl = mainRef.current;
    const volEl  = volRef.current;
    const wrapEl = wrapRef.current;
    if (!mainEl || !volEl || !wrapEl) return;

    const dpr = window.devicePixelRatio || 1;
    let xhairIdx = -1;

    const { dates, O, H, L, C, V } = data;
    const sEMAs = data.short;
    const lEMAs = data.long;
    const n = dates.length;
    const PAD = { t: 20, r: 70, b: 24, l: 8 };

    function getW() { return Math.max(wrapEl!.clientWidth, 300); }
    function bUnit(W: number) { return (W - PAD.l - PAD.r) / Math.max(1, n); }
    function px(i: number, W: number) { return PAD.l + (i + 0.5) * bUnit(W); }
    function bW(W: number) { return Math.max(1, bUnit(W) * 0.7); }

    function setupCanvas(el: HTMLCanvasElement, W: number, height: number) {
      el.width  = W * dpr;
      el.height = height * dpr;
      el.style.width  = W + "px";
      el.style.height = height + "px";
      const ctx = el.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    }

    function fmtDate(d: Date): string {
      if (interval === "1mo") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    function drawMain() {
      const W  = getW();
      const cH = Math.max(250, Math.min(380, Math.round(W * 0.30)));
      const ctx = setupCanvas(mainEl!, W, cH);
      const chartH = cH - PAD.t - PAD.b;
      const bu = bUnit(W);
      const bw = bW(W);

      // Price range: OHLC + all EMA values
      let pMin = Infinity, pMax = -Infinity;
      for (let i = 0; i < n; i++) {
        if (H[i] != null) pMax = Math.max(pMax, H[i]!);
        if (L[i] != null) pMin = Math.min(pMin, L[i]!);
        for (const arr of [...sEMAs, ...lEMAs]) {
          const v = arr[i];
          if (v != null) { pMax = Math.max(pMax, v); pMin = Math.min(pMin, v); }
        }
      }
      if (!isFinite(pMin) || !isFinite(pMax)) { ctx.clearRect(0, 0, W, cH); return; }
      const pad5 = (pMax - pMin) * 0.05 || 1;
      const prMin = pMin - pad5, prMax = pMax + pad5;
      const pRange = prMax - prMin;
      const pY = (v: number) => PAD.t + (1 - (v - prMin) / pRange) * chartH;

      ctx.clearRect(0, 0, W, cH);

      // Grid + Y labels
      ctx.font = "10px 'Share Tech Mono', monospace";
      for (let g = 0; g <= 5; g++) {
        const v = prMin + pRange * g / 5;
        const y = pY(v);
        ctx.strokeStyle = "rgba(46,58,80,0.8)"; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
        ctx.fillStyle = "#94a3b8"; ctx.textAlign = "left";
        ctx.fillText("$" + (v < 10 ? v.toFixed(2) : v.toFixed(0)), W - PAD.r + 4, y + 3);
      }

      // X labels
      const step = Math.max(1, Math.floor(n / 10));
      ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center";
      for (let i = 0; i < n; i += step) {
        ctx.fillText(fmtDate(dates[i]), px(i, W), cH - 5);
      }

      // Long-term EMA lines (behind candles)
      for (let li = lEMAs.length - 1; li >= 0; li--) {
        ctx.strokeStyle = LONG_COLORS[li]; ctx.lineWidth = 1.0; ctx.lineJoin = "round";
        ctx.beginPath(); let started = false;
        for (let i = 0; i < n; i++) {
          const v = lEMAs[li][i];
          if (v == null) { started = false; continue; }
          const x = px(i, W), y = pY(v);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Short-term EMA lines
      for (let si = sEMAs.length - 1; si >= 0; si--) {
        ctx.strokeStyle = SHORT_COLORS[si]; ctx.lineWidth = 1.2; ctx.lineJoin = "round";
        ctx.beginPath(); let started = false;
        for (let i = 0; i < n; i++) {
          const v = sEMAs[si][i];
          if (v == null) { started = false; continue; }
          const x = px(i, W), y = pY(v);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Candles (on top of EMA lines)
      for (let i = 0; i < n; i++) {
        if (O[i] == null || C[i] == null) continue;
        const up = C[i]! >= O[i]!;
        const x  = px(i, W);
        const oY = pY(O[i]!), cY = pY(C[i]!);
        const hY = H[i] != null ? pY(H[i]!) : Math.min(oY, cY);
        const lY = L[i] != null ? pY(L[i]!) : Math.max(oY, cY);
        const bodyH = Math.max(1, Math.abs(oY - cY));
        let color = up ? UP : DN;
        if (data.break12[i])    color = "#00e5ff";
        else if (data.tripleCross[i]) color = "#69f0ae";
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();
        ctx.fillRect(x - bw / 2, Math.min(oY, cY), bw, bodyH);
      }

      // Signal markers — drawn LAST so they appear on top of candles & EMAs
      ctx.textAlign = "center";
      for (let i = 0; i < n; i++) {
        const x = px(i, W);
        const baseY = L[i] != null ? pY(L[i]!) + 14 : cH - PAD.b - 14;
        if (data.break12[i]) {
          ctx.font = "bold 14px monospace"; ctx.fillStyle = "#00e5ff";
          ctx.fillText("⬆", x, baseY);
        } else if (data.tripleCross[i]) {
          ctx.font = "bold 13px monospace"; ctx.fillStyle = "#69f0ae";
          ctx.fillText("↑", x, baseY);
        }
        if (data.smiley[i]) {
          ctx.font = "13px monospace"; ctx.fillStyle = "#ffd740";
          const offset = (data.break12[i] || data.tripleCross[i]) ? 16 : 0;
          ctx.fillText("😊", x, baseY + offset);
        }
        if (data.kdCross[i]) {
          ctx.font = "bold 15px 'Share Tech Mono', monospace"; ctx.fillStyle = "#00e676";
          const offset = (data.break12[i] || data.tripleCross[i] || data.smiley[i]) ? 28 : 0;
          ctx.fillText("$", x, baseY + offset);
        }
      }

      // Crosshair
      if (xhairIdx >= 0 && xhairIdx < n) {
        const xi = xhairIdx;
        const x = px(xi, W);
        ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, cH - PAD.b); ctx.stroke();
        ctx.setLineDash([]);

        if (mainLblRef.current) {
          const d = dates[xi];
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const fmt = (v: number | null) => v != null ? "$" + v.toFixed(2) : "—";
          const up = (C[xi] ?? 0) >= (O[xi] ?? 0);
          const cc = up ? "#26a69a" : "#ef5350";
          const shortStr = SHORT_PERIODS.map((p, j) => {
            const v = sEMAs[j][xi];
            return `<span style="color:${SHORT_COLORS[j]}">E${p}:${v != null ? "$" + v.toFixed(1) : "—"}</span>`;
          }).join("&nbsp;");
          let sigStr = "";
          if (data.break12[xi])         sigStr = `&nbsp;<span style="color:#00e5ff">⬆一阳穿12线</span>`;
          else if (data.tripleCross[xi]) sigStr = `&nbsp;<span style="color:#69f0ae">↑三线金叉</span>`;
          if (data.smiley[xi])           sigStr += `&nbsp;<span style="color:#ffd740">😊双涨</span>`;
          if (data.kdCross[xi])          sigStr += `&nbsp;<span style="color:#00e676;font-weight:bold">$ KD金叉进场</span>`;
          mainLblRef.current.innerHTML =
            `<span style="color:#c9a84c">${dateStr}</span>&nbsp;` +
            `O<span style="color:${cc}">${fmt(O[xi])}</span>&nbsp;` +
            `H<span style="color:${cc}">${fmt(H[xi])}</span>&nbsp;` +
            `L<span style="color:${cc}">${fmt(L[xi])}</span>&nbsp;` +
            `C<span style="color:${cc}">${fmt(C[xi])}</span>` +
            `&nbsp;&nbsp;${shortStr}${sigStr}`;
        }
      } else {
        if (mainLblRef.current) mainLblRef.current.textContent = "K线 + 顾比均线 (GMMA)";
      }
    }

    function drawVol() {
      const W  = getW();
      const vH = Math.max(70, Math.min(110, Math.round(W * 0.08)));
      const ctx = setupCanvas(volEl!, W, vH);
      const vPad = { t: 6, b: 22 };
      const chartH = vH - vPad.t - vPad.b;
      const bu = bUnit(W);
      const bw = bW(W);

      const vMax = Math.max(...(V.filter((v) => v != null) as number[]));
      ctx.clearRect(0, 0, W, vH);
      if (!vMax) return;

      // X labels
      ctx.font = "10px 'Share Tech Mono', monospace"; ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center";
      const step = Math.max(1, Math.floor(n / 10));
      for (let i = 0; i < n; i += step) {
        ctx.fillText(fmtDate(dates[i]), px(i, W), vH - 5);
      }

      // Volume bars
      for (let i = 0; i < n; i++) {
        if (V[i] == null || V[i] === 0) continue;
        const up = (C[i] ?? 0) >= (O[i] ?? 0);
        ctx.fillStyle = up ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)";
        const x = px(i, W);
        const barHeight = (V[i]! / vMax) * chartH;
        ctx.fillRect(x - bw / 2, vH - vPad.b - barHeight, bw, barHeight);
      }

      // Crosshair
      if (xhairIdx >= 0 && xhairIdx < n) {
        const xi = xhairIdx;
        ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(px(xi, W), vPad.t); ctx.lineTo(px(xi, W), vH - vPad.b); ctx.stroke();
        ctx.setLineDash([]);
        if (volLblRef.current && V[xi] != null) {
          const v = V[xi]!;
          const fmtV = v >= 1e9 ? (v / 1e9).toFixed(2) + "B" :
                       v >= 1e6 ? (v / 1e6).toFixed(2) + "M" :
                                  (v / 1e3).toFixed(1) + "K";
          volLblRef.current.innerHTML = `成交量&nbsp;<span style="color:#94a3b8">${fmtV}</span>`;
        }
      } else {
        if (volLblRef.current) volLblRef.current.textContent = "成交量";
      }
    }

    function drawAll() { drawMain(); drawVol(); }

    drawAll();

    // Mouse handlers — use onmouseXXX for easy cleanup
    mainEl.onmousemove = (e) => {
      const W = getW();
      const rect = mainEl.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (W / rect.width);
      xhairIdx = Math.max(0, Math.min(n - 1, Math.round((x - PAD.l) / bUnit(W) - 0.5)));
      drawAll();
    };
    mainEl.onmouseleave = () => { xhairIdx = -1; drawAll(); };

    volEl.onmousemove = (e) => {
      const W = getW();
      const rect = volEl.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (W / rect.width);
      xhairIdx = Math.max(0, Math.min(n - 1, Math.round((x - PAD.l) / bUnit(W) - 0.5)));
      drawAll();
    };
    volEl.onmouseleave = () => { xhairIdx = -1; drawAll(); };

    const ro = new ResizeObserver(drawAll);
    ro.observe(wrapEl);

    return () => {
      mainEl.onmousemove = null;
      mainEl.onmouseleave = null;
      volEl.onmousemove = null;
      volEl.onmouseleave = null;
      ro.disconnect();
    };
  }, [data, interval]);

  return (
    <div ref={wrapRef} className="space-y-3">
      {/* Main chart */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#c9a84c" }} />
          <span ref={mainLblRef} className="text-xs text-muted/60 font-trading truncate">
            K线 + 顾比均线 (GMMA)
          </span>
        </div>
        <canvas ref={mainRef} className="cursor-crosshair" style={{ display: "block", width: "100%" }} />
        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          <span className="text-[10px] text-muted/40 self-center">短期</span>
          {SHORT_PERIODS.map((p, i) => (
            <span key={p} className="flex items-center gap-1 text-[10px] text-muted/60">
              <span className="inline-block w-3 h-px rounded-sm" style={{ background: SHORT_COLORS[i], height: "2px" }} />
              EMA{p}
            </span>
          ))}
          <span className="text-[10px] text-muted/40 self-center ml-1">长期</span>
          {LONG_PERIODS.map((p, i) => (
            <span key={p} className="flex items-center gap-1 text-[10px] text-muted/60">
              <span className="inline-block w-3 h-px rounded-sm" style={{ background: LONG_COLORS[i], height: "2px" }} />
              EMA{p}
            </span>
          ))}
        </div>
      </div>

      {/* Volume chart */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#ffd740" }} />
          <span ref={volLblRef} className="text-xs text-muted/60 font-trading">成交量</span>
        </div>
        <canvas ref={volRef} className="cursor-crosshair" style={{ display: "block", width: "100%" }} />
      </div>
    </div>
  );
}
