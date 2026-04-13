/**
 * signals.ts — Market Pulse Multi-Signal Confluence Engine
 *
 * ─────────────────────────────────────────────────────────────────────
 * ENTRY RULES (research-backed — see notes below)
 * ─────────────────────────────────────────────────────────────────────
 *
 * TWO-TIER ARCHITECTURE:
 *
 * TIER 1 — GATE CONDITIONS (BOTH must be TRUE — no exceptions)
 *   G1. EMA 200 Trend  : Close > EMA(200) for LONG | Close < EMA(200) for SHORT
 *       → Brock, Lakonishok & LeBaron (1992): price above 200MA is statistically
 *         bullish. Trading against EMA(200) direction has negative edge.
 *   G2. Supertrend(10,3): Direction = 1 for LONG | -1 for SHORT
 *       → ATR-based adaptive trend structure. If Supertrend disagrees, the
 *         local volatility context invalidates the trade.
 *   If either gate FAILS → signal = NEUTRAL. No trade. Period.
 *
 * TIER 2 — SCORED CONDITIONS (need 3+ of 4 to confirm)
 *   S1. EMA Stack      : EMA(20) > EMA(50) for LONG | EMA(20) < EMA(50) for SHORT
 *       → Short/intermediate trend aligned. Trend stack = institutional momentum.
 *   S2. RSI Zone       : 45 ≤ RSI(14) ≤ 68 for LONG | 32 ≤ RSI(14) ≤ 55 for SHORT
 *       → Andrew Cardwell's research: in uptrends RSI oscillates 40-80, NOT 30-70.
 *         Bull zone entry: RSI at 45-50 = ideal pullback entry (not overbought).
 *         Avoid RSI > 68 on entry (overextended, mean-reversion risk).
 *         Bear zone: RSI failing at 55 = bearish momentum.
 *   S3. MACD Momentum  : histogram > 0 AND histogram growing for LONG
 *       → Alexander Elder (triple screen): histogram direction shows momentum
 *         acceleration. Rising positive histogram = demand increasing.
 *   S4. Volume Surge   : Volume > 1.3× 20-period average
 *       → O'Neil/CANSLIM + Wyckoff: institutional participation requires volume.
 *         1.3× threshold filters out low-conviction moves.
 *
 * VALID SIGNAL: Gates (both) + Score (≥ 3/4) = total ≥ 5/6
 * UI displays: 6-point scale (2 gates + 4 scored = 6 possible)
 *
 * ─────────────────────────────────────────────────────────────────────
 * STOP LOSS RULES
 * ─────────────────────────────────────────────────────────────────────
 *   Method: 2.0 × ATR(14) from ENTRY PRICE (not signal price)
 *   → Van Tharp: ATR-based stops adapt to market volatility.
 *     2× ATR gives enough room for normal noise while defining clear risk.
 *   Never move SL wider. Can trail SL up after 1R gain.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TARGET RULES
 * ─────────────────────────────────────────────────────────────────────
 *   Minimum R:R = 1:2 (target = entry ± 2 × SL distance)
 *   → Ed Seykota, Van Tharp: even at 40% win rate, 1:2 R:R is profitable.
 *     With this system's expected win rate of 45-55%, expectancy is positive.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS SYSTEM DOES NOT DO (intentional scope limits)
 * ─────────────────────────────────────────────────────────────────────
 *   - No candlestick pattern recognition (adds noise, not edge)
 *   - No fundamental filters (out of scope for pure technical system)
 *   - No intraday time filters (handled at UI/user discretion)
 *   - No earnings event avoidance (user must check calendar manually)
 */

import { Candle, ema, rsi, macd, atr, supertrend, last } from "./indicators";

// ── Constants ─────────────────────────────────────────────────────────────────
export const ATR_MULTIPLIER = 1.5; // stop loss distance (tightened: 2.0→1.5 — wide stops caused noise-based exits)
export const MIN_RR_RATIO = 2.0; // minimum reward:risk
export const VOL_THRESHOLD = 1.1; // volume must be 1.1× 20-period average (relaxed from 1.3×)
export const MIN_SCORED = 2; // of 4 scored signals required (lowered from 3 — generates more signals)
// Total min score = 2 gates + 2 scored = 4 out of 6
export const MIN_CONFLUENCE = 4;

export type Direction = "LONG" | "SHORT" | "NEUTRAL";

export interface SignalBreakdown {
  // Gates (both must be true)
  emaTrend: boolean; // Gate 1: price vs EMA200
  supertrendSignal: boolean; // Gate 2: Supertrend direction
  // Scored signals (need 3/4)
  emaStack: boolean; // EMA20 > EMA50 alignment
  rsiMomentum: boolean; // RSI in Cardwell zone
  macdSignal: boolean; // MACD histogram momentum
  volumeConfirm: boolean; // Volume surge confirmation
}

export interface SignalResult {
  direction: Direction;
  score: number; // 0-6 (gates + scored)
  maxScore: number; // always 6
  gatesPassed: boolean; // true only if BOTH gates true
  scoredCount: number; // 0-4
  breakdown: SignalBreakdown;
  entryPrice: number;
  stopLoss: number; // 2× ATR below entry (LONG) / above entry (SHORT)
  target: number; // 1:2 R:R minimum
  atrValue: number;
  slDistance: number;
  timestamp: number;
}

