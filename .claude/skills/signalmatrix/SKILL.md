---
name: signalmatrix
description: "SignalMatrix 项目完整上下文。美股智能筛选与技术分析平台，Next.js 16 + Tailwind CSS v4 + TypeScript + React 19 + Python FastAPI 后端。包含设计系统规范、架构约定、部署配置、所有筛选器（底背离、底部放量、正鸭嘴、顶背离、顶部放量、倒鸭嘴、异常期权信号、AI Strategy、NL Screener、Sell Put 开仓决策）的实现模式。适用于：新增功能、新筛选器、UI 修改、后端 API、部署配置、调试已知问题。"
---

# SignalMatrix — 项目 Skill

## 项目概述

SignalMatrix 是面向美股个人散户投资者的智能股票筛选与技术分析平台，当前阶段供家庭内部使用（Cloudflare Zero Trust Access 控制访问）。

**仓库路径：** `c:\Users\hejin\Documents\Claude\Website projects\SignalMatrix`
**线上前端：** Cloudflare Pages（自动从 GitHub main 分支部署）
**线上后端：** https://signalmatrix-api.onrender.com

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 (App Router) + React 19，静态导出 (`output: "export"`) |
| 样式 | Tailwind CSS v4，CSS-first 配置，无 tailwind.config.ts |
| 后端 | Python FastAPI，部署于 Render Starter ($7/mo，常驻无冷启动) |
| 缓存 | Upstash Redis，TTL 48h |
| 数据 | yfinance（后端）+ Yahoo Finance v8 API（前端经 CF Worker 代理） |
| AI | claude-opus-4-6（策略/评分），claude-haiku-4-5（NL 筛选解析） |
| 调度 | cron-job.org，工作日 16:30 PDT 起每分钟触发各筛选器 |
| 代理 | Cloudflare Worker：`https://yahoo-proxy.hejintang.workers.dev/` |

---

## 设计系统

所有颜色/字体 token 在 `src/app/globals.css` 的 `@theme` 块中定义（Tailwind v4 CSS-first）。

### 颜色 Token

| Token | 值 | 用途 |
|-------|-----|------|
| `bg` / `bg-2` / `bg-3` | `#0c0f18` / `#111827` / `#1c2535` | 背景层级 |
| `border` | `#2e3a50` | 默认边框 |
| `gold` / `gold-2` | `#c9a84c` / `#f0cc6e` | 强调色/Logo |
| `up` / `dn` | `#26a69a` / `#ef5350` | 涨跌颜色（青/红） |
| `bull` / `bear` | `#00e676` / `#ff1744` | 信号标签 |
| `muted` / `txt` | `#94a3b8` / `#e2e8f0` | 次要/主要文字 |

Panel 面板：背景 `#131c2e`，边框 `#3a4f6a`（必须比 body `#0c0f18` 亮）。

Opacity 修饰符（`bg-bull/10`, `border-up/20`）在 Tailwind v4 中正常工作（color-mix）。

### 字体

- `--font-stm` → Share Tech Mono → `font-trading` 工具类（所有 UI/数据显示）
- `--font-nsc` → Noto Serif SC → `font-chinese` 工具类（中文内容）
- CSS 过渡曲线：`cubic-bezier(0.16, 1, 0.3, 1)`（Expo.out）→ `--ease-expo` CSS var

### 常用 CSS 类（globals.css 定义）

`.panel`, `.btn`, `.tag`, `.tag-up`, `.tag-dn`, `.tag-gold`, `.tag-muted`

---

## 关键文件

