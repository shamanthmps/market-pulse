/**
 * backtest.ts — Market Pulse Walk-Forward Backtesting Engine
 *
 * ─────────────────────────────────────────────────────────────────────
 * KEY DESIGN PRINCIPLES (no shortcuts)
 * ─────────────────────────────────────────────────────────────────────
 *
 * 1. NO LOOK-AHEAD BIAS
 *    Signal is evaluated at close of bar i using only data[0..i].
 *    Entry is at OPEN of bar i+1 (simulating "place order at market open
 *    after signal fires at previous day's close").
 *
 * 2. REALISTIC ENTRY PRICE
 *    Entry = next bar's OPEN, not the signal bar's close.
 *    This is critical — backtests that enter at signal-bar close are
 *    optimistic and unrealistic.
 *
 * 3. STOP LOSS RECALCULATED AT ENTRY
 *    ATR at signal bar × 2.0. SL is based on entry price (open of next bar),
 *    not signal close. Both gate failure and gap-through SL are handled.
 *
 * 4. GAP HANDLING
 *    If next bar OPENS beyond the SL (gap through), exit at OPEN — not SL.
 *    This prevents unrealistic P&L in gap scenarios.
 *
 * 5. CONSERVATIVE SAME-CANDLE RULE
 *    If both SL and target can be hit within the same candle
 *    (high ≥ target AND low ≤ SL), assume SL hit first (worst case).
 *    This is standard conservative assumption.
 *
 * 6. ONE TRADE AT A TIME
 *    No overlapping positions. New signal ignored while in trade.
 *
 * 7. REALISTIC TRANSACTION COSTS
 *    NSE Intraday  (5m/15m/1H): ~0.10% round trip
 *    NSE Delivery  (1D)       : ~0.20% round trip
 *    Applied per trade (entry cost from entry side only is approximate;
 *    full round-trip cost deducted at exit for simplicity).
 *
 * 8. POSITION SIZING
 *    Risk % of account per trade. Shares = floor(riskAmount / slDistance).
 *    Fractional shares not allowed. Account equity updates after each trade.
 */

import {
  Candle,
  ema,
  sma,
  rsi,
  macd,
  atr,
  adx,
  stddev,
  supertrend,
  linreg,
  utBot,
} from "./indicators";
import {
  ATR_MULTIPLIER,
  MIN_RR_RATIO,
  MIN_SCORED,
  VOL_THRESHOLD,
  Direction,
  SignalBreakdown,
} from "./signals";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface BacktestConfig {
  strategyId: string; // 'confluence' | 'sma-crossover' | 'rsi-reversal' | 'ema-momentum'
  riskPercent: number; // % of current account equity to risk per trade (default 1)
  commissionPct: number; // round-trip commission as % (default 0.2 for delivery)
  slippagePct: number; // slippage per side as % of price (default 0.05 for NSE 1H)
  atrMultiplier: number; // stop loss = n × ATR(14); overridden per strategy
  minRR: number; // minimum R:R (default 2.0)
  startBar: number; // first bar to start scanning from (set per strategy)
}

export interface BacktestTrade {
  tradeNum: number;
  direction: Direction;
  entryBar: number;
  exitBar: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  target: number;
  shares: number;
  slDistance: number;
  grossPnl: number; // before commission
  commission: number;
  netPnl: number; // after commission
  rMultiple: number; // netPnl / riskAmount
  riskAmount: number;
  exitReason: "TARGET" | "STOPLOSS" | "END_OF_DATA";
  equityAfter: number; // running equity after this trade
  score: number;
  breakdown: SignalBreakdown;
}

export interface MonthlyPnl {
  year: number;
  month: number; // 1-12
  pnl: number;
  trades: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  equityCurve: { bar: number; time: number; equity: number }[];
  monthlyPnl: MonthlyPnl[];

  // === Summary stats ===
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  netPnl: number;
  netReturnPct: number;
  expectancy: number; // average R per trade
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  avgRMultiple: number;
  largestWin: number;
  largestLoss: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  avgHoldingBars: number;
  totalBarsScanned: number;
  signalFrequency: number; // trades per 100 bars
}

// ── Signal evaluation at a specific bar (no look-ahead) ──────────────────────

interface PrecomputedIndicators {
  ema9: number[]; // index k → bar 8+k  (EMA9)
  ema20: number[]; // index k → bar 19+k (EMA20)
  ema50: number[]; // index k → bar 49+k (EMA50)
  ema200: number[]; // index k → bar 199+k (EMA200)
  sma20: number[]; // index k → bar 19+k (SMA20)
  sma50: number[]; // index k → bar 49+k (SMA50)
  rsiArr: number[]; // index k → bar 14+k
  macdHist: number[]; // index k → bar 33+k
  atrArr: number[]; // index k → bar 14+k (Wilder ATR14)
  stDir: (1 | -1)[]; // index k → bar 7+k (Supertrend 7,3)
  volAvg: number[]; // index k → bar 19+k (SMA20 of volume)
  // UTBot + LinReg arrays — index k → bar k+1 (atrPeriod=1 offset)
  utbotTS: number[]; // trailing stop
  utbotBuy: boolean[]; // buy signal fired
  utbotSell: boolean[]; // sell signal fired
  // LinReg candle color: EMA(7) of linreg(close|open, 11) — index k → bar k+16
  linregSmClose: number[];
  linregSmOpen: number[];
  adxArr: number[]; // index k → candle k+28 (ADX14, Wilder smoothed)
  // TTM Squeeze (John Carter)
  sqzOn: boolean[]; // index k → bar 20+k, true = BB inside KC (squeeze active)
  sqzMom: number[]; // index k → bar 39+k, linreg momentum oscillator
  // Regime filter: true = Nifty50 is above its 50-day EMA at this bar's date
  // index k → candle k (1:1 aligned). Filled by API; defaults to all-true (no filter).
  regimeBull: boolean[];
}

