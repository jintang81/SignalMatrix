# SignalMatrix — 产品需求文档 (PRD)

**版本：** v0.1
**日期：** 2026-03-27
**状态：** 草稿

---

## 1. 产品概述

SignalMatrix 是一个面向美股个人散户投资者的智能股票筛选与技术分析平台。核心差异化在于：

- **Indicators**：纯前端技术指标工具集，无需后端，浏览器直接调用 Yahoo Finance API（经 Cloudflare Worker 代理）
- **Screeners**：基于预定义信号逻辑的 Bull/Bear 股票筛选器，结合 AI 推荐策略
- **AI 全面融合**：AI 评分、自然语言筛选、市场解读三位一体

---

## 2. 目标用户

美股个人散户投资者，希望通过技术信号和量化筛选找到交易机会，无需专业金融背景。

---

## 3. 页面布局与信息架构

```
┌─────────────────────────────────────────────────────┐
│  导航栏（Logo + 导航菜单）                             │
├─────────────────────────────────────────────────────┤
│  STOCK QUERY 工具（顶部常驻）                          │
│  输入股票代码 → 展示基本信息 + AI 综合评分              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  INDICATORS 区域（上 1/3）                            │
│  SuperTrend | 六彩神龙 | 顾比均线加强版 | 综合图表      │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  SCREENERS 区域（下 2/3）                             │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  🟢 Bull Signal（上半部分）           │  │
│  │  底背离 | 底部放量 | 正鸭嘴 | 异常期权信号       │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  🔴 Bear Signal（下半部分）           │  │
│  │  顶背离 | 顶部放量 | 倒鸭嘴                     │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  🤖 AI 推荐策略（底部）                         │  │
│  │  根据市场环境自动推荐最优 Bull/Bear 策略          │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 4. 功能模块详细需求

### 4.1 STOCK QUERY（顶部常驻工具）

**功能描述：** 输入美股代码，快速查看股票基本信息。

**需求来源：** 详细字段定义见后续上传的 skill 文件。

**核心要求：**
- 输入框支持股票代码搜索（自动补全）
- 展示基本面信息（公司名、行业、市值、PE/PB/EPS 等）
- 展示价格走势迷你图（1D/1W/1M/1Y）
- AI 综合评分：AI 输出该股票的 Buy/Hold/Sell 综合评级及理由摘要
- 展示最新相关新闻与市场情绪分析

---

### 4.2 INDICATORS 区域

**架构特点：** 纯前端工具，所有数据通过 Cloudflare Worker 代理调用 Yahoo Finance API，无需后端。

**现有工具（Skill 文件待上传）：**
1. **SuperTrend** — 趋势跟踪指标
2. **六彩神龙** — 自定义多色均线系统
3. **顾比均线加强版（GMMA+）** — 多均线组合系统

**新增工具：综合技术指标图表**

| 需求项 | 描述 |
|--------|------|
| 多指标叠加 | 用户可选择任意组合：K线 + MACD + RSI + KDJ + 布林带 + SuperTrend + 六彩神龙 + 顾比均线 |
| 时间轴交互 | 鼠标滚轮缩放时间轴（类 TradingView），支持拖动平移 |
| 时间周期 | 支持切换 1D / 1W / 1M / 3M / 1Y |
| 指标参数 | 每个指标允许自定义参数（如 RSI 周期、布林带标准差等） |
| 图表库 | 推荐使用 lightweight-charts（TradingView 开源库）|

---

### 4.3 SCREENERS 区域

**架构特点：** 需要后端，每日定时批量扫描 + 支持实时按需触发。

#### 4.3.1 Bull Signal (Skill 文件待上传)

| 信号名称 | 逻辑描述 |
|---------|---------|
| 底背离 | 价格创新低但技术指标（MACD/RSI）未创新低，预示反转 |
| 底部放量 | 在价格底部区域出现显著高于均量的成交量 |
| 正鸭嘴 | 短期均线向上发散，形成"鸭嘴"开口形态（具体逻辑待 skill 文件定义） |
| 异常期权信号 | 检测到异常的看涨期权成交量或大额买入，暗示机构布局 |

#### 4.3.2 Bear Signal (Skill 文件待上传)

| 信号名称 | 逻辑描述 |
|---------|---------|
| 顶背离 | 价格创新高但技术指标未创新高，预示下跌 |
| 顶部放量 | 在价格顶部区域出现异常高成交量（出货信号） |
| 倒鸭嘴 | 短期均线向下发散，形成倒置"鸭嘴"形态 |

#### 4.3.3 AI 推荐策略

| 需求项 | 描述 |
|--------|------|
| 市场环境感知 | AI 分析当前大盘（$SPY/$QQQ）趋势、VIX 恐慌指数、板块轮动等 |
| 策略推荐 | AI 推荐当前市场环境下最有效的 Bull 或 Bear Screener 组合 |
| 推荐理由 | 附带简短文字解释，说明为何推荐该策略 |
| 更新频率 | 每日开盘前自动更新 |

**可扩展性要求：** Screener 模块需设计为插件式架构，每个 Screener 为独立模块，可随时新增而不影响现有功能。

---

### 4.4 AI 功能模块

全站 AI 功能基于 Claude API（Anthropic）实现，分三层：

| 功能 | 触发位置 | 描述 |
|------|---------|------|
| **AI 综合评分** | Stock Query | 对单只股票给出 Buy/Hold/Sell 评级，0-100 分，附摘要 |
| **AI 自然语言筛选** | Screeners 区域顶部 | 用户输入描述（如"找低估值高成长的科技股"），AI 转化为具体筛选条件 |
| **AI 市场解读** | AI 推荐策略模块 | 分析市场环境，推荐最优策略，生成文字解读 |

**AI 调用策略：** AI 调用需采用缓存与频率控制策略：
- Stock Query AI 评分结果缓存（如 1 小时）
- 市场解读每日生成一次

---

## 5. 技术架构

### 5.1 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | Next.js (React) | SSR/SSG，SEO 友好，App Router |
| 图表库 | lightweight-charts | TradingView 开源库，性能优异 |
| 样式 | Tailwind CSS | 快速构建响应式界面 |
| 后端框架 | Python FastAPI | 高性能异步 API，适合数据处理 |
| 缓存层 | Upstash Redis | Serverless Redis，免费层 10k 命令/天、256MB；Screener 结果缓存 + API 响应缓存 |
| 数据库 | SQLite / PostgreSQL | 存储每日扫描结果持久化 |
| 任务调度 | Render Cron Job | 每日定时触发全量扫描，结果写入 Upstash Redis |
| AI 服务 | Anthropic Claude API | 所有 AI 功能统一调用 |
| 部署 | Cloudflare Pages（前端）+ Workers（代理） | 无服务器，全球 CDN |
| 后端部署 | **Render**（Web Service + Cron Job） | 免费层支持 FastAPI + 定时任务；Starter $7/月 可去除冷启动 |

> ⚠️ **架构说明：** Cloudflare Workers 原生不支持 Python，因此 Python 后端（Screener 计算引擎）独立部署在 **Render**。CF Workers 仅用于：① Yahoo Finance API 代理（已有：`https://yahoo-proxy.hejintang.workers.dev/`）；② 可选：前端请求转发。Redis 使用 **Upstash**（Serverless，与 Render 搭配，免费层足够自用）。