```
src/
  app/
    globals.css               — Tailwind v4 @theme tokens + 语义化 CSS 类
    layout.tsx                — 字体加载（next/font/google）
    page.tsx                  — 首页（Stock Query + Indicators + Screeners hub）
    screeners/
      page.tsx                — Screeners Hub
      bottom-divergence/page.tsx
      bottom-volume/page.tsx
      duck/page.tsx
      top-divergence/page.tsx
      top-volume/page.tsx
      inverted-duck/page.tsx
      options/page.tsx
      ai-strategy/page.tsx
      nl-results/page.tsx
      sell-put/page.tsx       — Sell Put 开仓决策（按需扫描，客户端计算）
  components/
    layout/Navbar.tsx         — 顶部导航（sticky, h-14）
    screeners/
      sell-put/
        SellPutForm.tsx       — 参数表单（tickers, cash, DTE, 入场模式, 数据源）
        SellPutTable.tsx      — 扫描结果汇总表（可排序，点击选中行）
        SellPutDetail.tsx     — 选中 ticker 详情（G0–G5 + 风险反思 + 词汇表）
  lib/
    api/
      index.ts                — 数据网关（所有市场数据访问入口）
      screener.ts             — Screener API 调用 + mock fallback
    indicators/index.ts       — 纯函数技术指标计算
    sellput/
      constants.ts            — PARENT_MAP, LEVERAGE_MAP, MACRO_EVENTS, DEFAULT_TICKERS
      types.ts                — 所有 Sell Put TypeScript 类型
      math.ts                 — 纯函数：calcSMA/RSI/ATR/HV/IVRank/TrendStrength/Greeks
      gates.ts                — runGate0–5, calcCompositeScore, runRiskReflections
      data.ts                 — fetchSellPutChart, fetchBackendOptions, analyzeTicker
  types/index.ts              — 共享 TypeScript 类型

backend/
  main.py                     — FastAPI 入口，所有路由
  screener.py                 — 底背离 (run_full_scan)
  screener_volume.py          — 底部放量 (run_volume_scan)
  screener_duck.py            — 正鸭嘴 (run_duck_scan)
  screener_top_div.py         — 顶背离
  screener_top_vol.py         — 顶部放量
  screener_inv_duck.py        — 倒鸭嘴
  screener_options.py         — 异常期权信号（Tradier API）
  screener_nl.py              — AI 自然语言筛选（Claude Haiku）
  ai_strategy.py              — AI 综合策略（claude-opus-4-6）
  sellput_proxy.py            — Sell Put Tradier 期权链代理（GET /api/sellput/options/{ticker}）
  redis_client.py             — Upstash Redis 封装

functions/
  api/stock-score.ts          — Cloudflare Pages Function（AI 评分 API）

next.config.ts                — output: "export", images.unoptimized: true
```

---

## 架构约定

### 数据访问规则

- **所有市场数据**必须通过 `src/lib/api/` 访问，组件内禁止直接 fetch
- Yahoo Finance v7/quote 在前端已弃用（返回 400）→ 使用 v8/chart/{symbol}，从 `result.meta` 读价格
- v7/quote 仍可从 Python 后端通过 CF Worker 代理使用（用于 marketCap fallback）

### 筛选器模式（新筛选器必须遵循）

**后端标准结构：**
```python
return {
    "stocks": [...],
    "total_scanned": N,
    "signals_found": M,
    "scan_time": now_la.strftime(f"%Y-%m-%d %H:%M:%S {tz_abbr}"),  # 必须包含
}
```

**前端类型（src/types/index.ts）：**
```typescript
interface XxxResult {
  stocks: XxxStock[];
  total_scanned: number;
  signals_found: number;
  scan_time?: string;  // 必须包含
}
```

**SummaryStats 组件：** 接收 `scanTime?: string` prop，在第一个 stat card 中显示扫描时间。

**轮询模式：** 5s 间隔，MAX 72 次（6分钟超时）。

### 股票池约定（所有新筛选器默认）

参照 `screener_volume.py` 的 `get_us_large_cap_tickers()`：
- S&P500（Wikipedia `html.parser` 抓取，失败回退 `_FALLBACK_SP500` ~500只）
- NASDAQ-100（GitHub CSV → Wikipedia 双重 fallback，失败回退 `_FALLBACK_NDX`）
- ETF（固定列表 `ETF_LIST` ~40只）
- 去重，约 600 只
- **禁止用 `pandas.read_html()`**（Render 上可能失败）
- NL screener 不含 ETF（需基本面数据），约 560 只

### Redis Key 命名规范

```
screener:{type}:result    — 扫描结果
screener:{type}:status    — 扫描状态
```
type 值：`divergence`, `volume`, `duck`, `top-divergence`, `top-volume`, `inverted-duck`, `options`, `ai-strategy`, `nl:fundamentals`

---

## 已实现的筛选器