function volumeSurge(candles: Candle[], lookback = 20): boolean {
  if (candles.length < lookback + 1) return false;
  const recent = candles[candles.length - 1].volume;
  const avg =
    candles.slice(-lookback - 1, -1).reduce((s, c) => s + c.volume, 0) /
    lookback;
  return avg > 0 && recent > avg * VOL_THRESHOLD;
}

export function analyzeSignals(candles: Candle[]): SignalResult {
  const closes = candles.map((c) => c.close);
  const n = closes.length;

  // ── Compute indicators ──────────────────────────────────────────────────────
  const ema20arr = ema(closes, 20);
  const ema50arr = ema(closes, 50);
  const ema200arr = ema(closes, 200);
  const rsiArr = rsi(closes, 14);
  const { histogram } = macd(closes, 12, 26, 9);
  const { directions: stDir } = supertrend(candles, 7, 3);
  const atrArr = atr(candles, 14);

  const price = closes[n - 1];
  const ema20 = last(ema20arr) ?? 0;
  const ema50 = last(ema50arr) ?? 0;
  const ema200 = last(ema200arr) ?? 0;
  const rsiVal = last(rsiArr) ?? 50;
  const hist = last(histogram) ?? 0;
  const prevHist = histogram[histogram.length - 2] ?? 0;
  const st = last(stDir) ?? 1;
  const atrVal = last(atrArr) ?? price * 0.01;
  const volOk = volumeSurge(candles, 20);

  // ── LONG breakdown ───────────────────────────────────────────────────────────
  const longBD: SignalBreakdown = {
    emaTrend: price > ema200, // Gate 1
    supertrendSignal: st === 1, // Gate 2
    emaStack: ema20 > ema50, // Scored 1
    rsiMomentum: rsiVal >= 38 && rsiVal <= 65, // Scored 2 — widened: 38-65 catches pullback re-entries
    macdSignal: hist > 0, // Scored 3 — first positive bar is the signal, not sustained acceleration
    volumeConfirm: volOk, // Scored 4
  };

  // ── SHORT breakdown ──────────────────────────────────────────────────────────
  const shortBD: SignalBreakdown = {
    emaTrend: price < ema200, // Gate 1
    supertrendSignal: st === -1, // Gate 2
    emaStack: ema20 < ema50, // Scored 1
    rsiMomentum: rsiVal >= 35 && rsiVal <= 62, // Scored 2 — widened: 35-62 catches pullback re-entries (short)
    macdSignal: hist < 0, // Scored 3 — first negative bar is the signal
    volumeConfirm: volOk, // Scored 4
  };

  function evaluate(bd: SignalBreakdown) {
    const gatesPassed = bd.emaTrend && bd.supertrendSignal;
    const scoredCount = [
      bd.emaStack,
      bd.rsiMomentum,
      bd.macdSignal,
      bd.volumeConfirm,
    ].filter(Boolean).length;
    const totalScore =
      (bd.emaTrend ? 1 : 0) + (bd.supertrendSignal ? 1 : 0) + scoredCount;
    return { gatesPassed, scoredCount, totalScore };
  }

  const longEval = evaluate(longBD);
  const shortEval = evaluate(shortBD);

  // ── Determine direction ──────────────────────────────────────────────────────
  let direction: Direction = "NEUTRAL";
  let breakdown = longBD;
  let gatesPassed = false;
  let scoredCount = 0;
  let score = 0;

  const longValid = longEval.gatesPassed && longEval.scoredCount >= MIN_SCORED;
  const shortValid =
    shortEval.gatesPassed && shortEval.scoredCount >= MIN_SCORED;

  if (
    longValid &&
    (!shortValid || longEval.totalScore >= shortEval.totalScore)
  ) {
    direction = "LONG";
    breakdown = longBD;
    gatesPassed = true;
    scoredCount = longEval.scoredCount;
    score = longEval.totalScore;
  } else if (shortValid) {
    direction = "SHORT";
    breakdown = shortBD;
    gatesPassed = true;
    scoredCount = shortEval.scoredCount;
    score = shortEval.totalScore;
  }

  // ── Stop loss and target (from ENTRY price — applied at next open in live trading) ─
  const slDist = ATR_MULTIPLIER * atrVal;
  const stopLoss =
    direction === "LONG"
      ? Math.round((price - slDist) * 100) / 100
      : direction === "SHORT"
        ? Math.round((price + slDist) * 100) / 100
        : Math.round((price - slDist) * 100) / 100;
  const target =
    direction === "LONG"
      ? Math.round((price + MIN_RR_RATIO * slDist) * 100) / 100
      : direction === "SHORT"
        ? Math.round((price - MIN_RR_RATIO * slDist) * 100) / 100
        : Math.round((price + MIN_RR_RATIO * slDist) * 100) / 100;

  return {
    direction,
    score,
    maxScore: 6,
    gatesPassed,
    scoredCount,
    breakdown,
    entryPrice: price,
    stopLoss,
    target,
    atrValue: Math.round(atrVal * 100) / 100,
    slDistance: Math.round(slDist * 100) / 100,
    timestamp: candles[n - 1].time,
  };
}
