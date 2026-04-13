/**
 * GET /api/backtest?symbol=RELIANCE.NS&interval=1d&range=2y&risk=1&commission=0.2
 */

import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest";
import { Candle, resampleCandles, ema } from "@/lib/indicators";

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

const COMMISSION_BY_INTERVAL: Record<string, number> = {
  "5m": 0.1,
  "15m": 0.1,
  "1h": 0.1,
  "2h": 0.1,
  "4h": 0.1,
  "1d": 0.2,
  "1wk": 0.2,
};

// Slippage per side (entry fills this % worse than the bar's open price)
// NSE delivery/CNC on 1H: ~0.05% per side is the standard retail assumption
const SLIPPAGE_BY_INTERVAL: Record<string, number> = {
  "5m": 0.05,
  "15m": 0.05,
  "1h": 0.05,
  "2h": 0.05,
  "4h": 0.03,
  "1d": 0.02, // daily: more liquid at open, lower slippage
  "1wk": 0.02,
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? "RELIANCE.NS";
  const interval = searchParams.get("interval") ?? "1d";
  const range = searchParams.get("range") ?? "2y";
  const riskPct = parseFloat(searchParams.get("risk") ?? "1");
  const initEquity = parseFloat(searchParams.get("equity") ?? "100000");
  const strategy = searchParams.get("strategy") ?? "confluence";

  // Input validation
  if (!/^[A-Z0-9^.]{1,20}$/i.test(symbol))
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });

  // Auto-append .NS for Indian symbols that have no exchange suffix
  // e.g. NIFTYBEES → NIFTYBEES.NS, ^NSEI stays as is
  const normalizedSymbol = symbol.toUpperCase();
  const resolvedSymbol =
    !normalizedSymbol.includes(".") && !normalizedSymbol.startsWith("^")
      ? `${normalizedSymbol}.NS`
      : normalizedSymbol;

  const allowedIntervals = ["5m", "15m", "1h", "2h", "4h", "1d", "1wk"];
  const allowedRanges = ["5d", "3mo", "6mo", "1y", "2y", "5y"];
  const allowedStrategies = [
    "confluence",
    "sma-crossover",
    "rsi-reversal",
    "ema-momentum",
    "etf-dip-buy",
    "utbot-linreg",
    "utbot-linreg-v2",
    "utbot-linreg-v3",
    "supertrend-adx",
    "ttm-squeeze",
  ];
  if (!allowedIntervals.includes(interval) || !allowedRanges.includes(range))
    return NextResponse.json(
      { error: "Invalid interval or range" },
      { status: 400 },
    );
  if (!allowedStrategies.includes(strategy))
    return NextResponse.json({ error: "Invalid strategy" }, { status: 400 });

  if (riskPct < 0.1 || riskPct > 5 || initEquity < 10000)
    return NextResponse.json(
      { error: "Invalid risk or equity parameters" },
      { status: 400 },
    );

  try {
    // 2H and 4H are not native Yahoo Finance intervals — fetch 1H and resample
    const resampleFactor = interval === "2h" ? 2 : interval === "4h" ? 4 : 1;
    const fetchInterval = resampleFactor > 1 ? "1h" : interval;
    const fetchRange =
      resampleFactor > 1
        ? range === "6mo"
          ? "1y"
          : range === "1y"
            ? "2y"
            : "2y"
        : range;

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    };
    const mainUrl = `${YF_BASE}/${encodeURIComponent(resolvedSymbol)}?interval=${fetchInterval}&range=${fetchRange}&includePrePost=false`;

    // For v3: fetch Nifty50 daily data in parallel to compute regime filter
    const isV3 = strategy === "utbot-linreg-v3";
    const niftyUrl = `${YF_BASE}/%5ENSEI?interval=1d&range=2y&includePrePost=false`;

    const [res, niftyRes] = await Promise.all([
      fetch(mainUrl, { headers }),
      isV3 ? fetch(niftyUrl, { headers }) : Promise.resolve(null),
    ]);

    if (!res.ok)
      return NextResponse.json(
        { error: `Data fetch failed: HTTP ${res.status}` },
        { status: 502 },
      );

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result)
      return NextResponse.json(
        { error: "No data returned for symbol" },
        { status: 404 },
      );

    const timestamps: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};

    const rawCandles: Candle[] = timestamps
      .map((t: number, i: number) => ({
        time: t,
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: q.close[i],
        volume: q.volume[i] ?? 0,
      }))
      .filter(
        (c: Candle) =>
          c.open != null &&
          c.high != null &&
          c.low != null &&
          c.close != null &&
          !isNaN(c.close) &&
          c.close > 0,
      );

    // Resample 1H → 2H or 4H if requested
    const candles =
      resampleFactor > 1
        ? resampleCandles(rawCandles, resampleFactor)
        : rawCandles;

    if (candles.length < 30)
      return NextResponse.json(
        {
          error: `Only ${candles.length} valid bars - need at least 30. Try a wider range.`,
        },
        { status: 422 },
      );

    if (strategy === "confluence" && candles.length < 210)
      return NextResponse.json(
        {
          error: `Only ${candles.length} bars - confluence strategy needs 210+ for EMA200. Try 2y range.`,
        },
        { status: 422 },
      );

    // ── Regime filter for v3 ─────────────────────────────────────────────────
    // Build a Map<YYYY-MM-DD, boolean> showing whether Nifty50 was above EMA50 that day.
    // Then align it bar-by-bar to the main symbol's candles.
    let regimeBull: boolean[] | undefined;
    if (isV3 && niftyRes?.ok) {
      try {
        const niftyData = await niftyRes.json();
        const nr = niftyData?.chart?.result?.[0];
        if (nr) {
          const nTs: number[] = nr.timestamp ?? [];
          const nQ = nr.indicators?.quote?.[0] ?? {};
          const niftyCloses: number[] = nTs
            .map((t: number, i: number) => ({ t, c: nQ.close[i] }))
            .filter(
              (x: { t: number; c: number }) =>
                x.c != null && !isNaN(x.c) && x.c > 0,
            )
            .map((x: { t: number; c: number }) => x.c);
          const niftyTimes: number[] = nTs
            .map((t: number, i: number) => ({ t, c: nQ.close[i] }))
            .filter(
              (x: { t: number; c: number }) =>
                x.c != null && !isNaN(x.c) && x.c > 0,
            )
            .map((x: { t: number; c: number }) => x.t);

          // Compute EMA50 on Nifty daily closes
          const niftyEma50 = ema(niftyCloses, 50);
          // niftyEma50[k] → niftyCloses[k + 49], niftyTimes[k + 49]

          // Build date → bull map (YYYY-MM-DD key)
          const regimeMap = new Map<string, boolean>();
          for (let k = 0; k < niftyEma50.length; k++) {
            const barIdx = k + 49;
            const dateKey = new Date(niftyTimes[barIdx] * 1000)
              .toISOString()
              .slice(0, 10);
            regimeMap.set(dateKey, niftyCloses[barIdx] > niftyEma50[k]);
          }

          // Align to main candles — for each bar, get its date and look up regime
          // For 1H candles, multiple bars share the same date → same regime value
          regimeBull = candles.map((c) => {
            const dk = new Date(c.time * 1000).toISOString().slice(0, 10);
            return regimeMap.get(dk) ?? true; // default bull if date not in map
          });
        }
      } catch {
        // If Nifty fetch fails, silently fall back to no filter (all true)
        regimeBull = undefined;
      }
    }

    const commission = COMMISSION_BY_INTERVAL[interval] ?? 0.2;
    const slippage = SLIPPAGE_BY_INTERVAL[interval] ?? 0.05;
    const btResult = runBacktest(
      candles,
      initEquity,
      {
        riskPercent: riskPct,
        commissionPct: commission,
        slippagePct: slippage,
        strategyId: strategy,
      },
      regimeBull,
    );

    return NextResponse.json({
      symbol: resolvedSymbol,
      interval,
      range,
      totalCandles: candles.length,
      ...btResult,
    });
  } catch (err) {
    console.error("[backtest API error]", err);
    return NextResponse.json(
      { error: "Backtest failed internally" },
      { status: 500 },
    );
  }
}