| 信号 | 类型 | 后端文件 | 前端路由 | Redis Key |
|------|------|----------|----------|-----------|
| 底背离 | Bull | screener.py | /screeners/bottom-divergence | screener:divergence |
| 底部放量 | Bull | screener_volume.py | /screeners/bottom-volume | screener:volume |
| 正鸭嘴 | Bull | screener_duck.py | /screeners/duck | screener:duck |
| 顶背离 | Bear | screener_top_div.py | /screeners/top-divergence | screener:top-divergence |
| 顶部放量 | Bear | screener_top_vol.py | /screeners/top-volume | screener:top-volume |
| 倒鸭嘴 | Bear | screener_inv_duck.py | /screeners/inverted-duck | screener:inverted-duck |
| 异常期权信号 | Options | screener_options.py | /screeners/options | screener:options |
| AI 综合策略 | AI | ai_strategy.py | /screeners/ai-strategy | screener:ai-strategy |
| AI 自然语言筛选 | AI | screener_nl.py | /screeners/nl-results | screener:nl:fundamentals |
| Sell Put 开仓决策 | Options Income | sellput_proxy.py | /screeners/sell-put | 无（按需计算，不缓存）|

---

## Sell Put 开仓决策筛选器

**架构：** 纯前端按需计算，无 Redis 缓存。用户输入 tickers → 顺序扫描（防限速）→ 逐 ticker 更新 UI。

### 数据获取（`src/lib/sellput/data.ts` `analyzeTicker()`）

1. 获取 ETF 图表（2年，用于 IVR 计算）
2. 获取 parent 图表（5年，用于 MA200 + 估值 PE 匹配）
3. 获取期权链：YF `/v7/finance/options/{ticker}` + Tradier `GET /api/sellput/options/{ticker}` → **UNION 合并**
   - Tradier 返回 `bid=0.0`（非 null）代表非活跃合约 → 合并时需检查 `bid > 0` 才采用
   - YF 有时覆盖更多 strike，Tradier 有时更多 → UNION 取并集，Tradier 数据优先（bid>0 时）
4. 获取财报日期（Yahoo Finance）
5. 获取估值数据（PE/EPS）
6. 运行 Gate 0–5 + 风险反思 + 综合评分

### 五关逻辑（`src/lib/sellput/gates.ts`）

| 关 | 函数 | 关键逻辑 |
|----|------|---------|
| G0 | `runGate0` | 历史 PE 中位数（5年），当前 PE 百分位，EPS 趋势 |
| G1 | `runGate1` | VIX<20/趋势、RSI 30-70、IV/HV<1.5、MA200 距离<20%、趋势强度>0.3（6项，一票否决）|
| G2 | `runGate2` | 财报日±1禁建仓，CPI/PCE/非农发布日判断；DTE窗口内事件累加OTM加宽 |
| G3 | `runGate3` | OTM = ATR%×乘数×√(DTE/30) + G2加宽 + IV/HV加宽；合约检查7项（inRange/delta/gamma/theta/annualROI/流动性/LRS安全）|
| G4 | `runGate4` | 资金使用率、限价单、最大张数、PA200距离确认 |
| G5 | `runGate5` | 止盈：合约市价≤权利金×50%；止损：合约市价≥权利金×200%（1x亏损） |

### 综合评分（`calcCompositeScore`）

- G1 全通过 +40，否则 +0（一票否决）
- G2 基础 20 分，财报日 −10/个，宏观blocker −2/个，加宽事件 −2/个
- G3 最佳合约满足条件数/7×25；无合格候选合约 → 总分上限 35
- 风险反思 15 分，bad −5/个，warn −2/个

### 数据常量（`src/lib/sellput/constants.ts`）

- `PARENT_MAP`：ETF → 底层指数（如 TQQQ→QQQ, SOXL→SOXX）
- `LEVERAGE_MAP`：ETF 杠杆倍数
- `MACRO_EVENTS`：已知 CPI/PCE/非农日期列表
- `DEFAULT_TICKERS`：`TQQQ,SOXL,TSLL,NVDL,AMZN,GOOGL,NVDA,MSFT`

### 已知 Quirks

- NVDL 等小型 ETF 的期权 strike 步长不均匀（$86以上 $0.50，$86以下 $1.00）→ 目标区间可能落在无 strike 的空白处，正常现象
- Tradier `bid=0.0` ≠ null，`??` 运算符会保留 0 → 必须用 `bid > 0` 判断是否有有效报价
- OTM 杠杆 ETF put 的 bid-ask spread 通常 20-40%，`liquidityOk` 阈值设为 40%