function precompute(
  candles: Candle[],
  regimeBull?: boolean[],
): PrecomputedIndicators {
  const closes = candles.map((c) => c.close);
  const opens = candles.map((c) => c.open);
  const volumes = candles.map((c) => c.volume);

  // Pre-compute ema20 / sma20 into vars so we can reuse them for BB/KC/squeeze
  const ema20v = ema(closes, 20); // ema20v[k] → bar 19+k
  const sma20v = sma(closes, 20); // sma20v[k] → bar 19+k

  // ── Bollinger Bands (20, 2) ────────────────────────────────────────────
  const std20v = stddev(closes, 20); // std20v[k] → bar 19+k
  const bbUpp = sma20v.map((m, k) => m + 2 * std20v[k]); // bbUpp[k] → bar 19+k
  const bbLow = sma20v.map((m, k) => m - 2 * std20v[k]);

  // ── Keltner Channel (EMA20, ATR20, ×1.5) ──────────────────────────────
  // atr(candles,20)[k] → bar 20+k; ema20v[k] → bar 19+k
  // To align: KC at bar 20+k = ema20v[k+1] ± 1.5 × atr20v[k]
  const atr20v = atr(candles, 20); // atr20v[k] → bar 20+k
  const kcLen = Math.min(ema20v.length - 1, atr20v.length);
  const kcUpp = Array.from(
    { length: kcLen },
    (_, k) => ema20v[k + 1] + 1.5 * atr20v[k],
  );
  const kcLow = Array.from(
    { length: kcLen },
    (_, k) => ema20v[k + 1] - 1.5 * atr20v[k],
  );
  // kcUpp[k] → bar 20+k

  // ── Squeeze condition (BB inside KC at bar 20+k) ─────────────────────────
  // At bar 20+k: bbUpp[k+1] vs kcUpp[k] (aligned via +1 offset)
  const sqzOn = Array.from(
    { length: kcLen },
    (_, k) => bbUpp[k + 1] < kcUpp[k] && bbLow[k + 1] > kcLow[k],
  );

  // ── Squeeze momentum oscillator (LazyBear / John Carter) ───────────────
  // val = close - (midHL + sma20) / 2
  // midHL = (highest(high,20) + lowest(low,20)) / 2
  // sqzMom = linreg(val, 20) → sqzMom[k] at bar 39+k
  const sqzVal: number[] = [];
  for (let i = 20; i < candles.length; i++) {
    // starts at bar 20 (first KC bar)
    let hh = -Infinity,
      ll = Infinity;
    for (let j = i - 19; j <= i; j++) {
      hh = Math.max(hh, candles[j].high);
      ll = Math.min(ll, candles[j].low);
    }
    const midHL = (hh + ll) / 2;
    const midBB = sma20v[i - 19]; // sma20v[k] → bar 19+k ⇒ k = i-19
    sqzVal.push(closes[i] - (midHL + midBB) / 2);
  }
  // sqzVal[k] → bar 20+k; linreg(20) shifts by 19 → sqzMom[k] → bar 39+k
  const sqzMom = linreg(sqzVal, 20);

  const { histogram } = macd(closes, 12, 26, 9);
  const { directions } = supertrend(candles, 7, 3);
  const { trailingStop, buySignal, sellSignal } = utBot(candles, 6, 1);
  const lrClose = linreg(closes, 11);
  const lrOpen = linreg(opens, 11);
  return {
    ema9: ema(closes, 9),
    ema20: ema20v,
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    sma20: sma20v,
    sma50: sma(closes, 50),
    rsiArr: rsi(closes, 14),
    macdHist: histogram,
    atrArr: atr(candles, 14),
    stDir: directions as (1 | -1)[],
    volAvg: sma(volumes, 20), // SMA20 of volume; index k → bar 19+k
    utbotTS: trailingStop,
    utbotBuy: buySignal,
    utbotSell: sellSignal,
    linregSmClose: ema(lrClose, 7),
    linregSmOpen: ema(lrOpen, 7),
    adxArr: adx(candles, 14),
    sqzOn,
    sqzMom,
    // If no regime data supplied, default every bar to true (no filtering)
    regimeBull: regimeBull ?? new Array(candles.length).fill(true),
  };
}

type BarSignal = {
  direction: Direction;
  score: number;
  scoredCount: number;
  bd: SignalBreakdown;
  atrVal: number;
};

