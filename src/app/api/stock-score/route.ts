import { NextRequest, NextResponse } from "next/server";
import type { AIScoreResponse } from "@/types";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "NO_API_KEY" }, { status: 503 });
  }

  let body: { symbol: string; fundamentals: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { symbol, fundamentals } = body;

  const prompt = `You are a quantitative stock analyst. Analyze ${symbol} using the data below and return a JSON object ONLY — no markdown, no preamble, no explanation outside JSON.

Data:
${JSON.stringify(fundamentals, null, 2)}

Return exactly this JSON structure (nothing else):
{
  "score": <integer 1-100>,
  "signal": "<BUY|HOLD|SELL>",
  "reasoning": "<2-3 sentence rationale in Chinese>",
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>"]
}

Scoring guide: 70-100 = BUY, 40-69 = HOLD, 1-39 = SELL.
Base score on: valuation (PE/PB/PEG), growth (revenue YoY, earnings growth), profitability (ROE/FCF/margins), technical (RSI, 52w position), analyst consensus. Be concise. Key factors should be brief (≤15 words each).`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", err);
      return NextResponse.json({ error: "CLAUDE_ERROR" }, { status: 502 });
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";

    // Strip potential markdown fences
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed: AIScoreResponse = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (e) {
    console.error("stock-score route error:", e);
    return NextResponse.json({ error: "PARSE_ERROR" }, { status: 500 });
  }
}
