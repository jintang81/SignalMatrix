# SignalMatrix — 产品需求文档 (PRD)

**版本：** v1.0
**日期：** 2026-04-05
**状态：** 已上线 ✅

---

## 1. 产品概述

SignalMatrix 是一个面向美股个人散户投资者的智能股票筛选与技术分析平台。核心差异化在于：

- **Indicators**：纯前端技术指标工具集，无需后端，浏览器直接调用 Yahoo Finance API（经 Cloudflare Worker 代理）
- **Screeners**：基于预定义信号逻辑的 Bull/Bear 股票筛选器，结合 AI 推荐策略
- **AI 全面融合**：AI 评分、自然语言筛选、市场解读三位一体

---

## 2. 目标用户

美股个人散户投资者，希望通过技术信号和量化筛选找到交易机会，无需专业金融背景。当前阶段为家庭内部使用（Cloudflare Zero Trust Access 控制访问）。

---

## 3. 页面布局与信息架构

```
┌─────────────────────────────────────────────────────┐
│  导航栏（Logo + 导航菜单）                             │
├─────────────────────────────────────────────────────┤
│  STOCK QUERY 工具（顶部常驻）                          │
│  输入股票代码 → 展示基本信息 + AI 综合评分              │
├─────────────────────────────────────────────────────┤
│  INDICATORS 区域                                     │
│  SuperTrend | 六彩神龙 | 顾比均线加强版 | 综合图表      │
├─────────────────────────────────────────────────────┤
│  SCREENERS 区域                                      │
│                                                     │
│  🟢 BULL SIGNAL                                      │
│  底背离 | 底部放量 | 正鸭嘴                            │
│                                                     │
│  🔴 BEAR SIGNAL                                      │
│  顶背离 | 顶部放量 | 倒鸭嘴                            │
│                                                     │
│  🔵 OPTIONS FLOW                                     │
│  异常期权信号                                         │
│                                                     │
│  🟡 AI STRATEGY                                      │
│  AI 综合策略 | AI 自然语言筛选                         │
└─────────────────────────────────────────────────────┘
```

---

## 4. 功能模块详细需求

### 4.1 STOCK QUERY（顶部常驻工具）

**功能描述：** 输入美股代码，快速查看股票基本信息。

**核心功能：**
- 输入框支持股票代码搜索
- 展示基本面信息（公司名、行业、市值、PE/PB/EPS 等）
- 展示价格走势迷你图
- AI 综合评分：Claude 输出该股票的 Buy/Hold/Sell 综合评级及理由摘要（结果缓存 1 小时）

---

### 4.2 INDICATORS 区域

**架构特点：** 纯前端工具，所有数据通过 Cloudflare Worker 代理调用 Yahoo Finance API，无需后端。

**工具列表：**
1. **SuperTrend** — 趋势跟踪指标
2. **六彩神龙** — 自定义多色均线系统
3. **顾比均线加强版（GMMA+）** — 多均线组合系统
4. **综合技术指标图表** — Canvas 自定义实现，支持 K线 + MACD + RSI + 均线叠加，鼠标滚轮缩放 + 拖动平移

---

### 4.3 SCREENERS 区域

**架构特点：** Python FastAPI 后端，每日定时批量扫描（cron-job.org 触发）+ 支持盘中按需触发。结果缓存于 Upstash Redis（TTL 48h）。

**股票池（统一标准）：** S&P500 + NASDAQ-100，去重，约 560-600 只。使用 `html.parser` 从 Wikipedia 实时抓取，失败时回退到硬编码备用列表。

#### 4.3.1 Bull Signal ✅

| 信号名称 | 实现状态 | 核心逻辑 |
|---------|---------|---------|
| 底背离 | ✅ 已上线 | 价格创新低但 MACD DIFF 或 RSI 不创新低，捕捉底部反转信号 |
| 底部放量 | ✅ 已上线 | 价格低位出现异常放量（≥ 20日均量 × 1.5x），配合技术形态判断主力建仓 |
| 正鸭嘴 | ✅ 已上线 | MACD DIFF 超速上穿 DEA，全程零轴上方，趋势加速初期强势信号 |

#### 4.3.2 Bear Signal ✅

