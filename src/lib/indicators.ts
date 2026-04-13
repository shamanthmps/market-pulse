/**
 * indicators.ts
 * Pure technical indicator calculations — no external deps, runs on raw OHLCV arrays.
 * All functions are stateless — pass in the full array, get back the last N values.
 */

export interface Candle {
  time: number; // unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── EMA ──────────────────────────────────────────────────────────────────────
export function ema(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

// ─── SMA ──────────────────────────────────────────────────────────────────────
export function sma(closes: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

// ─── RSI ──────────────────────────────────────────────────────────────────────
export function rsi(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return [];
  const result: number[] = [];
  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

// ─── MACD ─────────────────────────────────────────────────────────────────────
export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult {
  const fastEma = ema(closes, fastPeriod);
  const slowEma = ema(closes, slowPeriod);
  // Align: slowEma is shorter — offset = slowPeriod - fastPeriod
  const offset = slowPeriod - fastPeriod;
  const macdLine = slowEma.map((v, i) => fastEma[i + offset] - v);
  const signalLine = ema(macdLine, signalPeriod);
  const signalOffset = macdLine.length - signalLine.length;
  const histogram = signalLine.map((v, i) => macdLine[i + signalOffset] - v);
  return { macd: macdLine, signal: signalLine, histogram };
}

// ─── ATR ──────────────────────────────────────────────────────────────────────
export function atr(candles: Candle[], period = 14): number[] {
  if (candles.length < period + 1) return [];
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(
      Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose),
      ),
    );
  }
  // Wilder's smoothing
  let avgTR = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = [avgTR];
  for (let i = period; i < trs.length; i++) {
    avgTR = (avgTR * (period - 1) + trs[i]) / period;
    result.push(avgTR);
  }
  return result;
}

// ─── Supertrend ───────────────────────────────────────────────────────────────
export interface SupertrendResult {
  values: number[];
  directions: (1 | -1)[]; // 1 = bullish, -1 = bearish
}

export function supertrend(
  candles: Candle[],
  period = 10,
  multiplier = 3,
): SupertrendResult {
  const atrValues = atr(candles, period);
  const atrOffset = candles.length - 1 - atrValues.length; // candles to skip at start
  const start = atrOffset + 1; // first candle with ATR

  const values: number[] = [];
  const directions: (1 | -1)[] = [];

  let upperBand = 0,
    lowerBand = 0;
  let direction: 1 | -1 = 1;
  let prevClose = candles[start - 1]?.close ?? 0;

  for (let i = 0; i < atrValues.length; i++) {
    const c = candles[start + i];
    const hl2 = (c.high + c.low) / 2;
    const rawUpper = hl2 + multiplier * atrValues[i];
    const rawLower = hl2 - multiplier * atrValues[i];

    upperBand =
      rawUpper < upperBand || prevClose > upperBand ? rawUpper : upperBand;
    lowerBand =
      rawLower > lowerBand || prevClose < lowerBand ? rawLower : lowerBand;

    if (c.close > upperBand) direction = 1;
    else if (c.close < lowerBand) direction = -1;

    values.push(direction === 1 ? lowerBand : upperBand);
    directions.push(direction);
    prevClose = c.close;
  }
  return { values, directions };
}

// ─── Volume analysis ─────────────────────────────────────────────────────────
export function volumeAboveAverage(candles: Candle[], lookback = 20): boolean {
  if (candles.length < lookback + 1) return false;
  const recent = candles[candles.length - 1].volume;
  const avgVol =
    candles.slice(-lookback - 1, -1).reduce((sum, c) => sum + c.volume, 0) /
    lookback;
  return recent > avgVol * 1.2; // 20% above average
}

// ─── ADX (Average Directional Index) ─────────────────────────────────────────
// Returns ADX values. ADX > 20 = trending, > 25 = strongly trending, < 20 = ranging.
// Wilder smoothing used throughout. Output index k → candle k + (2*period).
export function adx(candles: Candle[], period = 14): number[] {
  if (candles.length < period * 2 + 1) return [];

  // Step 1: Directional movement
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trValues: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trValues.push(
      Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose),
      ),
    );
  }

  // Step 2: Wilder smooth TR, +DM, -DM
  let smoothTR = trValues.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const diPlus: number[] = [];
  const diMinus: number[] = [];

  diPlus.push(smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0);
  diMinus.push(smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0);

  for (let i = period; i < trValues.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trValues[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    diPlus.push(smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0);
    diMinus.push(smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0);
  }

  // Step 3: DX and ADX
  const dxValues: number[] = diPlus.map((p, i) => {
    const m = diMinus[i];
    const sum = p + m;
    return sum > 0 ? (Math.abs(p - m) / sum) * 100 : 0;
  });

  if (dxValues.length < period) return [];

  let adxVal = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: number[] = [adxVal];

  for (let i = period; i < dxValues.length; i++) {
    adxVal = (adxVal * (period - 1) + dxValues[i]) / period;
    result.push(adxVal);
  }

  return result;
}

