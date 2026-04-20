import {
  LEVERAGE_MAP,
  MACRO_EVENTS,
  PARENT_EARNINGS_MAP,
  PARENT_MAP,
} from "./constants";
import {
  calcATR,
  calcHV,
  calcIVRank,
  calcRSI,
  calcSMA,
  calcTrendStrength,
  estimateGreeks,
  fmt,
  fmtPct,
  fmtSignedPct,
  todayStr,
} from "./math";
import type {
  AnnualEPS,
  ChartData,
  EarningsInfo,
  EntryMode,
  Gate0Result,
  Gate1Result,
  Gate2Result,
  Gate3Result,
  Gate4Result,
  Gate5Result,
  PutContract,
  Reflection,
  ScoreBreakdown,
  ValuationData,
} from "./types";

// ─── Gate 0: Valuation ────────────────────────────────────────────────────

function calcHistoricalPEMedian(
  annualEPS: AnnualEPS[],
  priceData: ChartData
): {
  historicalPEs: { date: string; price: number; eps: number; pe: number }[];
  median: number;
  threshold13x: number;
  sampleSize: number;
} | null {
  if (!annualEPS?.length || !priceData?.timestamps?.length) return null;
  const historicalPEs: { date: string; price: number; eps: number; pe: number }[] = [];
  for (const row of annualEPS) {
    if (row.eps <= 0) continue;
    const targetTs = new Date(row.date).getTime() / 1000;
    let closestIdx = -1, minDiff = Infinity;
    for (let i = 0; i < priceData.timestamps.length; i++) {
      const diff = Math.abs(priceData.timestamps[i] - targetTs);
      if (diff < minDiff) { minDiff = diff; closestIdx = i; }
    }
    if (closestIdx >= 0 && minDiff <= 45 * 86400) {
      const priceAtYearEnd = priceData.closes[closestIdx];
      const pe = priceAtYearEnd / row.eps;
      if (pe > 0 && pe < 500) {
        historicalPEs.push({ date: row.date, price: priceAtYearEnd, eps: row.eps, pe });
      }
    }
  }
  if (historicalPEs.length === 0) return null;
  const sorted = [...historicalPEs].map((h) => h.pe).sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  return { historicalPEs, median, threshold13x: median * 1.3, sampleSize: historicalPEs.length };
}

export function runGate0(
  valuation: ValuationData | null,
  parentData: ChartData
): Gate0Result {
  const empty: Gate0Result = {
    status: "unknown",
    message: "估值数据不可用（可能是ETF指数或未上市公司）",
    canEvaluate: false,
  };
  if (!valuation?.ok) return empty;
  const currentPE = valuation.forward_pe || valuation.trailing_pe;
  const peType: "forward" | "trailing" = (valuation.forward_pe != null && valuation.forward_pe > 0)
    ? "forward" : "trailing";
  if (currentPE == null || currentPE <= 0) {
    return { ...empty, message: "当前 P/E 不可用（可能是亏损公司）" };
  }
  const hist = calcHistoricalPEMedian(valuation.annual_eps, parentData);
  if (!hist || hist.sampleSize < 2) {
    return {
      status: "unknown",
      currentPE,
      peType,
      message: `样本不足（仅 ${hist?.sampleSize || 0} 年历史P/E），无法判断估值水位`,
      canEvaluate: false,
    };
  }
  const ratio = currentPE / hist.median;
  let status: "green" | "yellow" | "red", message: string;
  if (currentPE <= hist.median) {
    status = "green";
    message = `当前 P/E (${currentPE.toFixed(1)}) 低于5年中位数 (${hist.median.toFixed(1)})，估值便宜，符合"好公司股价低位时才卖 put"原则。`;
  } else if (currentPE <= hist.threshold13x) {
    status = "yellow";
    message = `当前 P/E (${currentPE.toFixed(1)}) 在中位数 (${hist.median.toFixed(1)}) 与 1.3× (${hist.threshold13x.toFixed(1)}) 之间，估值偏贵但可接受，建议适当选更远 OTM。`;
  } else {
    status = "red";
    message = `当前 P/E (${currentPE.toFixed(1)}) 超过5年中位数的1.3倍 (${hist.threshold13x.toFixed(1)})，"估值过高时不要卖 put"——并非开仓好时机。`;
  }
  return {
    status, message, canEvaluate: true,
    currentPE, peType, medianPE: hist.median, threshold13x: hist.threshold13x,
    ratio, sampleSize: hist.sampleSize,
    historicalPEs: hist.historicalPEs,
  };
}