### 5.2 数据流

```
[用户浏览器]
    │
    ├─ Indicators (纯前端)
    │     └─ CF Worker Proxy ──→ Yahoo Finance API
    │
    └─ Screeners (需后端)
          ├─ 实时请求 ──→ Python FastAPI ──→ Yahoo Finance (批量)
          │                    └─ API 响应缓存 ──→ Redis (短 TTL)
          └─ 定时缓存 ──→ 每日收盘后自动扫描，结果写入 DB + Redis
                              └─ 第二天前端拉取 Redis 缓存（命中则跳过 DB）
```

### 5.3 Yahoo Finance API 代理

- 现有代理地址：`https://yahoo-proxy.hejintang.workers.dev/`
- Indicators 模块直接在浏览器端调用此代理
- Screeners Python 后端通过此代理或直接调用 `yfinance` Python 库拉取批量数据
- 所有市场数据访问应通过统一数据访问层（Data Gateway）进行封装，
  避免前端与后端直接依赖不同数据源导致不一致问题。

---

## 6. Screener 可扩展架构设计

每个 Screener 遵循统一接口规范：

```python
class BaseScreener:
    name: str           # 显示名称
    signal_type: str    # "bull" | "bear"
    description: str    # 信号描述

    def scan(self, tickers: list[str]) -> list[dict]:
        # 返回触发信号的股票列表
        # [{ticker, signal_strength, trigger_date, details}]
        ...
```

新增 Screener 只需继承 `BaseScreener` 并实现 `scan()` 方法，前端自动发现并渲染。

---

## 7. 非功能需求

| 需求 | 指标 |
|------|------|
| 用户系统 | 无，完全匿名使用 |
| 商业模式 | MVP 阶段全部免费，预留付费订阅架构 |
| 市场覆盖 | 美股（NYSE + NASDAQ，S&P 500 / Russell 2000 成分股） |
| 响应速度 | Indicators 图表加载 < 2s；Screener 缓存结果 < 1s |
| 移动端 | 响应式设计，移动端可用（非优先） |

---

## 8. MVP 开发优先级

| 优先级 | 功能 |
|--------|------|
| P0 | 网站框架（Next.js + 页面布局）|
| P0 | STOCK QUERY 基础展示 |
| P0 | Indicators 区域（集成已有 3 个 skill 工具）|
| P1 | 综合技术指标图表（多指标叠加 + 缩放）|
| P1 | Bull/Bear Screeners（预定义信号，每日缓存）|
| P2 | AI 综合评分（Stock Query 中）|
| P2 | AI 市场解读 + 推荐策略 |
| P3 | AI 自然语言筛选 |
| P3 | 实时 Screener 扫描 |

---

## 9. 待确认事项

- [ ] STOCK QUERY 具体字段：等待 skill 文件上传
- [ ] 正鸭嘴 / 倒鸭嘴指标的精确数学定义
- [ ] 异常期权信号的数据来源（Yahoo Finance 是否提供期权链数据？）
- [ ] AI 推荐策略的 prompt 设计与 Claude 模型版本选择
- [ ] Screener 扫描股票池范围（S&P 500？Russell 2000？全市场？）
- [x] Python 后端部署平台：**Render（Web Service + Cron Job）+ Upstash Redis**
  - 定时扫描（收盘后）：Render Cron Job 触发全量筛选，结果写入 Upstash Redis
  - 盘中按需触发：`POST /api/screener/run`（异步 BackgroundTasks）+ 前端轮询
  - 单股实时查询：`GET /api/screener/ticker/{symbol}`（同步，~3 秒）
  - 升级路径：Render Starter $7/月 可去除冷启动

---

## 10. 文档历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-03-27 | 初始版本，基于需求访谈创建 |
| v0.2 | 2026-03-28 | 前端框架改为 Next.js (React)；技术栈新增 Redis 缓存层 |
| v0.3 | 2026-03-29 | 确定后端部署方案：Render（Web Service + Cron Job）+ Upstash Redis |
