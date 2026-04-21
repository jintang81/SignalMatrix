"use client";

import { useRef, useEffect, useState } from "react";
import type { OvernightStock, OvernightExitAnalysis, OvernightTimesalesBar } from "@/types";
import { fetchOvernightExitAnalysis } from "@/lib/api/screener";

// ─── Mini 15-min chart ────────────────────────────────────────────

function MiniOpeningChart({
  bars,
  openPrice,
}: {
  bars: OvernightTimesalesBar[];
  openPrice: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const pad = { top: 8, right: 4, bottom: 8, left: 4 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;

    const closes = bars.map((b) => Number(b.close));
    const highs  = bars.map((b) => Number(b.high));
    const lows   = bars.map((b) => Number(b.low));

    const allPrices = [...closes, ...highs, ...lows, openPrice];
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const rngP = maxP - minP || 1;

    ctx.clearRect(0, 0, W, H);

    const xStep = innerW / (bars.length - 1);
    const toX   = (i: number) => pad.left + i * xStep;
    const toY   = (v: number) =>
      pad.top + innerH - ((v - minP) / rngP) * innerH;

    // Open price reference line
    const openY = toY(openPrice);
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(148,163,184,0.4)";
    ctx.lineWidth = 1;
    ctx.moveTo(pad.left, openY);
    ctx.lineTo(W - pad.right, openY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Area fill
    const lastClose = closes[closes.length - 1];
    const lineColor = lastClose >= openPrice ? "#00e676" : "#ff1744";
    const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
    grad.addColorStop(0, `${lineColor}25`);
    grad.addColorStop(1, `${lineColor}00`);

    ctx.beginPath();
    closes.forEach((c, i) => {
      const x = toX(i);
      const y = toY(c);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(toX(closes.length - 1), H - pad.bottom);
    ctx.lineTo(pad.left, H - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Price line
    ctx.beginPath();
    closes.forEach((c, i) => {
      const x = toX(i);
      const y = toY(c);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [bars, openPrice]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={72}
      className="w-full"
      style={{ display: "block" }}
    />
  );
}

// ─── Scenario badge ───────────────────────────────────────────────

const SCENARIO_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  washout:      { label: "洗盘 — 持有",      color: "#00e676", icon: "🟢" },
  flee:         { label: "主力出逃 — 立即卖", color: "#ff1744", icon: "🔴" },
  weak_bounce:  { label: "弱反弹 — 立即卖",  color: "#ff1744", icon: "🔴" },
  fake_drop:    { label: "假摔 — 持有",      color: "#00e676", icon: "🟢" },
  steady_rise:  { label: "稳健拉升 — 持稳",  color: "#60a5fa", icon: "🔵" },
  weak:         { label: "开盘走弱 — 立即卖", color: "#ff1744", icon: "🔴" },
};

// ─── Single row in the monitor table ─────────────────────────────

interface RowProps {
  stock: OvernightStock;
  bought: boolean;
  onToggleBought: (ticker: string) => void;
  analysis: OvernightExitAnalysis | null;
  loading: boolean;
  onAnalyze: (ticker: string) => void;
}

function MonitorRow({
  stock,
  bought,
  onToggleBought,
  analysis,
  loading,
  onAnalyze,
}: RowProps) {
  const scenarioCfg = analysis?.scenario
    ? SCENARIO_CONFIG[analysis.scenario] ?? null
    : null;

  return (
    <div className="panel p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={bought}
          onChange={() => onToggleBought(stock.ticker)}
          className="w-4 h-4 accent-gold rounded cursor-pointer"
        />
        <div className="flex-1">
          <span className="text-base font-bold text-txt font-trading">
            {stock.ticker}
          </span>
          <span className="ml-2 text-xs text-muted/60 font-trading">
            昨入场 ${stock.price.toFixed(2)}
          </span>
        </div>
        <button
          onClick={() => onAnalyze(stock.ticker)}
          disabled={loading}
          className="btn text-xs px-3 py-1.5 disabled:opacity-40"
        >
          {loading ? "分析中..." : "分析开盘"}
        </button>
      </div>

      {/* Analysis result */}
      {analysis && analysis.status === "waiting" && (
        <p className="text-xs text-muted/60 font-trading">
          {analysis.message}
        </p>
      )}

      {analysis && analysis.status === "analyzed" && (
        <div className="flex flex-col gap-2">
          {/* Scenario badge */}
          {scenarioCfg && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-trading"
              style={{
                background: `${scenarioCfg.color}15`,
                border: `1px solid ${scenarioCfg.color}40`,
                color: scenarioCfg.color,
              }}
            >
              <span>{scenarioCfg.icon}</span>
              <span className="font-semibold">{scenarioCfg.label}</span>
              <span className="ml-auto text-[11px] opacity-70">
                {analysis.gain_pct !== undefined &&
                  `${analysis.gain_pct >= 0 ? "+" : ""}${analysis.gain_pct.toFixed(2)}%`}
              </span>
            </div>
          )}

          {/* Detail text */}
          {analysis.detail && (
            <p className="text-[11px] text-muted/70 font-trading">
              {analysis.detail}
            </p>
          )}

          {/* Mini chart */}
          {analysis.bars.length > 1 && analysis.open_price !== undefined && (
            <div className="rounded overflow-hidden bg-bg-3/50">
              <MiniOpeningChart
                bars={analysis.bars as OvernightTimesalesBar[]}
                openPrice={analysis.open_price}
              />
              <div className="flex justify-between text-[10px] text-muted/40 font-trading px-1 pb-1">
                <span>9:30</span>
                <span className="opacity-50">
                  开盘价 ${analysis.open_price.toFixed(2)}
                </span>
                <span>9:45</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ExitAnalysis panel (full component) ─────────────────────────

interface ExitAnalysisProps {
  stocks: OvernightStock[];
  boughtMap: Record<string, boolean>;
  onToggleBought: (ticker: string) => void;
}

export default function ExitAnalysis({
  stocks,
  boughtMap,
  onToggleBought,
}: ExitAnalysisProps) {
  const [analysisMap, setAnalysisMap] = useState<
    Record<string, OvernightExitAnalysis | null>
  >({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  const handleAnalyze = async (ticker: string) => {
    setLoadingMap((prev) => ({ ...prev, [ticker]: true }));
    try {
      const result = await fetchOvernightExitAnalysis(ticker);
      setAnalysisMap((prev) => ({ ...prev, [ticker]: result }));
    } catch (err) {
      console.error("Exit analysis failed:", err);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [ticker]: false }));
    }
  };

  if (stocks.length === 0) {
    return (
      <p className="text-center text-muted/50 font-trading py-12">
        暂无候选股，请等待今日 3:40 PM EST 扫描完成
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted/60 font-trading">
        勾选您已买入的股票，然后在次日 9:45 AM EST 后点击「分析开盘」查看出场建议
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stocks.map((s) => (
          <MonitorRow
            key={s.ticker}
            stock={s}
            bought={boughtMap[s.ticker] ?? false}
            onToggleBought={onToggleBought}
            analysis={analysisMap[s.ticker] ?? null}
            loading={loadingMap[s.ticker] ?? false}
            onAnalyze={handleAnalyze}
          />
        ))}
      </div>
    </div>
  );
}
