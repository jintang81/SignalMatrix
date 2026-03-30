# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server on http://localhost:3001
npm run build    # Production build
npm run lint     # ESLint check
```

No test suite configured yet.

## Architecture

**Stack:** Next.js 16 (App Router) + Tailwind CSS v4 + TypeScript + React 19

**Data flow:**
- **Indicators** (frontend-only): browser → `src/lib/api/index.ts` → Cloudflare Worker proxy → Yahoo Finance API
- **Screeners** (needs backend, not yet built): browser → Python FastAPI → Yahoo Finance / `yfinance`
- All market data access must go through `src/lib/api/` (Data Gateway pattern — no direct fetch calls in components)

**Key files:**
- `src/app/globals.css` — Tailwind v4 design tokens (`@theme`) + semantic CSS classes (`.panel`, `.btn`, `.tag`, `.tag-up/dn/gold/muted`). **No `tailwind.config.ts`** — all config is CSS-first.
- `src/lib/api/index.ts` — Data Gateway. CF Worker proxy: `https://yahoo-proxy.hejintang.workers.dev`. Yahoo Finance v7 quote is deprecated (400); use `/v8/finance/chart/{symbol}` and read price from `result.meta`.
- `src/lib/indicators/index.ts` — Pure-function technical indicator calculations (no side effects).
- `src/types/index.ts` — Shared types: `SignalType`, `TimeRange`, `ScreenerResult`.
- `src/components/layout/Navbar.tsx` — Client component (`usePathname`). Sticky top nav, h-14 (3.5rem).

## Design System

Tailwind v4 color tokens (defined in `globals.css @theme`, generates `text-*`/`bg-*`/`border-*` utilities):

| Token | Value | Usage |
|-------|-------|-------|
| `bg` / `bg-2` / `bg-3` | `#0c0f18` / `#111827` / `#1c2535` | Background layers |
| `border` | `#2e3a50` | Default borders |
| `gold` / `gold-2` | `#c9a84c` / `#f0cc6e` | Accent, logos |
| `up` / `dn` | `#26a69a` / `#ef5350` | Price up/down |
| `bull` / `bear` | `#00e676` / `#ff1744` | Signal labels |
| `muted` / `txt` | `#94a3b8` / `#e2e8f0` | Secondary/primary text |

Fonts loaded via `next/font/google` in `layout.tsx`:
- `--font-stm` → Share Tech Mono (monospace, all UI/data)
- `--font-nsc` → Noto Serif SC (Chinese content)

Opacity modifiers (`bg-bull/10`, `text-muted/60`) work correctly in Tailwind v4.

Panel surface: `#131c2e` background with `#3a4f6a` border (must be lighter than body `#0c0f18`).

## Planned Modules (not yet built)

| Module | Status | Notes |
|--------|--------|-------|
| Stock Query | Placeholder | Symbol search, AI score, news |
| Indicators | Placeholder | SuperTrend, 六彩神龙, GMMA+, chart |
| Bull/Bear Screeners | Placeholder | Requires Python FastAPI backend + Redis cache |
| AI Strategy | Placeholder | Claude API, daily generation |

Backend (Python FastAPI + Redis + PostgreSQL) has not been started. Screener skill files needed before implementation.