// ─── Gate 1: Market Environment ───────────────────────────────────────────

export function runGate1(params: {
  atmIV: number | null;
  closes: number[];
  vixCur: number | null;
  vixPrev: number | null;
}): Gate1Result {
  const { atmIV, closes, vixCur, vixPrev } = params;
  const hv = calcHV(closes, 20);
  const ivHv = atmIV && hv ? atmIV / hv : null;
  const ivr = atmIV ? calcIVRank(atmIV, closes) : null;
  const rsi = calcRSI(closes, 14);
  const vixDayChg = vixCur && vixPrev ? (vixCur - vixPrev) / vixPrev : null;

  const items = [
    {
      name: "IV（隐含波动率）",
      rule: "≥ 40%",
      value: fmtPct(atmIV, 1),
      pass: atmIV != null && atmIV >= 0.4,
      critical: true,
      note: atmIV != null && atmIV > 1.5
        ? `⚠️ IV 极端偏高（>${fmtPct(1.5, 0)}），权利金丰厚但波动性极大，建议缩小仓位`
        : undefined,
    },
    {
      name: "IV / HV 比值",
      rule: "≥ 1.0（优: ≥ 1.2）",
      value: ivHv != null ? ivHv.toFixed(3) : "–",
      pass: ivHv != null && ivHv >= 1.0,
      critical: false,
      note: ivHv != null && ivHv < 1.0
        ? "卖方无溢价优势，第一关保底加宽1.5%"
        : undefined,
    },
    {
      name: "IV Rank",
      rule: "≥ 30%",
      value: ivr != null ? fmt(ivr, 0) + "%" : "–",
      pass: ivr != null && ivr >= 30,
      critical: true,
    },
    {
      name: "VIX 绝对值",
      rule: "< 35",
      value: fmt(vixCur, 2),
      pass: vixCur != null && vixCur < 35,
      critical: true,
    },
    {
      name: "VIX 当日涨幅",
      rule: "< 20%",
      value: fmtSignedPct(vixDayChg, 1),
      pass: vixDayChg != null && vixDayChg < 0.2,
      critical: true,
    },
    {
      name: "RSI (14)",
      rule: "≤ 75",
      value: fmt(rsi, 1),
      pass: rsi != null && rsi <= 75,
      critical: true,
    },
  ];

  const criticalFails = items.filter((it) => it.critical && !it.pass);
  return {
    pass: criticalFails.length === 0,
    passCount: items.filter((it) => it.pass).length,
    totalCount: items.length,
    items,
    ivHvExtraOTM: ivHv != null && ivHv < 1.0 ? 1.5 : 0,
    failedNames: criticalFails.map((it) => it.name),
    hv,
    ivHv,
    ivr: ivr ?? null,
    rsi: rsi ?? null,
    vixDayChg,
  };
}

// ─── Gate 2: Event Calendar ───────────────────────────────────────────────