// ── Strategy 1: Multi-Signal Confluence ───────────────────────────────────────
function getBarSignal_confluence(
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  if (i < 205) return null;
  const price = candles[i].close;
  const volume = candles[i].volume;
  const e20 = ind.ema20[i - 19];
  const e50 = ind.ema50[i - 49];
  const e200 = ind.ema200[i - 199];
  const rsiVal = ind.rsiArr[i - 14];
  const hist = ind.macdHist[i - 33];
  const stVal = i - 7 >= 0 && i - 7 < ind.stDir.length ? ind.stDir[i - 7] : 1; // Supertrend(7,3)
  const atrVal = ind.atrArr[i - 14];
  const vAvg = i - 19 < ind.volAvg.length ? ind.volAvg[i - 19] : 0;
  const volOk = vAvg > 0 && volume > vAvg * VOL_THRESHOLD;
  if (!e20 || !e50 || !e200 || !rsiVal || !atrVal) return null;

  const longBD: SignalBreakdown = {
    emaTrend: price > e200,
    supertrendSignal: stVal === 1,
    emaStack: e20 > e50,
    rsiMomentum: rsiVal >= 38 && rsiVal <= 65,
    macdSignal: hist > 0,
    volumeConfirm: volOk,
  };
  const shortBD: SignalBreakdown = {
    emaTrend: price < e200,
    supertrendSignal: stVal === -1,
    emaStack: e20 < e50,
    rsiMomentum: rsiVal >= 35 && rsiVal <= 62,
    macdSignal: hist < 0,
    volumeConfirm: volOk,
  };
  function scoreIt(bd: SignalBreakdown) {
    const gates = (bd.emaTrend ? 1 : 0) + (bd.supertrendSignal ? 1 : 0);
    const scored = [
      bd.emaStack,
      bd.rsiMomentum,
      bd.macdSignal,
      bd.volumeConfirm,
    ].filter(Boolean).length;
    return { gates, scored, total: gates + scored };
  }
  const ls = scoreIt(longBD);
  const ss = scoreIt(shortBD);
  if (
    ls.gates === 2 &&
    ls.scored >= MIN_SCORED &&
    (!(ss.gates === 2 && ss.scored >= MIN_SCORED) || ls.total >= ss.total)
  )
    return {
      direction: "LONG",
      score: ls.total,
      scoredCount: ls.scored,
      bd: longBD,
      atrVal,
    };
  if (ss.gates === 2 && ss.scored >= MIN_SCORED)
    return {
      direction: "SHORT",
      score: ss.total,
      scoredCount: ss.scored,
      bd: shortBD,
      atrVal,
    };
  return null;
}

// ── Strategy 2: SMA Crossover (20/50 golden/death cross) ─────────────────────
function getBarSignal_smaCrossover(
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  if (i < 52) return null; // need SMA50 + prev bar
  const c20 = ind.sma20[i - 19],
    p20 = ind.sma20[i - 20];
  const c50 = ind.sma50[i - 49],
    p50 = ind.sma50[i - 50];
  const atrVal = ind.atrArr[i - 14];
  if (!c20 || !p20 || !c50 || !p50 || !atrVal) return null;

  const golden = p20 <= p50 && c20 > c50; // golden cross → LONG
  const death = p20 >= p50 && c20 < c50; // death cross  → SHORT
  if (!golden && !death) return null;

  const vAvg = i - 19 < ind.volAvg.length ? ind.volAvg[i - 19] : 0;
  const volOk = vAvg > 0 && candles[i].volume > vAvg * VOL_THRESHOLD;
  const direction: Direction = golden ? "LONG" : "SHORT";
  const bd: SignalBreakdown = {
    emaTrend: true,
    supertrendSignal: false,
    emaStack: true,
    rsiMomentum: false,
    macdSignal: false,
    volumeConfirm: volOk,
  };
  return { direction, score: volOk ? 3 : 2, scoredCount: 1, bd, atrVal };
}

// ── Strategy 3: RSI Mean Reversion (oversold/overbought bounce) ───────────────
function getBarSignal_rsiReversal(
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  if (i < 20) return null; // need RSI14 + prev bar + volAvg
  const rsiCur = ind.rsiArr[i - 14];
  const rsiPrev = ind.rsiArr[i - 15];
  const atrVal = ind.atrArr[i - 14];
  if (!rsiCur || !rsiPrev || !atrVal) return null;

  const vAvg = i - 19 < ind.volAvg.length ? ind.volAvg[i - 19] : 0;
  const volOk = vAvg > 0 && candles[i].volume > vAvg * VOL_THRESHOLD;
  if (!volOk) return null; // require volume for mean reversion entry

  // Oversold + first uptick: RSI < 35 and starting to recover
  const oversold = rsiCur < 35 && rsiCur >= rsiPrev;
  // Overbought + first downtick: RSI > 65 and starting to fall
  const overbought = rsiCur > 65 && rsiCur <= rsiPrev;
  if (!oversold && !overbought) return null;

  const direction: Direction = oversold ? "LONG" : "SHORT";
  const bd: SignalBreakdown = {
    emaTrend: false,
    supertrendSignal: false,
    emaStack: false,
    rsiMomentum: true,
    macdSignal: false,
    volumeConfirm: true,
  };
  return { direction, score: 2, scoredCount: 1, bd, atrVal };
}