| 信号名称 | 实现状态 | 核心逻辑 |
|---------|---------|---------|
| 顶背离 | ✅ 已上线 | 价格创新高但 MACD 或 RSI 不创新高，识别顶部做空/止盈信号 |
| 顶部放量 | ✅ 已上线 | 价格高位异常放量，判断主力出货信号 |
| 倒鸭嘴 | ✅ 已上线 | MACD DIFF 超速下穿 DEA，全程零轴下方，趋势加速下行空头信号 |

#### 4.3.3 Options Flow ✅

| 信号名称 | 实现状态 | 核心逻辑 |
|---------|---------|---------|
| 异常期权信号 | ✅ 已上线 | 扫描期权异常成交量（Vol ≥ 3×OI），5个模型评分，识别机构暗注方向 |

数据来源：Tradier API（`TRADIER_TOKEN` 环境变量）

#### 4.3.4 AI Strategy ✅

| 功能 | 实现状态 | 描述 |
|------|---------|------|
| AI 综合策略 | ✅ 已上线 | claude-opus-4-6 分析 SPY/QQQ/VIX 与板块数据，生成市场环境判断、推荐筛选器组合与操盘策略简报，按需生成，结果缓存于 Redis |
| AI 自然语言筛选 | ✅ 已上线 | 用户输入描述（如"找低估值高成长的科技股"），Claude Haiku 转化为结构化筛选条件，从 Redis 缓存的基本面快照中过滤，返回最多 25 只匹配股票 |

**AI 自然语言筛选架构：**
- 基本面缓存：每日 16:30 PDT cron-job.org 触发刷新，抓取 ~560 只股票 yfinance 基本面数据存入 Redis（TTL 48h）
- 查询流程：读取缓存 → Claude Haiku 解析条件 → 过滤排序 → 返回结果（~2-3 秒）
- 可过滤字段：sector、industry、market_cap、PE/PB、revenue_growth、profit_margin、debt_to_equity、dividend_yield、roe 等

---

## 5. 技术架构

### 5.1 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | Next.js 16 (App Router) + React 19 | 静态导出（`output: "export"`），部署于 Cloudflare Pages |
| 图表库 | Canvas 自定义实现 | 支持 K线 + 指标叠加，鼠标滚轮缩放 + 拖动平移 |
| 样式 | Tailwind CSS v4 | CSS-first 配置（`@theme`），无 tailwind.config.ts |
| 后端框架 | Python FastAPI | 高性能异步 API，部署于 Render Starter |
| 缓存层 | Upstash Redis | Serverless Redis；screener 结果 + 基本面快照缓存，TTL 48h |
| 数据获取 | yfinance（后端）+ Yahoo Finance v8 API（前端代理） | 后端直接调用 yfinance；前端经 CF Worker 代理 |
| 任务调度 | cron-job.org | 每日工作日定时触发各 screener 扫描 + 基本面刷新 |
| AI 服务 | Anthropic Claude API | claude-opus-4-6（策略/评分），claude-haiku-4-5（NL 筛选解析） |
| 前端部署 | Cloudflare Pages | 自动从 GitHub main 分支部署；Pages Functions 处理 AI 评分 API |
| 后端部署 | Render Starter（$7/月） | 常驻运行，无冷启动 |
| 访问控制 | Cloudflare Zero Trust Access | Google OAuth，"Family Only" 邮件白名单策略 |
| API 代理 | Cloudflare Worker | `https://yahoo-proxy.hejintang.workers.dev/`，代理 Yahoo Finance API |

### 5.2 数据流

```
[用户浏览器]
    │
    ├─ Indicators (纯前端)
    │     └─ CF Worker Proxy ──→ Yahoo Finance v8 API
    │
    ├─ Stock Query AI 评分
    │     └─ Cloudflare Pages Function ──→ Claude API (claude-opus-4-6)
    │
    └─ Screeners (后端)
          ├─ 读取缓存 ──→ GET /api/screener/{type} ──→ Upstash Redis
          ├─ 按需触发 ──→ POST /api/screener/{type}/run ──→ BackgroundTasks
          │                    └─ 前端 5s 轮询状态直到完成
          └─ 定时缓存 ──→ cron-job.org 每日触发 → yfinance 批量扫描 → Redis
```

### 5.3 后端文件结构