---

## 部署配置

### 环境变量

**Render（后端）：**
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `API_KEY`（`X-API-Key` header 鉴权）
- `ANTHROPIC_API_KEY`（claude-opus-4-6）
- `TRADIER_TOKEN`（期权数据）

**Cloudflare Pages（前端，构建时烘入）：**
- `NEXT_PUBLIC_BACKEND_URL`（`https://signalmatrix-api.onrender.com`）
- `NEXT_PUBLIC_SCAN_API_KEY`
- `ANTHROPIC_API_KEY`（Stock Query AI 评分，Pages Function 使用）
- `NODE_VERSION=20`

> ⚠️ `NEXT_PUBLIC_*` 变量在构建时烘入，修改后必须重新部署。

### cron-job.org 定时任务（工作日，PDT）

| 时间 | 接口 |
|------|------|
| 16:30 | POST /api/screener/run（底背离）|
| 16:31 | POST /api/screener/volume/run |
| 16:32 | POST /api/screener/duck/run |
| 16:33 | POST /api/screener/top-divergence/run |
| 16:34 | POST /api/screener/top-volume/run |
| 16:35 | POST /api/screener/inverted-duck/run |
| 16:36 | POST /api/screener/options/run |
| 16:30 | POST /api/screener/nl/refresh-fundamentals |

所有请求需携带 `X-API-Key: <API_KEY>` header。

---

## 图表交互模式

所有 Canvas 图表支持：鼠标滚轮缩放（桌面）、单指拖动平移（触屏）、双指捏合缩放（触屏/iOS PWA）。

### 关键原则

- **iOS Safari 上禁止用 Pointer Events 做多点捏合缩放**：`setPointerCapture` + 多点触控在 iOS 上不可靠，第二根手指的 `pointermove` 可能无法收到
- **捏合缩放用 Touch Events API**：`touchstart/touchmove/touchend/touchcancel`，注册时加 `{ passive: false }` 以便调用 `e.preventDefault()`
- **单指拖动继续用 Pointer Events**（`pointerdown/pointermove/pointerup`）
- `isPinching` / `isPinchingRef` 标志位协调两套事件，防止捏合时触发拖动

### 两种实现模式

**Pattern A**（5 个文件，addEventListener in useEffect）：
- `DivergenceChart`, `VolumeChart`(bottom/top), `TopDivChart`, `CompositeChart`
- 局部变量：`let isPinching = false; let touchPinch = null;`
- `onPointerDown` 检查 `if (isPinching) return;`

**Pattern B**（2 个文件，useCallback + useRef）：
- `DuckChart`, `InvertedDuckChart`
- `const isPinchingRef = useRef(false);`
- Touch Events 在独立 `useEffect` 中注册（deps: `[draw, n]`）
- Canvas JSX 需加 `style={{ touchAction: "none" }}`

详细代码模板见 `memory/charts.md`。

## 已知问题与修复

| 问题 | 修复方案 |
|------|----------|
| Yahoo Finance v7/quote 前端 400 | 改用 v8/chart/{symbol}，从 result.meta 读价格 |
| `h-13` 非有效 Tailwind 类 | 用 `h-12`（48px）或 `h-14`（56px）|
| NEXT_PUBLIC_* 烘入了 localhost | screener.ts 增加 localhost guard，fallback 到 Render URL |
| Render 上 pandas.read_html() 失败 | 改用 html.parser 手写抓取 |
| scan_time 缺失 | 后端 return dict 和前端 SummaryStats 均需包含 scan_time |
| iOS Safari 捏合缩放失效 | 弃用 Pointer Events 多点触控，改用 Touch Events API（见图表交互模式）|

---

## PWA 支持

已实现 Service Worker + Web App Manifest：
- `display: standalone`（无浏览器 UI）
- iOS Safari 全屏：`viewportFit: cover` + `env(safe-area-inset-*)`
- `statusBarStyle: black-translucent`
- Service Worker 缓存静态资源
- 详细实现：`memory/pwa.md`

---

## 访问控制

Cloudflare Zero Trust Access，Google OAuth，"Family Only" 邮件白名单策略。
添加家庭成员：将 Gmail 加入 Family Only Policy → Emails 列表。