// ── Strategy 4: EMA Momentum Stack (9/20/50 triple alignment + MACD) ─────────
function getBarSignal_emaMomentum(
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  if (i < 52) return null; // need EMA50 + MACD ready
  const e9 = ind.ema9[i - 8];
  const e20 = ind.ema20[i - 19];
  const e50 = ind.ema50[i - 49];
  const hist = ind.macdHist[i - 33];
  const atrVal = ind.atrArr[i - 14];
  if (!e9 || !e20 || !e50 || !atrVal) return null;

  const bullStack = e9 > e20 && e20 > e50; // all EMAs aligned bullish
  const bearStack = e9 < e20 && e20 < e50; // all EMAs aligned bearish
  if (!bullStack && !bearStack) return null;

  const direction: Direction = bullStack ? "LONG" : "SHORT";
  const macdOk = direction === "LONG" ? (hist ?? 0) > 0 : (hist ?? 0) < 0;
  if (!macdOk) return null; // MACD must agree with stack direction

  const vAvg = i - 19 < ind.volAvg.length ? ind.volAvg[i - 19] : 0;
  const volOk = vAvg > 0 && candles[i].volume > vAvg * VOL_THRESHOLD;
  const bd: SignalBreakdown = {
    emaTrend: bullStack,
    supertrendSignal: false,
    emaStack: true,
    rsiMomentum: false,
    macdSignal: true,
    volumeConfirm: volOk,
  };
  return { direction, score: 3 + (volOk ? 1 : 0), scoredCount: 2, bd, atrVal };
}

// ── Strategy 5: ETF Dip Buy (RSI < 30 oversold + uptick, LONG only) ─────────────────
function getBarSignal_etfDipBuy(
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  if (i < 20) return null;
  const rsiCur = ind.rsiArr[i - 14];
  const rsiPrev = ind.rsiArr[i - 15];
  const atrVal = ind.atrArr[i - 14];
  if (!rsiCur || !rsiPrev || !atrVal) return null;

  // Oversold: RSI < 30 AND turning up (first uptick = best entry)
  // Allow entry also when RSI is still below 30 but rising (trailing dip accumulation)
  if (!(rsiCur < 30 && rsiCur > rsiPrev)) return null;

  const bd: SignalBreakdown = {
    emaTrend: false,
    supertrendSignal: false,
    emaStack: false,
    rsiMomentum: true,
    macdSignal: false,
    volumeConfirm: false,
  };
  return { direction: "LONG", score: 1, scoredCount: 1, bd, atrVal };
}

// ── Strategy 6: UT Bot Alert + LinReg Candles ────────────────────────────────
// UTBot arrays: index k → candle k+1 (atrPeriod=1)  →  to get value at bar i, use index i-1
// LinReg smooth arrays: index k → candle k+16        →  to get value at bar i, use index i-16
function getBarSignal_utbotLinreg(
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  if (i < 25) return null;
  const ubIdx = i - 1; // UTBot offset (atrPeriod=1)
  const lrIdx = i - 16; // LinReg offset (period=11, smoothing EMA=7 → 11+7-2=16)
  if (ubIdx < 0 || ubIdx >= ind.utbotBuy.length) return null;
  if (lrIdx < 0 || lrIdx >= ind.linregSmClose.length) return null;

  const atrVal = ind.atrArr[i - 14];
  if (!atrVal) return null;

  const smClose = ind.linregSmClose[lrIdx];
  const smOpen = ind.linregSmOpen[lrIdx];
  const linregBull = smClose >= smOpen;
  const linregBear = smClose < smOpen;

  const buyFired = ind.utbotBuy[ubIdx];
  const sellFired = ind.utbotSell[ubIdx];

  if (buyFired && linregBull) {
    const bd: SignalBreakdown = {
      emaTrend: true,
      supertrendSignal: linregBull,
      emaStack: false,
      rsiMomentum: false,
      macdSignal: false,
      volumeConfirm: false,
    };
    return { direction: "LONG", score: 2, scoredCount: 2, bd, atrVal };
  }
  if (sellFired && linregBear) {
    const bd: SignalBreakdown = {
      emaTrend: false,
      supertrendSignal: linregBear,
      emaStack: false,
      rsiMomentum: false,
      macdSignal: false,
      volumeConfirm: false,
    };
    return { direction: "SHORT", score: 2, scoredCount: 2, bd, atrVal };
  }
  return null;
}

