/**
 * strategies.ts — Market Pulse Strategy Registry
 *
 * Each strategy is a self-contained trading ruleset with its own
 * signal logic, stop-loss sizing, and minimum data requirements.
 * Add new strategies here; backtest.ts dispatches to them by id.
 */

export interface StrategyMeta {
  id: string;
  name: string;
  tagline: string; // one-line description shown in UI
  pill: string; // short badge text shown on the button
  minBars: number; // minimum candles required before first signal
  atrMultiplier: number; // stop loss = n × ATR(14)
  methodologyNote: string; // shown in the methodology callout box
}

export const STRATEGIES: StrategyMeta[] = [
  {
    id: "sma-crossover",
    name: "SMA Crossover",
    tagline:
      "SMA(20) crosses SMA(50) - golden cross / death cross trend-following",
    pill: "20 / 50 Cross",
    minBars: 55,
    atrMultiplier: 1.5,
    methodologyNote:
      "Signal: SMA(20) crosses above SMA(50) → LONG (golden cross); crosses below → SHORT (death cross). " +
      "Volume confirmation preferred. Entry at next-bar open. Stop = 1.5× ATR(14). Target = 1:2 R:R.",
  },
  {
    id: "rsi-reversal",
    name: "RSI Mean Reversion",
    tagline:
      "RSI(14) < 35 oversold → LONG bounce · RSI > 65 overbought → SHORT",
    pill: "RSI 35 / 65",
    minBars: 25,
    atrMultiplier: 2.0,
    methodologyNote:
      "Signal: RSI(14) enters oversold zone (< 35) AND starts turning up → LONG. " +
      "RSI enters overbought (> 65) AND starts turning down → SHORT. Volume must be above average. " +
      "Entry at next-bar open. Stop = 2× ATR (wider for mean-reversion room). Target = 1:2 R:R.",
  },
  {
    id: "ema-momentum",
    name: "EMA Momentum Stack",
    tagline: "EMA(9) > EMA(20) > EMA(50) triple alignment + MACD confirm",
    pill: "9 / 20 / 50 Stack",
    minBars: 55,
    atrMultiplier: 1.5,
    methodologyNote:
      "Signal: Triple EMA alignment - EMA(9) > EMA(20) > EMA(50) for LONG (all bearish for SHORT). " +
      "MACD histogram must agree. Volume above average preferred. " +
      "Entry at next-bar open. Stop = 1.5× ATR. Target = 1:2 R:R.",
  },
  {
    id: "confluence",
    name: "Multi-Signal Confluence",
    tagline:
      "EMA200 + Supertrend gates, then RSI + MACD + Volume scored (original engine)",
    pill: "6-Point Score",
    minBars: 210,
    atrMultiplier: 1.5,
    methodologyNote:
      "Signal: EMA(200) direction + Supertrend(7,3) - both gates must pass. " +
      "Then 2 of 4 scored: EMA stack, RSI zone (38-65), MACD positive, Volume 1.1×. " +
      "Entry at next-bar open. Stop = 1.5× ATR. Target = 1:2 R:R.",
  },
  {
    id: "etf-dip-buy",
    name: "ETF Dip Buy",
    tagline:
      "2H RSI < 30 oversold + first uptick → buy ETF dips. Your primary ETF accumulation strategy.",
    pill: "RSI < 30 Dip",
    minBars: 25,
    atrMultiplier: 2.5,
    methodologyNote:
      "Signal: RSI(14) on selected timeframe drops below 30 (oversold) AND starts turning up (current RSI > previous). " +
      "No SHORT signals - ETFs are long-only. Stop = 2.5x ATR (wide, as these are index ETFs). " +
      "Target = 1:2 R:R. Best used on 2H timeframe with NIFTY/Midcap/Sectoral ETFs. Park capital in LiquidCase until RSI dips.",
  },
  {
    id: "utbot-linreg",
    name: "UT Bot + LinReg",
    tagline:
      "UT Bot ATR trailing stop crossover filtered by LinReg Candle color (len=11, smooth=7)",
    pill: "UTBot · LinReg",
    minBars: 25,
    atrMultiplier: 1.5,
    methodologyNote:
      "Signal: UT Bot Alert (KeyValue=6, ATR Period=1, regular candles) - price crosses above/below ATR trailing stop. " +
      "Filter: LinReg Candle must be bullish (EMA(linreg(close,11),7) > EMA(linreg(open,11),7)) for LONG, " +
      "bearish for SHORT. LinReg Length=11, Signal Smoothing=7. " +
      "Entry at next-bar open. Stop = 1.5× ATR(14). Target = 1:2 R:R.",
  },
  {
    id: "utbot-linreg-v2",
    name: "UT Bot + LinReg v2",
    tagline:
      "UT Bot + LinReg + EMA(50) trend filter + volume confirm - fewer signals, higher quality",
    pill: "UTBot · LR · EMA50",
    minBars: 55,
    atrMultiplier: 1.5,
    methodologyNote:
      "Same as UT Bot + LinReg but with two extra gates: " +
      "(1) EMA(50) trend filter - price must be above EMA50 for LONG, below for SHORT. Eliminates counter-trend whipsaws. " +
      "(2) Volume gate - candle volume must exceed 1.1x 20-bar average. Avoids thin-market, low-conviction entries. " +
      "Expects fewer signals than v1 but each signal carries higher win probability. " +
      "Entry at next-bar open. Stop = 1.5× ATR(14). Target = 1:2 R:R.",
  },
  {
    id: "utbot-linreg-v3",
    name: "UT Bot + LinReg v3 ★",
    tagline:
      "UT Bot + LinReg + Nifty50 regime filter - only trades when market is in bull phase",
    pill: "UTBot · Regime",
    minBars: 25,
    atrMultiplier: 1.5,
    methodologyNote:
      "Same signal as UT Bot + LinReg v1, but gated by a market regime filter: " +
      "LONG signals only fire when Nifty50 is above its 50-day EMA (bull market). " +
      "SHORT signals only fire when Nifty50 is below its 50-day EMA (bear market). " +
      "This prevents trading against the broad market trend - the single biggest source of losses in choppy/correcting markets. " +
      "Nifty EMA50 is computed from live ^NSEI daily data fetched in parallel. " +
      "Entry at next-bar open. Stop = 1.5× ATR(14). Target = 1:2 R:R.",
  },
  {
    id: "supertrend-adx",
    name: "Supertrend + ADX ★",
    tagline:
      "Enter only on fresh Supertrend crossovers confirmed by ADX ≥ 18 trend strength",
    pill: "Supertrend · ADX",
    minBars: 36,
    atrMultiplier: 1.5,
    methodologyNote:
      "Fires LONG only when Supertrend(7,3) flips from bearish → bullish AND ADX(14) ≥ 18. " +
      "Fires SHORT only when Supertrend flips bullish → bearish AND ADX ≥ 18. " +
      "ADX < 18 = ranging market → all signals blocked. This directly fixes the 40% win-rate problem " +
      "of UTBot: most whipsaws happen in low-ADX ranging conditions. " +
      "Fewer trades but each one in a confirmed trending environment. " +
      "Entry at next-bar open. Stop = 1.5× ATR(14). Target = 1:2 R:R.",
  },
  {
    id: "ttm-squeeze",
    name: "TTM Squeeze ★★",
    tagline:
      "Bollinger Bands inside Keltner Channel = coiled spring. Enter on first release bar in momentum direction.",
    pill: "Squeeze · Momentum",
    minBars: 42,
    atrMultiplier: 2.0,
    methodologyNote:
      'John Carter\'s TTM Squeeze from "Mastering the Trade" (ch.11). ' +
      "When Bollinger Bands (20,2) collapse inside the Keltner Channel (EMA20 ±1.5×ATR20), " +
      "volatility is compressed - a large move is loading. On the first bar after the squeeze " +
      "releases (BB expands beyond KC), momentum direction decides: " +
      "LinReg oscillator above zero and rising = LONG; below zero and falling = SHORT. " +
      "Documented 55-65% win rate on trending large-cap equities. " +
      "Entry at next-bar open. Stop = 2.0× ATR(14). Target = 1:2 R:R.",
  },
];

export const DEFAULT_STRATEGY_ID = "sma-crossover";