// ─── Resample candles ─────────────────────────────────────────────────────────
// Aggregate n consecutive 1H candles into a single nH candle.
// e.g. resampleCandles(candles, 2) converts 1H → 2H
// e.g. resampleCandles(candles, 4) converts 1H → 4H
// Partial groups at the end are discarded (incomplete candle).
export function resampleCandles(candles: Candle[], n: number): Candle[] {
  if (n <= 1) return candles;
  const result: Candle[] = [];
  // Process in chunks of n
  for (let i = 0; i + n <= candles.length; i += n) {
    const group = candles.slice(i, i + n);
    result.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}

// ─── Standard Deviation ──────────────────────────────────────────────────────
// Population std dev over a rolling window. index k → bar k + (period-1)
export function stddev(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    result.push(Math.sqrt(variance));
  }
  return result;
}

// ─── Bollinger Bands ─────────────────────────────────────────────────────────
// upper/middle/lower[k] → bar k + (period-1)
export interface BollingerBands {
  upper: number[];
  middle: number[];
  lower: number[];
}
export function bollingerBands(
  closes: number[],
  period = 20,
  mult = 2,
): BollingerBands {
  const middle = sma(closes, period);
  const sd = stddev(closes, period);
  return {
    upper: middle.map((m, k) => m + mult * sd[k]),
    middle,
    lower: middle.map((m, k) => m - mult * sd[k]),
  };
}

// ─── Linear Regression ───────────────────────────────────────────────────────
// Returns regression value at the rightmost point of each window.
// linreg(values, 11)[k] → value at bar index k + 10
export function linreg(values: number[], period: number): number[] {
  const result: number[] = [];
  const n = period;
  // Precompute Σx and Σx² (constant for all windows)
  let sumX = 0,
    sumX2 = 0;
  for (let j = 0; j < n; j++) {
    sumX += j;
    sumX2 += j * j;
  }
  const denom = n * sumX2 - sumX * sumX;

  for (let i = n - 1; i < values.length; i++) {
    let sumY = 0,
      sumXY = 0;
    for (let j = 0; j < n; j++) {
      const y = values[i - (n - 1) + j];
      sumY += y;
      sumXY += j * y;
    }
    const b = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const a = (sumY - b * sumX) / n;
    result.push(a + b * (n - 1)); // value at x = n-1 (last point in window)
  }
  return result;
}

// ─── UT Bot Alert ─────────────────────────────────────────────────────────────
// Pine Script port by QuantNomad/HPotter. Uses regular (non-Heikin Ashi) candles.
// keyValue = 6, atrPeriod = 1 → user's settings.
// Alignment: utBotResult arrays index k → candle index k + atrPeriod
export interface UTBotResult {
  trailingStop: number[]; // ATR-based adaptive trailing stop
  buySignal: boolean[]; // true when close crosses above trailing stop
  sellSignal: boolean[]; // true when close crosses below trailing stop
}

export function utBot(
  candles: Candle[],
  keyValue = 6,
  atrPeriod = 1,
): UTBotResult {
  const atrValues = atr(candles, atrPeriod);
  // atrValues[k] corresponds to candles[k + atrPeriod]

  const trailingStop: number[] = [];
  const buySignal: boolean[] = [];
  const sellSignal: boolean[] = [];

  let prevTS = 0;
  let prevClose = candles[atrPeriod - 1]?.close ?? 0;

  for (let k = 0; k < atrValues.length; k++) {
    const close = candles[k + atrPeriod].close;
    const nLoss = keyValue * atrValues[k];

    let ts: number;
    if (k === 0) {
      ts = close >= prevClose ? close - nLoss : close + nLoss;
    } else if (close > prevTS && prevClose > prevTS) {
      ts = Math.max(prevTS, close - nLoss);
    } else if (close < prevTS && prevClose < prevTS) {
      ts = Math.min(prevTS, close + nLoss);
    } else {
      ts = close > prevTS ? close - nLoss : close + nLoss;
    }

    // Crossover: prev close was on opposite side of prev TS
    const buy = k > 0 && prevClose <= prevTS && close > ts;
    const sell = k > 0 && prevClose >= prevTS && close < ts;

    trailingStop.push(ts);
    buySignal.push(buy);
    sellSignal.push(sell);
    prevTS = ts;
    prevClose = close;
  }

  return { trailingStop, buySignal, sellSignal };
}

// ─── Convenience: get last value ─────────────────────────────────────────────
export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}