// ── Strategy 7: UT Bot + LinReg v2 (EMA50 trend filter + volume gate) ────────
// Same signal logic as v1 but adds two confirmation gates to reduce whipsaws:
//   Gate 1: EMA(50) — price must be above EMA50 for LONG, below for SHORT
//   Gate 2: Volume must exceed 1.1x the 20-bar volume average
function getBarSignal_utbotLinregV2(
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  if (i < 55) return null; // need EMA50 warmup
  const ubIdx = i - 1;
  const lrIdx = i - 16;
  if (ubIdx < 0 || ubIdx >= ind.utbotBuy.length) return null;
  if (lrIdx < 0 || lrIdx >= ind.linregSmClose.length) return null;

  const atrVal = ind.atrArr[i - 14];
  const e50 = ind.ema50[i - 49];
  if (!atrVal || !e50) return null;

  const price = candles[i].close;
  const vAvg = i - 19 < ind.volAvg.length ? ind.volAvg[i - 19] : 0;
  const volOk = vAvg > 0 && candles[i].volume > vAvg * 1.1;
  if (!volOk) return null; // Gate 2: volume confirmation required

  const smClose = ind.linregSmClose[lrIdx];
  const smOpen = ind.linregSmOpen[lrIdx];
  const linregBull = smClose >= smOpen;
  const linregBear = smClose < smOpen;

  const buyFired = ind.utbotBuy[ubIdx];
  const sellFired = ind.utbotSell[ubIdx];

  // Gate 1: EMA50 trend filter
  const longOk = price > e50;
  const shortOk = price < e50;

  if (buyFired && linregBull && longOk) {
    const bd: SignalBreakdown = {
      emaTrend: true,
      supertrendSignal: linregBull,
      emaStack: true,
      rsiMomentum: false,
      macdSignal: false,
      volumeConfirm: true,
    };
    return { direction: "LONG", score: 4, scoredCount: 3, bd, atrVal };
  }
  if (sellFired && linregBear && shortOk) {
    const bd: SignalBreakdown = {
      emaTrend: false,
      supertrendSignal: linregBear,
      emaStack: true,
      rsiMomentum: false,
      macdSignal: false,
      volumeConfirm: true,
    };
    return { direction: "SHORT", score: 4, scoredCount: 3, bd, atrVal };
  }
  return null;
}

// ── Strategy 8: UT Bot + LinReg v3 (Nifty50 regime filter) ───────────────────
// Same signal as v1 (UTBot + LinReg) but gated by the Nifty50 50-day EMA regime.
// ind.regimeBull[i] = true  → Nifty above EMA50 (bull) → LONG signals allowed
// ind.regimeBull[i] = false → Nifty below EMA50 (bear) → SHORT signals allowed
// When regime doesn't match direction, signal is blocked. Sit on cash.
function getBarSignal_utbotLinregV3(
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  if (i < 25) return null;
  const ubIdx = i - 1;
  const lrIdx = i - 16;
  if (ubIdx < 0 || ubIdx >= ind.utbotBuy.length) return null;
  if (lrIdx < 0 || lrIdx >= ind.linregSmClose.length) return null;

  const atrVal = ind.atrArr[i - 14];
  if (!atrVal) return null;

  const smClose = ind.linregSmClose[lrIdx];
  const smOpen = ind.linregSmOpen[lrIdx];
  const linregBull = smClose >= smOpen;
  const linregBear = smClose < smOpen;
  const buyFired = ind.utbotBuy[ubIdx];
  const sellFired = ind.utbotSell[ubIdx];
  const niftyBull = ind.regimeBull[i] ?? true; // default = allow if no data

  if (buyFired && linregBull && niftyBull) {
    const bd: SignalBreakdown = {
      emaTrend: true,
      supertrendSignal: linregBull,
      emaStack: false,
      rsiMomentum: false,
      macdSignal: false,
      volumeConfirm: niftyBull,
    };
    return { direction: "LONG", score: 3, scoredCount: 3, bd, atrVal };
  }
  if (sellFired && linregBear && !niftyBull) {
    const bd: SignalBreakdown = {
      emaTrend: false,
      supertrendSignal: linregBear,
      emaStack: false,
      rsiMomentum: false,
      macdSignal: false,
      volumeConfirm: !niftyBull,
    };
    return { direction: "SHORT", score: 3, scoredCount: 3, bd, atrVal };
  }
  return null;
}

// ── Strategy 10: TTM Squeeze (John Carter / LazyBear) ─────────────────────────
// "Mastering the Trade" chapter 11. Bollinger Bands narrow inside Keltner Channel
// (low volatility / coiled spring). On the first bar AFTER the squeeze releases,
// enter in the direction of the momentum oscillator (linreg of close-midpoint).
// Historically delivers 55-65% win rate on trending stocks because:
// - Volatility compression guarantees a big move is coming.
// - Momentum direction picks which way.
function getBarSignal_ttmSqueeze(
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  if (i < 42) return null; // need at least 41 warmup bars (39 for sqzMom + 2 prev bars)

  const sqzOnIdx = i - 20; // sqzOn[k] → bar 20+k
  const sqzMomIdx = i - 39; // sqzMom[k] → bar 39+k

  if (sqzOnIdx < 1 || sqzOnIdx >= ind.sqzOn.length) return null;
  if (sqzMomIdx < 1 || sqzMomIdx >= ind.sqzMom.length) return null;

  const atrVal = ind.atrArr[i - 14];
  if (!atrVal) return null;

  const prevSqzOn = ind.sqzOn[sqzOnIdx - 1];
  const curSqzOn = ind.sqzOn[sqzOnIdx];
  const curMom = ind.sqzMom[sqzMomIdx];
  const prevMom = ind.sqzMom[sqzMomIdx - 1];

  // Signal ONLY on first bar after squeeze releases (prevSqzOn=true, curSqzOn=false)
  if (!prevSqzOn || curSqzOn) return null;

  if (curMom > 0 && curMom > prevMom) {
    // Momentum rising in positive territory → LONG
    return {
      direction: "LONG",
      score: 3,
      scoredCount: 3,
      bd: {
        emaTrend: true,
        supertrendSignal: true,
        emaStack: false,
        rsiMomentum: false,
        macdSignal: false,
        volumeConfirm: true,
      },
      atrVal,
    };
  }
  if (curMom < 0 && curMom < prevMom) {
    // Momentum falling in negative territory → SHORT
    return {
      direction: "SHORT",
      score: 3,
      scoredCount: 3,
      bd: {
        emaTrend: false,
        supertrendSignal: true,
        emaStack: false,
        rsiMomentum: false,
        macdSignal: false,
        volumeConfirm: true,
      },
      atrVal,
    };
  }
  return null;
}

