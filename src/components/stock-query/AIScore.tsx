import type { AIScoreResponse } from "@/types";

type AIState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: AIScoreResponse }
  | { status: "error"; code?: string };

interface AIScoreProps {
  state: AIState;
}

export default function AIScore({ state }: AIScoreProps) {
  if (state.status === "idle") return null;

  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] tracking-[0.18em] text-gold/80">◈ AI SCORE</p>
        <span className="tag tag-muted text-[9px]">Claude Sonnet</span>
      </div>

      {state.status === "loading" && (
        <div className="flex items-center gap-4 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-border/40" />
          <div className="flex-1 space-y-2">
            <div className="h-2 bg-border/40 rounded w-3/4" />
            <div className="h-2 bg-border/40 rounded w-1/2" />
            <div className="h-2 bg-border/40 rounded w-2/3" />
          </div>
        </div>
      )}

      {state.status === "error" && state.code === "NO_API_KEY" && (
        <div className="text-xs text-muted/70 leading-relaxed">
          <p className="text-gold/70 mb-2">AI 评分功能未配置</p>
          <p>在项目根目录创建 <code className="text-up/80 font-trading">.env.local</code> 并添加：</p>
          <pre className="mt-2 px-3 py-2 bg-bg-3 rounded text-up/80 font-trading text-[11px] leading-relaxed">
            ANTHROPIC_API_KEY=sk-ant-...
          </pre>
          <p className="mt-2 text-muted/50">
            新账号可在{" "}
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-up/70 hover:text-up underline"
            >
              console.anthropic.com
            </a>{" "}
            免费获得 $5 额度
          </p>
        </div>
      )}

      {state.status === "error" && state.code !== "NO_API_KEY" && (
        <p className="text-xs text-dn/70">AI 评分暂时不可用</p>
      )}

      {state.status === "done" && (
        <div className="flex items-start gap-5">
          {/* Score ring */}
          <div className="shrink-0">
            <ScoreRing score={state.result.score} signal={state.result.signal} />
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted/80 leading-relaxed mb-2">{state.result.reasoning}</p>
            <div className="space-y-1">
              {state.result.keyFactors.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-muted/70">
                  <span className="text-gold/60 shrink-0 mt-0.5">›</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score, signal }: { score: number; signal: "BUY" | "HOLD" | "SELL" }) {
  const scoreColor =
    signal === "BUY" ? "#00e676"
    : signal === "HOLD" ? "#c9a84c"
    : "#ff1744";

  const signalClass =
    signal === "BUY" ? "tag-up"
    : signal === "HOLD" ? "tag-gold"
    : "tag-dn";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{
          background: `conic-gradient(${scoreColor} ${score * 3.6}deg, #2e3a50 0deg)`,
        }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-trading"
          style={{ background: "#131c2e", color: scoreColor }}
        >
          {score}
        </div>
      </div>
      <span className={`tag ${signalClass} text-[10px]`}>{signal}</span>
    </div>
  );
}