export function runGate2(params: {
  ticker: string;
  parentTicker: string;
  expDateStr: string;
  earnings: EarningsInfo[];
}): Gate2Result {
  const { ticker, parentTicker, expDateStr, earnings } = params;
  const today = todayStr();
  const earningsWatch = PARENT_EARNINGS_MAP[parentTicker] || [parentTicker];

  const earningsInWindow = earnings.filter(
    (e) => earningsWatch.includes(e.ticker) && e.date >= today && e.date <= expDateStr
  );

  // Blockers (today only)
  const blockers = [];
  const blockerEarnings = earnings.filter((e) => {
    if (!["NVDA", parentTicker].includes(e.ticker)) return false;
    const diff = Math.abs(
      (new Date(e.date).getTime() - new Date(today).getTime()) / 86400000
    );
    return diff <= 1;
  });
  for (const e of blockerEarnings) {
    const diff = Math.round(
      (new Date(e.date).getTime() - new Date(today).getTime()) / 86400000
    );
    const when = diff === 0 ? "今日" : diff === 1 ? "明日" : "昨日";
    blockers.push({ type: "earnings", ticker: e.ticker, date: e.date, msg: `${e.ticker} 财报${when} — ±1日禁建仓` });
  }
  const todayMacro = MACRO_EVENTS.filter(
    (ev) => ev.date === today && ["cpi", "pce", "nfp"].includes(ev.type)
  );
  for (const ev of todayMacro) {
    blockers.push({ type: ev.type, date: ev.date, msg: `${ev.label} 今日发布 — 仅今日禁建仓` });
  }

  // OTM boost events (whole window)
  const details = [];
  let maxBoost = 0;
  const mag7 = ["AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "NVDA"];
  for (const e of earningsInWindow) {
    if (e.ticker === "NVDA" || e.ticker === parentTicker || mag7.includes(e.ticker)) {
      details.push({ label: `${e.ticker} 财报`, boost: 2.0, date: e.date, type: "earn" });
      maxBoost = Math.max(maxBoost, 2.0);
    }
  }
  const macroWindow = MACRO_EVENTS.filter(
    (ev) => ev.date >= today && ev.date <= expDateStr
  );
  for (const ev of macroWindow) {
    if (ev.type === "fomc") {
      details.push({ label: ev.label, boost: 2.0, date: ev.date, type: "fomc" });
      maxBoost = Math.max(maxBoost, 2.0);
    } else if (ev.type === "tariff") {
      details.push({ label: ev.label, boost: 3.0, date: ev.date, type: "fomc" });
      maxBoost = Math.max(maxBoost, 3.0);
    }
  }

  const dateGroups: Record<string, typeof details> = {};
  for (const d of details) {
    (dateGroups[d.date] = dateGroups[d.date] || []).push(d);
  }
  const resonanceDates = Object.entries(dateGroups)
    .filter(([, evs]) => evs.length >= 3)
    .map(([date, evs]) => ({ date, count: evs.length, events: evs }));

  return {
    totalOTM: Math.min(maxBoost, 4.0),
    details,
    blockers,
    resonanceDates,
    hasBlocker: blockers.length > 0,
    eventCount: details.length + blockers.length,
  };
}

// ─── Gate 3: Contract Selection ───────────────────────────────────────────

export function runGate3(params: {
  ticker: string;
  etfData: ChartData;
  puts: PutContract[];
  currentPrice: number;
  entryMode: EntryMode;
  gate1: Gate1Result;
  gate2: Gate2Result;
  parentPrice: number;
  parentMA200: number;
  dte: number;
  expDateStr: string;
}): Gate3Result {
  const { etfData, puts, currentPrice, entryMode, gate1, gate2, parentPrice, parentMA200, dte } = params;
  const { closes, highs, lows } = etfData;
  const ticker = params.ticker;

  const atr = calcATR(highs, lows, closes, 14);
  const atrPct = atr != null && currentPrice ? atr / currentPrice : null;
  const multiplier = { strong: 1.5, neutral: 2.0, cautious: 2.5 }[entryMode];
  const dteScale = Math.sqrt(dte / 30);
  const rawBase = atrPct != null ? atrPct * multiplier * dteScale : 0.07;
  const baseOTM = Math.max(0.05, Math.min(0.15, rawBase));

  const finalOTMLow = baseOTM + gate2.totalOTM / 100 + gate1.ivHvExtraOTM / 100;
  const finalOTMHigh = finalOTMLow + 0.01;
  const targetHighStrike = currentPrice * (1 - finalOTMLow);
  const targetLowStrike = currentPrice * (1 - finalOTMHigh);

  const parentMA200DistPct = parentPrice > 0 ? (parentPrice - parentMA200) / parentPrice : 0;
  const lev = Math.abs(LEVERAGE_MAP[ticker] || 1);
  const estETFAtParentMA200 = currentPrice * (1 - lev * parentMA200DistPct);

  const candidates: PutContract[] = puts
    .filter((p) => p.strike < currentPrice)
    .map((p) => {
      const otmPct = (currentPrice - p.strike) / currentPrice;
      const bid = p.bid != null ? +p.bid : null;
      const ask = p.ask != null ? +p.ask : null;
      const mid =
        bid != null && ask != null && bid > 0 && ask > 0
          ? (bid + ask) / 2
          : p.last != null
          ? +p.last
          : 0;
      const premium = mid * 100;
      const cashSecured = p.strike * 100;
      const totalROI = cashSecured > 0 ? premium / cashSecured : 0;
      const annualROI = dte > 0 ? (totalROI / dte) * 365 : 0;
      const iv = p.iv != null ? +p.iv : null;
      let greeks = p.greeks;
      if (!greeks && iv) {
        greeks = estimateGreeks(currentPrice, p.strike, dte / 365, 0.045, iv, "put");
      }
      const costBasis = p.strike - mid;
      const strikeToLRSDist =
        p.strike > 0 ? (p.strike - estETFAtParentMA200) / p.strike : 0;
      // Treat bid=0 / ask=0 same as null: no active market, spread is meaningless
      const bidAskSpread = bid != null && bid > 0 && ask != null && ask > 0 ? ask - bid : null;
      const bidAskSpreadPct = bidAskSpread != null && mid > 0 ? bidAskSpread / mid : null;
      const openInterest = +(p.open_interest ?? 0);
      return {
        ...p,
        strike: +p.strike,
        otmPct,
        mid,
        bid,
        ask,
        premium,
        cashSecured,
        totalROI,
        annualROI,
        iv,
        greeks,
        costBasis,
        strikeToLRSDist,
        bidAskSpread,
        bidAskSpreadPct,
        volume: +p.volume || 0,
        openInterest,
      };
    })
    .sort((a, b) => (b.strike ?? 0) - (a.strike ?? 0));

  for (const c of candidates) {
    const inRange =
      (c.strike ?? 0) >= targetLowStrike && (c.strike ?? 0) <= targetHighStrike;
    const deltaOk =
      c.greeks != null &&
      c.greeks.delta != null &&
      Math.abs(c.greeks.delta) >= 0.15 &&
      Math.abs(c.greeks.delta) <= 0.35;
    const gammaOk =
      c.greeks != null && c.greeks.gamma != null && c.greeks.gamma < 0.08;
    const thetaOk =
      c.greeks != null && c.greeks.theta != null && Math.abs(c.greeks.theta) >= 0.03;
    const annualOk = (c.annualROI ?? 0) >= 0.12;
    // bidAskSpreadPct threshold: 0.40 (40%) — OTM puts on leveraged ETFs
    // routinely have 20-40% bid-ask spread; 10% was too tight.
    const liquidityOk =
      (c.openInterest ?? 0) >= 100 &&
      (c.bidAskSpreadPct == null || c.bidAskSpreadPct < 0.4);
    const lrsSafe = (c.strikeToLRSDist ?? 0) > 0.03;
    c.checks = { inRange, deltaOk, gammaOk, thetaOk, annualOk, liquidityOk, lrsSafe };
    c.qualifyCount = Object.values(c.checks).filter(Boolean).length;
  }

  // Debug: log in-range candidates to console so we can see real OI / spread values
  const inRangeCands = candidates.filter(c => c.checks?.inRange);
  if (inRangeCands.length) {
    console.log(`[G3] ${params.ticker} in-range candidates (${inRangeCands.length}):`,
      inRangeCands.map(c => ({
        strike: c.strike, OI: c.openInterest, bid: c.bid, ask: c.ask,
        mid: c.mid?.toFixed(2), spreadPct: c.bidAskSpreadPct?.toFixed(3),
        liquidityOk: c.checks?.liquidityOk,
      }))
    );
  } else {
    console.log(`[G3] ${params.ticker} NO in-range candidates. targetRange: $${params.expDateStr} | $${targetLowStrike.toFixed(2)}-$${targetHighStrike.toFixed(2)}`);
  }
  const lrsSafeOnly = candidates.filter((c) => c.checks?.lrsSafe);
  const qualified = lrsSafeOnly.filter((c) => (c.qualifyCount ?? 0) >= 6);
  const bestCandidate =
    qualified.sort(
      (a, b) =>
        (b.qualifyCount ?? 0) - (a.qualifyCount ?? 0) ||
        (b.annualROI ?? 0) - (a.annualROI ?? 0)
    )[0] || null;

  return {
    atr,
    atrPct,
    baseOTM,
    multiplier,
    dteScale,
    finalOTMLow,
    finalOTMHigh,
    targetLowStrike,
    targetHighStrike,
    candidates,
    bestCandidate,
    parentMA200DistPct,
    estETFAtParentMA200,
  };
}

// ─── Gate 4: Execution ────────────────────────────────────────────────────

export function runGate4(params: {
  contract: PutContract | null;
  parentTicker: string;
  parentPrice: number;
  parentMA200: number;
  cash: number;
  dte: number;
}): Gate4Result | null {
  const { contract, parentTicker, parentPrice, parentMA200, cash, dte } = params;
  if (!contract) return null;
  const margin = (contract.strike ?? 0) * 100;
  const contractsByCash = Math.floor(cash / margin);
  const parentMA200DistPct = parentPrice > 0 ? (parentPrice - parentMA200) / parentPrice : 0;
  const limitPrice = contract.mid ?? 0;
  dte; // referenced for display

  return {
    items: [
      { name: "下单时间", rule: "周一 09:45 - 15:30", value: "开盘后执行", pass: true },
      { name: "合约方向", rule: "SELL PUT", value: "Sell Put", pass: true },
      {
        name: "合约张数",
        rule: `可用现金 ÷ 保证金`,
        value: `${contractsByCash}张  (最多)`,
        pass: contractsByCash >= 1,
      },
      { name: "单张保证金", rule: `strike × 100`, value: `$${margin.toFixed(0)}`, pass: true },
      {
        name: "最大亏损",
        rule: `strike × 100 - premium`,
        value: `$${(margin - (contract.premium ?? 0)).toFixed(0)}`,
        pass: true,
      },
      {
        name: "父资产实时位置",
        rule: `${parentTicker} > MA200`,
        value: `距离 ${fmtSignedPct(parentMA200DistPct, 1)}`,
        pass: parentMA200DistPct > 0,
      },
      { name: "限价委托价格", rule: "Bid-Ask 中间价", value: `$${limitPrice.toFixed(2)} (每股)`, pass: true },
    ],
    margin,
    contractsByCash,
    limitPrice,
    parentMA200DistPct,
  };
}

// ─── Gate 5: Position Management ─────────────────────────────────────────

export function runGate5(params: {
  contract: PutContract | null;
  parentTicker: string;
}): Gate5Result | null {
  const { contract, parentTicker } = params;
  if (!contract) return null;
  const premium = contract.mid ?? 0;
  const profitClosePrice = premium * 0.5;
  const stopLossPrice = premium * 3.0;

  return {
    rules: [
      {
        num: "规则一",
        title: "获利 50% 平仓 (GTC)",
        trigger: `合约市价 ≤ $${profitClosePrice.toFixed(2)}`,
        action: "开仓时同步挂 GTC 买入平仓单",
        type: "ok",
      },
      {
        num: "规则二",
        title: "亏损 2x 止损 (GTC)",
        trigger: `合约市价 ≥ $${stopLossPrice.toFixed(2)}（权利金×300%）`,
        action: "开仓时同步挂 GTC 买入平仓单",
        type: "warn",
      },
      {
        num: "规则三",
        title: `${parentTicker} 跌破 MA200`,
        trigger: `${parentTicker} 日线收盘 < MA200`,
        action: "次日开盘买入平仓（手动监控，每天收盘后查一次）",
        type: "bad",
      },
    ],
    profitClosePrice,
    stopLossPrice,
  };
}

// ─── Risk Reflections ─────────────────────────────────────────────────────

export function runRiskReflections(params: {
  ticker: string;
  etfData: ChartData;
  parentData: ChartData;
  gate2: Gate2Result;
  gate3: Gate3Result;
  parentMA200Dist: number;
}): Reflection[] {
  const { ticker, parentData, gate2, gate3, parentMA200Dist } = params;
  const reflections: Reflection[] = [];
  const parentTrend = calcTrendStrength(parentData.closes, 20);
  const lev = Math.abs(LEVERAGE_MAP[ticker] || 1);

  if (lev >= 2 && parentTrend != null && parentTrend < 0.25) {
    reflections.push({
      level: "warn",
      title: "⚠️ 波动率衰减（Volatility Decay）风险",
      body: `${PARENT_MAP[ticker] || ticker} 近20日趋势强度仅 ${fmt(parentTrend * 100, 0)}%（横盘震荡）。${ticker} 是${lev}倍杠杆ETF，即使母资产横盘，每日重置机制也会让净值缓慢磨损。`,
    });
  }
  if (gate2.resonanceDates?.length) {
    const d = gate2.resonanceDates[0];
    reflections.push({
      level: "bad",
      title: "🚨 事件共振风险",
      body: `${d.date} 同日叠加 ${d.count} 个高风险事件：${d.events.map((e) => e.label).join("、")}。"共鸣放大效应"可能低估冲击，建议当日提前平仓或总退出。`,
    });
  }
  if (parentMA200Dist < 0.05) {
    reflections.push({
      level: "bad",
      title: "🚨 Gap Down 触底风险",
      body: `${PARENT_MAP[ticker] || ticker} 距MA200仅 ${fmt(parentMA200Dist * 100, 1)}%。规则三的触发条件是"日线收盘跌破MA200后次日平仓"，若遇到隔夜大消息，次日开盘可能直接低开3-5%，平仓执行价会远差于预期。`,
    });
  }
  if (gate3.bestCandidate) {
    const c = gate3.bestCandidate;
    if ((c.strikeToLRSDist ?? 0) <= 0) {
      reflections.push({
        level: "bad",
        title: "🚨 行权价已低于 LRS 强平触发价以下",
        body: `行权价 $${(c.strike ?? 0).toFixed(2)} < LRS估计触发价 $${gate3.estETFAtParentMA200.toFixed(2)}。被行权即触发强平，权利金收入大概率会被磨平甚至亏损。不建议开此仓。`,
      });
    } else if ((c.strikeToLRSDist ?? 0) < 0.05) {
      reflections.push({
        level: "warn",
        title: "⚠️ 行权价贴近 LRS 强平触发区",
        body: `最佳推荐合约行权价 $${(c.strike ?? 0).toFixed(2)}，LRS估计触发价 $${gate3.estETFAtParentMA200.toFixed(2)}，缓冲仅 ${fmtPct(c.strikeToLRSDist, 1)}。一旦被行权，可能陷入"来了货就被强制卖出"的两难。`,
      });
    }
  }
  if (gate3.atrPct == null) {
    reflections.push({
      level: "info",
      title: "ℹ️ 基础 OTM 计算缺失",
      body: "无法基于 ATR 计算基础OTM，使用了默认值7%。建议等待数据完整后再评估。",
    });
  }
  return reflections;
}

// ─── Composite scoring ────────────────────────────────────────────────────

export function calcCompositeScore(params: {
  gate1: Gate1Result;
  gate2: Gate2Result;
  gate3: Gate3Result;
  reflections: Reflection[];
}): { score: number; breakdown: ScoreBreakdown[]; noCandidate: boolean } {
  const { gate1, gate2, gate3, reflections } = params;
  let score = 0;
  const breakdown: ScoreBreakdown[] = [];

  const g1Score = gate1.pass ? 40 : 0;
  score += g1Score;
  breakdown.push({ name: "第一关 (市场环境)", max: 40, val: g1Score });

  let g2Score = 20;
  for (const b of gate2.blockers) {
    g2Score -= b.type === "earnings" ? 10 : 2;
  }
  g2Score -= gate2.details.length * 2;
  g2Score = Math.max(0, g2Score);
  score += g2Score;
  breakdown.push({ name: "第二关 (事件)", max: 20, val: g2Score });

  let g3Score = 0;
  if (gate3.bestCandidate) {
    g3Score = Math.round((25 * (gate3.bestCandidate.qualifyCount ?? 0)) / 7);
  }
  score += g3Score;
  breakdown.push({ name: "第三关 (合约)", max: 25, val: g3Score });

  let riskDeduct = 0;
  for (const r of reflections) {
    if (r.level === "bad") riskDeduct += 5;
    else if (r.level === "warn") riskDeduct += 2;
  }
  riskDeduct = Math.min(15, riskDeduct);
  const riskScore = 15 - riskDeduct;
  score += riskScore;
  breakdown.push({ name: "风险分析 (15)", max: 15, val: riskScore });

  const noCandidate = !gate3.bestCandidate;
  if (noCandidate) {
    score = Math.min(score, 35);
    breakdown.push({ name: "⚠️ 无合格候选合约（总分上限35）", max: 0 as number | string, val: "✗" });
  }

  return { score: Math.round(score), breakdown, noCandidate };
}

// ─── Score color helper ───────────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 75) return "#00e676";
  if (score >= 55) return "#f0cc6e";
  if (score >= 40) return "#fbbf24";
  return "#ff1744";
}

// ─── VIX data extraction ──────────────────────────────────────────────────

export function getVixValues(
  vixData: ChartData | null
): { vixCur: number | null; vixPrev: number | null } {
  if (!vixData?.closes?.length) return { vixCur: null, vixPrev: null };
  const closes = vixData.closes;
  return {
    vixCur: closes[closes.length - 1] ?? null,
    vixPrev: closes[closes.length - 2] ?? null,
  };
}

// ─── Parent MA200 ─────────────────────────────────────────────────────────

export { calcSMA, calcTrendStrength };