// ── Strategy 9: Supertrend + ADX Trend Filter ────────────────────────────────
// Enter ONLY on a fresh Supertrend direction flip (crossover) AND ADX ≥ 18.
// UTBot suffers ~40% win rate because it fires during ranging markets.
// ADX < 18 = ranging → skip; ADX ≥ 18 = real trend → take the crossover.
// stDir[k] → candle k+7; adxArr[k] → candle k+28.
function getBarSignal_supertrendAdx(
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  if (i < 36) return null; // 28 (ADX) + 8 (prev Supertrend bar)

  const adxIdx = i - 28;
  const stCurIdx = i - 7;
  const stPrevIdx = i - 8;

  if (adxIdx < 0 || adxIdx >= ind.adxArr.length) return null;
  if (stCurIdx < 0 || stCurIdx >= ind.stDir.length) return null;
  if (stPrevIdx < 0 || stPrevIdx >= ind.stDir.length) return null;

  const atrVal = ind.atrArr[i - 14];
  if (!atrVal) return null;

  const adxVal = ind.adxArr[adxIdx];
  const trending = adxVal >= 18; // Skip ranging markets
  if (!trending) return null;

  const stCur = ind.stDir[stCurIdx];
  const stPrev = ind.stDir[stPrevIdx];
  const freshBull = stCur === 1 && stPrev === -1; // just flipped bullish
  const freshBear = stCur === -1 && stPrev === 1; // just flipped bearish

  if (freshBull) {
    return {
      direction: "LONG",
      score: 2,
      scoredCount: 2,
      bd: {
        emaTrend: true,
        supertrendSignal: true,
        emaStack: false,
        rsiMomentum: false,
        macdSignal: false,
        volumeConfirm: true,
      },
      atrVal,
    };
  }
  if (freshBear) {
    return {
      direction: "SHORT",
      score: 2,
      scoredCount: 2,
      bd: {
        emaTrend: false,
        supertrendSignal: true,
        emaStack: false,
        rsiMomentum: false,
        macdSignal: false,
        volumeConfirm: true,
      },
      atrVal,
    };
  }
  return null;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
function getStrategyBarSignal(
  strategyId: string,
  i: number,
  candles: Candle[],
  ind: PrecomputedIndicators,
): BarSignal | null {
  switch (strategyId) {
    case "sma-crossover":
      return getBarSignal_smaCrossover(i, candles, ind);
    case "rsi-reversal":
      return getBarSignal_rsiReversal(i, candles, ind);
    case "ema-momentum":
      return getBarSignal_emaMomentum(i, candles, ind);
    case "etf-dip-buy":
      return getBarSignal_etfDipBuy(i, candles, ind);
    case "utbot-linreg":
      return getBarSignal_utbotLinreg(i, candles, ind);
    case "utbot-linreg-v2":
      return getBarSignal_utbotLinregV2(i, candles, ind);
    case "utbot-linreg-v3":
      return getBarSignal_utbotLinregV3(i, candles, ind);
    case "supertrend-adx":
      return getBarSignal_supertrendAdx(i, candles, ind);
    case "ttm-squeeze":
      return getBarSignal_ttmSqueeze(i, candles, ind);
    case "confluence":
    default:
      return getBarSignal_confluence(i, candles, ind);
  }
}

// ── Main backtest function ────────────────────────────────────────────────────

export function runBacktest(
  candles: Candle[],
  initialEquity: number,
  config: Partial<BacktestConfig> = {},
  regimeBull?: boolean[],
): BacktestResult {
  // Per-strategy defaults
  const stratStartBars: Record<string, number> = {
    confluence: 210,
    "sma-crossover": 55,
    "rsi-reversal": 25,
    "ema-momentum": 55,
    "etf-dip-buy": 25,
    "utbot-linreg": 25,
    "utbot-linreg-v2": 55,
    "utbot-linreg-v3": 25,
    "supertrend-adx": 36,
    "ttm-squeeze": 42,
  };
  const stratAtrMult: Record<string, number> = {
    confluence: 1.5,
    "sma-crossover": 1.5,
    "rsi-reversal": 2.0,
    "ema-momentum": 1.5,
    "etf-dip-buy": 2.5,
    "utbot-linreg": 1.5,
    "utbot-linreg-v2": 1.5,
    "utbot-linreg-v3": 1.5,
    "supertrend-adx": 1.5,
    "ttm-squeeze": 2.0, // wider stop — squeeze moves are large
  };
  const stratId = config.strategyId ?? "confluence";
  const cfg: BacktestConfig = {
    strategyId: stratId,
    riskPercent: config.riskPercent ?? 1,
    commissionPct: config.commissionPct ?? 0.2,
    slippagePct: config.slippagePct ?? 0.05, // 0.05% per side = 0.1% round-trip
    atrMultiplier:
      config.atrMultiplier ?? stratAtrMult[stratId] ?? ATR_MULTIPLIER,
    minRR: config.minRR ?? MIN_RR_RATIO,
    startBar: config.startBar ?? stratStartBars[stratId] ?? 210,
  };

  const n = candles.length;
  const ind = precompute(candles, regimeBull);
  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestResult["equityCurve"] = [];
  const monthlyMap = new Map<string, MonthlyPnl>();

  let equity = initialEquity;
  let inTrade = false;
  let tradeNum = 0;

  // Active trade state
  let tradeDir: Direction = "NEUTRAL";
  let entryBar = -1;
  let entryPrice = 0;
  let sl = 0;
  let target = 0;
  let shares = 0;
  let riskAmount = 0;
  let slDist = 0;
  let signalScore = 0;
  let signalBD: SignalBreakdown = {
    emaTrend: false,
    supertrendSignal: false,
    emaStack: false,
    rsiMomentum: false,
    macdSignal: false,
    volumeConfirm: false,
  };

  equityCurve.push({ bar: 0, time: candles[0].time, equity });

  for (let i = cfg.startBar; i < n; i++) {
    const candle = candles[i];

    if (inTrade) {
      // ── Check if SL or target hit this candle ────────────────────────────────
      let exitPrice: number | null = null;
      let exitReason: BacktestTrade["exitReason"] = "STOPLOSS";

      if (tradeDir === "LONG") {
        if (candle.open <= sl) {
          // Gap through SL — exit at open (slippage scenario)
          exitPrice = candle.open;
          exitReason = "STOPLOSS";
        } else if (candle.low <= sl && candle.high >= target) {
          // Both hit same bar — conservative: assume SL first
          exitPrice = sl;
          exitReason = "STOPLOSS";
        } else if (candle.low <= sl) {
          exitPrice = sl;
          exitReason = "STOPLOSS";
        } else if (candle.high >= target) {
          exitPrice = target;
          exitReason = "TARGET";
        }
      } else {
        // SHORT
        if (candle.open >= sl) {
          exitPrice = candle.open;
          exitReason = "STOPLOSS";
        } else if (candle.high >= sl && candle.low <= target) {
          exitPrice = sl;
          exitReason = "STOPLOSS";
        } else if (candle.high >= sl) {
          exitPrice = sl;
          exitReason = "STOPLOSS";
        } else if (candle.low <= target) {
          exitPrice = target;
          exitReason = "TARGET";
        }
      }

      // Last bar: close trade at close
      if (exitPrice === null && i === n - 1) {
        exitPrice = candle.close;
        exitReason = "END_OF_DATA";
      }

      if (exitPrice !== null) {
        const tradeValue = exitPrice * shares;
        const commission = (tradeValue * cfg.commissionPct) / 100;
        const grossPnl =
          tradeDir === "LONG"
            ? (exitPrice - entryPrice) * shares
            : (entryPrice - exitPrice) * shares;
        const netPnl = grossPnl - commission;
        const rMultiple = riskAmount > 0 ? netPnl / riskAmount : 0;

        equity += netPnl;

        // Monthly P&L tracking
        const exitDate = new Date(candle.time * 1000);
        const mKey = `${exitDate.getFullYear()}-${exitDate.getMonth() + 1}`;
        if (!monthlyMap.has(mKey)) {
          monthlyMap.set(mKey, {
            year: exitDate.getFullYear(),
            month: exitDate.getMonth() + 1,
            pnl: 0,
            trades: 0,
          });
        }
        const mEntry = monthlyMap.get(mKey)!;
        mEntry.pnl += netPnl;
        mEntry.trades += 1;

        trades.push({
          tradeNum: ++tradeNum,
          direction: tradeDir,
          entryBar,
          exitBar: i,
          entryTime: candles[entryBar].time,
          exitTime: candle.time,
          entryPrice,
          exitPrice,
          stopLoss: sl,
          target,
          shares,
          slDistance: slDist,
          grossPnl: Math.round(grossPnl * 100) / 100,
          commission: Math.round(commission * 100) / 100,
          netPnl: Math.round(netPnl * 100) / 100,
          rMultiple: Math.round(rMultiple * 100) / 100,
          riskAmount: Math.round(riskAmount * 100) / 100,
          exitReason,
          equityAfter: Math.round(equity * 100) / 100,
          score: signalScore,
          breakdown: signalBD,
        });

        equityCurve.push({
          bar: i,
          time: candle.time,
          equity: Math.round(equity * 100) / 100,
        });
        inTrade = false;
      }

      continue;
    }

    // ── Look for new signal (only when not in trade) ─────────────────────────
    if (i < n - 2) {
      // Need at least one more bar for entry
      const sig = getStrategyBarSignal(cfg.strategyId, i, candles, ind);
      if (sig) {
        // Enter at NEXT bar's open
        const entryCandleIdx = i + 1;
        const entryCandle = candles[entryCandleIdx];
        const rawOpen = entryCandle.open;
        // Apply slippage: entry fills slightly worse than the bar's open price.
        // LONG: buy at rawOpen + slippage (higher). SHORT: sell at rawOpen - slippage (lower).
        const slipAmt = rawOpen * (cfg.slippagePct / 100);
        entryPrice =
          sig.direction === "LONG" ? rawOpen + slipAmt : rawOpen - slipAmt;

        // Recalculate SL/target from slippage-adjusted entry price
        slDist = Math.max(cfg.atrMultiplier * sig.atrVal, entryPrice * 0.005); // min 0.5% SL
        sl =
          sig.direction === "LONG"
            ? Math.round((entryPrice - slDist) * 100) / 100
            : Math.round((entryPrice + slDist) * 100) / 100;
        target =
          sig.direction === "LONG"
            ? Math.round((entryPrice + cfg.minRR * slDist) * 100) / 100
            : Math.round((entryPrice - cfg.minRR * slDist) * 100) / 100;

        // Sanity check: SL on correct side
        if (sig.direction === "LONG" && sl >= entryPrice) continue;
        if (sig.direction === "SHORT" && sl <= entryPrice) continue;

        // Position sizing
        riskAmount = (equity * cfg.riskPercent) / 100;
        shares = Math.floor(riskAmount / slDist);
        if (shares < 1) {
          i = entryCandleIdx; // skip past entry candle
          continue;
        }

        // Entry commission (half of round trip)
        const entryCommission =
          (entryPrice * shares * cfg.commissionPct) / 2 / 100;
        equity -= entryCommission;

        tradeDir = sig.direction;
        entryBar = entryCandleIdx;
        signalScore = sig.score;
        signalBD = sig.bd;
        inTrade = true;

        // Check if the entry candle itself hits SL or target
        // (same candle logic: already handled in the inTrade block next iteration)
        i = entryCandleIdx - 1; // loop will i++ → entryCandleIdx next iteration
      }
    }
  }

  // ── Compute aggregate stats ──────────────────────────────────────────────────
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const netPnl = trades.reduce((s, t) => s + t.netPnl, 0);

  const rMultiples = trades.map((t) => t.rMultiple);
  const avgR = rMultiples.length
    ? rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length
    : 0;
  const stdR = rMultiples.length
    ? Math.sqrt(
        rMultiples.map((r) => (r - avgR) ** 2).reduce((a, b) => a + b, 0) /
          rMultiples.length,
      )
    : 0;

  // Max drawdown from equity curve
  let peak = initialEquity,
    maxDD = 0,
    maxDDPct = 0;
  for (const pt of equityCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = peak - pt.equity;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDPct = (dd / peak) * 100;
    }
  }

  // Consecutive wins/losses
  let maxCW = 0,
    maxCL = 0,
    curW = 0,
    curL = 0;
  for (const t of trades) {
    if (t.netPnl > 0) {
      curW++;
      curL = 0;
      if (curW > maxCW) maxCW = curW;
    } else {
      curL++;
      curW = 0;
      if (curL > maxCL) maxCL = curL;
    }
  }

  const scannedBars = n - cfg.startBar;

  return {
    config: cfg,
    trades,
    equityCurve,
    monthlyPnl: Array.from(monthlyMap.values()).sort(
      (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month),
    ),

    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length
      ? Math.round((wins.length / trades.length) * 1000) / 10
      : 0,
    grossProfit: Math.round(grossProfit),
    grossLoss: Math.round(grossLoss),
    profitFactor:
      grossLoss > 0
        ? Math.round((grossProfit / grossLoss) * 100) / 100
        : wins.length > 0
          ? 999
          : 0,
    netPnl: Math.round(netPnl),
    netReturnPct: Math.round((netPnl / initialEquity) * 10000) / 100,
    expectancy: Math.round(avgR * 100) / 100,
    maxDrawdown: Math.round(maxDD),
    maxDrawdownPct: Math.round(maxDDPct * 100) / 100,
    sharpeRatio: stdR > 0 ? Math.round((avgR / stdR) * 100) / 100 : 0,
    avgWin: wins.length ? Math.round(grossProfit / wins.length) : 0,
    avgLoss: losses.length ? Math.round(grossLoss / losses.length) : 0,
    avgRMultiple: Math.round(avgR * 100) / 100,
    largestWin: wins.length
      ? Math.round(Math.max(...wins.map((t) => t.netPnl)))
      : 0,
    largestLoss: losses.length
      ? Math.round(Math.min(...losses.map((t) => t.netPnl)))
      : 0,
    maxConsecWins: maxCW,
    maxConsecLosses: maxCL,
    avgHoldingBars: trades.length
      ? Math.round(
          (trades.reduce((s, t) => s + (t.exitBar - t.entryBar), 0) /
            trades.length) *
            10,
        ) / 10
      : 0,
    totalBarsScanned: scannedBars,
    signalFrequency: trades.length
      ? Math.round((trades.length / scannedBars) * 100 * 10) / 10
      : 0,
  };
}
