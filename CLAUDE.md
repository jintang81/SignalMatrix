# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server on http://localhost:3001
npm run build    # Production build (static export to /out)
npm run lint     # ESLint check
```

No test suite configured yet. Always run `npm run build` after changes to catch TypeScript errors.

## Architecture

**Stack:** Next.js 16 (App Router, static export) + Tailwind CSS v4 + TypeScript + React 19
**Deployment:** Cloudflare Pages (frontend) + Render Starter (Python FastAPI backend, always-on)

**Data flows:**
- **Indicators** (client-only): browser → `src/lib/api/index.ts` → CF Worker proxy (`https://yahoo-proxy.hejintang.workers.dev`) → Yahoo Finance v8 chart API
- **Batch screeners** (bottom/top divergence, volume surge, duck-bill): browser polls `${NEXT_PUBLIC_BACKEND_URL}/api/screener/*` (cached results in Upstash Redis, TTL 48h, refreshed by cron)
- **Sell Put** (on-demand, client-side compute): browser fetches Yahoo Finance chart + `${BACKEND_URL}/api/sellput/options/{ticker}` (Tradier proxy), computes all gates + scoring in browser
- **AI Strategy / NL Screener**: browser → Render backend → Claude API / fundamental cache in Redis

**Static export constraint:** No Next.js API routes. The one exception is `functions/api/stock-score.ts` (Cloudflare Pages Function).

## Key Files

- `src/app/globals.css` — Tailwind v4 `@theme` design tokens + semantic CSS classes (`.panel`, `.btn`, `.tag`, `.tag-ok/warn/bad/info/gold`). **No `tailwind.config.ts`**.
- `src/lib/api/index.ts` — Data Gateway for all Yahoo Finance fetches. Yahoo Finance v7 quote is deprecated (400 for browser); use `/v8/finance/chart/{symbol}?range=5d&interval=1d` and read price from `result.meta`.
- `src/types/index.ts` — Shared TypeScript types for all screeners.
- `backend/main.py` — FastAPI app; imports all screener routers.
- `backend/redis_client.py` — Upstash Redis wrapper (REST API, no TCP).

## Design System

Tailwind v4 color tokens (defined in `globals.css @theme`):

| Token | Value | Usage |
|-------|-------|-------|
| `bg` / `bg-2` / `bg-3` | `#0c0f18` / `#111827` / `#1c2535` | Background layers |
| `border` | `#2e3a50` | Default borders |
| `gold` / `gold-2` | `#c9a84c` / `#f0cc6e` | Accent |
| `up` / `dn` | `#26a69a` / `#ef5350` | Price up/down |
| `bull` / `bear` | `#00e676` / `#ff1744` | Signal labels |
| `muted` / `txt` | `#94a3b8` / `#e2e8f0` | Secondary/primary text |

- Fonts: `--font-stm` → Share Tech Mono (`font-trading`); `--font-nsc` → Noto Serif SC (`font-chinese`)
- Opacity modifiers (`bg-bull/10`, `border-muted/30`) work correctly in Tailwind v4 via `color-mix`.
- Panel surface: `bg-[#131c2e]` with `border-[#3a4f6a]`.
- `h-13` is not a valid Tailwind class; use `h-12` (48px) or `h-14` (56px).

## Screeners

All screeners are live. Each follows the same pattern:

**Batch screeners** (底背离, 底部放量, 正鸭嘴, 顶背离, 顶部放量, 倒鸭嘴, 异常期权信号):
- Backend Python file (e.g. `backend/screener.py`) with `run_*_scan()` entry point
- Three endpoints: `GET /api/screener/{name}`, `GET /api/screener/{name}/status`, `POST /api/screener/{name}/run`
- Frontend page polls every 5s, max 72 attempts (6-min timeout)
- **All must include `scan_time`** in backend dict and `SummaryStats` prop

**Sell Put** (on-demand, client-side):
- Logic: `src/lib/sellput/` — `constants.ts`, `types.ts`, `math.ts`, `gates.ts`, `data.ts`
- Components: `src/components/screeners/sell-put/` — `SellPutForm`, `SellPutTable`, `SellPutDetail`
- Page: `src/app/screeners/sell-put/page.tsx`
- Backend proxy: `backend/sellput_proxy.py` (Tradier options chain)
- Five-gate framework: G0 valuation, G1 market environment, G2 event calendar, G3 contract selection, G4 execution, G5 position management
- Composite score 0–100: G1(40) + G2(20) + G3(25) + risk reflections(15); capped at 35 if no qualified candidate

**AI Strategy / NL Screener:**
- `backend/ai_strategy.py`, `backend/screener_nl.py`
- NL screener caches S&P500+NDX fundamentals in Redis (`screener:nl:fundamentals`); must manually trigger refresh after backend redeploy

## Backend Conventions

- Stock universe: S&P500 + NASDAQ-100 + ETF list (~600 tickers). Use `get_us_large_cap_tickers()` from `screener_volume.py` as reference. **Do not use `pandas.read_html()`** — use custom `html.parser` scraping with fallback lists.
- LA timezone for scan timestamps: `zoneinfo.ZoneInfo("America/Los_Angeles")`.
- Env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `API_KEY`, `TRADIER_TOKEN`, `ANTHROPIC_API_KEY`.

## Deployment

- `next.config.ts`: `output: "export"`, `images: { unoptimized: true }`.
- `NEXT_PUBLIC_*` env vars are **baked at build time** on Cloudflare Pages — wrong value requires redeploy.
- Auth: Cloudflare Zero Trust Access (Google OAuth, "Family Only" policy).
- Canvas charts support pinch-to-zoom on mobile via Touch Events API (`touchstart/touchmove/touchend` with `{ passive: false }`). Do **not** use Pointer Events for pinch — unreliable on iOS Safari.
