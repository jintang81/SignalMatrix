"use client";

import { useRef, useEffect } from "react";
import type { OvernightStock } from "@/types";

interface Props {
  stock: OvernightStock;
}

// ─── mini sparkline canvas ─────────────────────────────────────────

function MiniChart({ closes, volumes }: { closes: number[]; volumes: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || closes.length < 2) return;
    const ctx   = canvas.getContext("2d");
    if (!ctx)   return;

    const W = canvas.width;
    const H = canvas.height;
    const priceH = Math.round(H * 0.68);
    const volH   = H - priceH - 4;

    ctx.clearRect(0, 0, W, H);

    // price line
    const minP = Math.min(...closes);
    const maxP = Math.max(...closes);
    const rngP = maxP - minP || 1;

    const xStep = W / (closes.length - 1);
    const toY   = (v: number) => priceH - ((v - minP) / rngP) * (priceH - 4) - 2;

    // gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, priceH);
    grad.addColorStop(0, "rgba(0,230,118,0.18)");
    grad.addColorStop(1, "rgba(0,230,118,0)");
    ctx.beginPath();
    closes.forEach((c, i) => {
      const x = i * xStep;
      const y = toY(c);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo((closes.length - 1) * xStep, priceH);
    ctx.lineTo(0, priceH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    closes.forEach((c, i) => {
      const x = i * xStep;
      const y = toY(c);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#00e676";
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // volume bars
    if (volumes.length > 0) {
      const maxV  = Math.max(...volumes, 1);
      const bW    = Math.max(xStep - 1, 1);
      volumes.forEach((v, i) => {
        const bH = (v / maxV) * volH;
        const x  = i * xStep - bW / 2;
        const y  = H - bH;
        ctx.fillStyle = "rgba(148,163,184,0.25)";
        ctx.fillRect(x, y, bW, bH);
      });
    }
  }, [closes, volumes]);

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={80}
      className="w-full"
      style={{ display: "block" }}
    />
  );
}

// ─── Badge helper ──────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[10px] font-trading px-1.5 py-0.5 rounded"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}

// ─── Main card ─────────────────────────────────────────────────────

export default function OvernightCard({ stock }: Props) {
  const pctColor = stock.pct_change >= 0
    ? "var(--color-up)"
    : "var(--color-dn)";

  const vwapOk = stock.above_vwap === true;
  const vwapMissing = stock.above_vwap === null;

  return (
    <div className="panel p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-bold text-txt font-trading tracking-wide">
            {stock.ticker}
          </p>
          <p className="text-xs text-muted/60 font-trading mt-0.5">
            市值 {stock.mktcap_b.toFixed(1)}B
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold font-trading" style={{ color: pctColor }}>
            {stock.pct_change >= 0 ? "+" : ""}{stock.pct_change.toFixed(2)}%
          </p>
          <p className="text-xs text-muted/70 font-trading">
            ${stock.price.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Sparkline */}
      <div className="rounded overflow-hidden bg-bg-3/50">
        <MiniChart closes={stock.chart.close} volumes={stock.chart.volume} />
      </div>

      {/* Signal badges */}
      <div className="flex flex-wrap gap-1.5">
        <Badge
          label={`量比 ${stock.volume_ratio.toFixed(2)}x`}
          color="var(--color-gold)"
        />
        {stock.turnover_rate !== null ? (
          <Badge
            label={`换手 ${stock.turnover_rate.toFixed(1)}%`}
            color="var(--color-up)"
          />
        ) : (
          <Badge label="换手 —" color="var(--color-muted)" />
        )}
        {vwapMissing ? (
          <Badge label="VWAP —" color="var(--color-muted)" />
        ) : (
          <Badge
            label={vwapOk ? "价 > VWAP ✓" : "价 < VWAP ✗"}
            color={vwapOk ? "var(--color-bull)" : "var(--color-bear)"}
          />
        )}
        <Badge
          label={`20日最大 +${stock.max_gain_20d.toFixed(1)}%`}
          color="#a78bfa"
        />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-trading text-muted/70">
        <div>
          <span className="text-muted/40">今日量</span>
          <span className="ml-1 text-txt/80">
            {(stock.today_volume / 1e6).toFixed(1)}M
          </span>
        </div>
        <div>
          <span className="text-muted/40">均量20</span>
          <span className="ml-1 text-txt/80">
            {(stock.avg_vol_20d / 1e6).toFixed(1)}M
          </span>
        </div>
        {stock.vwap !== null && (
          <div>
            <span className="text-muted/40">VWAP</span>
            <span className="ml-1 text-txt/80">${stock.vwap.toFixed(2)}</span>
          </div>
        )}
        {stock.float_shares !== null && (
          <div>
            <span className="text-muted/40">流通股</span>
            <span className="ml-1 text-txt/80">
              {(stock.float_shares / 1e9).toFixed(1)}B
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