```
backend/
  main.py              — FastAPI 入口，所有路由
  screener.py          — 底背离 (run_full_scan)
  screener_volume.py   — 底部放量 (run_volume_scan)
  screener_duck.py     — 正鸭嘴 (run_duck_scan)
  screener_top_div.py  — 顶背离
  screener_top_vol.py  — 顶部放量
  screener_inv_duck.py — 倒鸭嘴
  screener_options.py  — 异常期权信号 (Tradier API)
  screener_nl.py       — AI 自然语言筛选 (Claude Haiku)
  ai_strategy.py       — AI 综合策略 (claude-opus-4-6)
  redis_client.py      — Upstash Redis 封装
```

---

## 6. 部署运维

### 6.1 环境变量

| 位置 | 变量 | 说明 |
|------|------|------|
| Render | `UPSTASH_REDIS_REST_URL` | Redis 连接 |
| Render | `UPSTASH_REDIS_REST_TOKEN` | Redis 认证 |
| Render | `API_KEY` | 后端接口鉴权（`X-API-Key` header）|
| Render | `ANTHROPIC_API_KEY` | Claude API |
| Render | `TRADIER_TOKEN` | 期权数据 API |
| Cloudflare Pages | `NEXT_PUBLIC_BACKEND_URL` | Render 后端 URL（构建时烘入）|
| Cloudflare Pages | `NEXT_PUBLIC_SCAN_API_KEY` | 后端鉴权 key（构建时烘入）|
| Cloudflare Pages | `ANTHROPIC_API_KEY` | Stock Query AI 评分（Pages Function）|

### 6.2 cron-job.org 定时任务（工作日）

| 时间 (PDT) | 接口 | 说明 |
|-----------|------|------|
| 16:30 | POST /api/screener/run | 底背离 |
| 16:31 | POST /api/screener/volume/run | 底部放量 |
| 16:32 | POST /api/screener/duck/run | 正鸭嘴 |
| 16:33 | POST /api/screener/top-divergence/run | 顶背离 |
| 16:34 | POST /api/screener/top-volume/run | 顶部放量 |
| 16:35 | POST /api/screener/inverted-duck/run | 倒鸭嘴 |
| 16:36 | POST /api/screener/options/run | 异常期权信号 |
| 16:30 | POST /api/screener/nl/refresh-fundamentals | NL 基本面缓存刷新 |

所有 cron 请求需携带 `X-API-Key: <API_KEY>` header。

---

## 7. 非功能需求

| 需求 | 指标 |
|------|------|
| 用户系统 | Cloudflare Zero Trust Access（Google OAuth，家庭白名单）|
| 商业模式 | MVP 阶段家庭内部使用，预留付费订阅架构 |
| 市场覆盖 | 美股（S&P 500 + NASDAQ-100，约 560 只）|
| 响应速度 | Indicators 图表加载 < 2s；Screener 缓存结果 < 1s；NL 筛选 ~2-3s |
| 移动端 | 响应式设计，移动端可用（非优先）|

---

## 8. 功能完成状态

| 优先级 | 功能 | 状态 |
|--------|------|------|
| P0 | 网站框架（Next.js + 页面布局）| ✅ 已上线 |
| P0 | STOCK QUERY 基础展示 | ✅ 已上线 |
| P0 | Indicators 区域（3 个指标工具）| ✅ 已上线 |
| P1 | 综合技术指标图表（Canvas，缩放+拖动）| ✅ 已上线 |
| P1 | Bull/Bear Screeners（共 7 个，每日缓存）| ✅ 已上线 |
| P1 | 异常期权信号 Screener | ✅ 已上线 |
| P2 | AI 综合评分（Stock Query）| ✅ 已上线 |
| P2 | AI 市场解读 + 推荐策略 | ✅ 已上线 |
| P3 | AI 自然语言筛选 | ✅ 已上线 |

---

## 9. 文档历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-03-27 | 初始版本 |
| v0.2 | 2026-03-28 | 前端框架改为 Next.js；技术栈新增 Redis 缓存层 |
| v0.3 | 2026-03-29 | 确定后端部署方案：Render + Upstash Redis |
| v1.0 | 2026-04-05 | 全功能上线；更新实际技术栈、部署方案、已实现功能状态；删除过时待确认事项 |
