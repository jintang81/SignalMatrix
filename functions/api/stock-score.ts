// Cloudflare Pages Function — replaces src/app/api/stock-score/route.ts for static export
export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: { ANTHROPIC_API_KEY?: string };
}): Promise<Response> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "NO_API_KEY" }, 503);
  }

  let body: { symbol: string; fundamentals: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
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
      console.error("Claude API error:", await response.text());
      return json({ error: "CLAUDE_ERROR" }, 502);
    }

    const data = await response.json();
    const text: string = (data as { content?: { text?: string }[] }).content?.[0]?.text ?? "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return json(parsed, 200);
  } catch (e) {
    console.error("stock-score function error:", e);
    return json({ error: "PARSE_ERROR" }, 500);
  }
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
