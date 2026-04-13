/**
 * GET /api/etf-monitor?symbols=BANKBEES.NS,ITBEES.NS,...&market=^NSEI
 *
 * Returns 2H RSI for each symbol + the market timing index (^NSEI by default).
 * Used by the ETF Portfolio Monitor page.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { rsi, resampleCandles } from "@/lib/indicators";

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

interface EtfRsiResult {
  symbol: string;
  currentPrice: number;
  prevClose: number;
  rsi2h: number;
  prevRsi2h: number; // previous bar — tells us if RSI is rising or falling
  direction: "rising" | "falling" | "flat";
  zone: "BUY" | "WATCH" | "HOLD" | "CAUTION" | "HEDGE";
  signal: string; // human readable instruction
  coveredCallStrike: number; // LTP × 1.05 (5% OTM) — relevant only in HEDGE zone
  error?: string;
}

interface MarketPulse {
  symbol: string;
  rsi2h: number;
  prevRsi2h: number;
  rsiDaily: number; // Daily RSI - context filter
  currentPrice: number;
  direction: "rising" | "falling" | "flat";
  zone: "BUY" | "WATCH" | "HOLD" | "CAUTION" | "HEDGE";
  interpretation: string;
  deploySignal: DeploySignal; // dual-timeframe buy guidance
  hedgeSignal: HedgeSignal; // dual-timeframe call hedge guidance
}

interface DeploySignal {
  tranche: string; // e.g. "1/8", "1/4", "1/3", "1/2", "ALL IN"
  label: string; // short label
  explanation: string; // full reasoning
  confidence: "low" | "medium" | "high" | "max";
}

interface CollarLeg {
  seq: number; // 1, 2, 3 — place in this order
  action: "BUY" | "SELL";
  instrument: string; // e.g. "NIFTY 22100 PE"
  strike: number;
  type: "CE" | "PE";
  lots: number;
  expiryLabel: string;
  dte: number;
  purpose: string;
}

interface HedgeSignal {
  shouldHedge: boolean;
  verdict: "SELL" | "COLLAR" | "WAIT" | "HOLD";
  label: string;
  action: string; // one-liner: exactly what to do right now
  explanation: string;
  strategy: "SELL_CE" | "COLLAR" | "NONE";
  gainPercent?: number;
  legs?: CollarLeg[];
  // kept for backward compat
  strike?: number;
  expiryLabel?: string;
  lotsNow?: number;
  maxLots?: number;
}

function getZone(rsiVal: number): EtfRsiResult["zone"] {
  if (rsiVal < 30) return "BUY";
  if (rsiVal < 45) return "WATCH";
  if (rsiVal < 70) return "HOLD";
  if (rsiVal < 80) return "CAUTION";
  return "HEDGE";
}

function getSignal(zone: EtfRsiResult["zone"], direction: string): string {
  switch (zone) {
    case "BUY":
      return direction === "rising"
        ? "✅ Strong buy - RSI oversold + recovering"
        : "⏳ Oversold but still falling - wait for uptick";
    case "WATCH":
      return "👀 Approaching buy zone - prepare capital, watch closely";
    case "HOLD":
      return "Hold - no action needed";
    case "CAUTION":
      return "⚠️ Nearing overbought - consider partial profit booking";
    case "HEDGE":
      return "🔴 Sell covered calls 5% OTM to lock profits";
    default:
      return "-";
  }
}

function getInterpretation(
  zone: MarketPulse["zone"],
  rsi2h: number,
  rsiDaily: number,
  direction: string,
): string {
  if (zone === "BUY" && direction === "rising")
    return `2H RSI ${rsi2h.toFixed(1)} oversold + recovering. Daily RSI ${rsiDaily.toFixed(1)} - see deploy signal below.`;
  if (zone === "BUY")
    return `2H RSI ${rsi2h.toFixed(1)} oversold but still falling. Daily RSI ${rsiDaily.toFixed(1)} - see deploy signal below.`;
  if (zone === "WATCH")
    return `2H RSI ${rsi2h.toFixed(1)} approaching buy zone. Daily RSI ${rsiDaily.toFixed(1)} - move funds into LiquidCase and be ready.`;
  if (zone === "HOLD")
    return `2H RSI ${rsi2h.toFixed(1)} neutral. Daily RSI ${rsiDaily.toFixed(1)} - no action. Park surplus in LiquidCase.`;
  if (zone === "CAUTION")
    return `2H RSI ${rsi2h.toFixed(1)} elevated. Daily RSI ${rsiDaily.toFixed(1)} - see hedge signal below.`;
  return `2H RSI ${rsi2h.toFixed(1)} overbought. Daily RSI ${rsiDaily.toFixed(1)} - see hedge signal below.`;
}

// ── Dual-timeframe deploy signal (BUY zone only) ───────────────────────────
// Logic: 2H < 30 is the trigger. Daily RSI determines confidence in the bottom.
// Daily still high = market expensive on bigger picture, more downside likely = deploy less.
// Daily also crushed = real broad bottom, deploy more.
function getDeploySignal(
  rsi2h: number,
  rsiDaily: number,
  liqAmt: number,
): DeploySignal {
  if (rsi2h >= 30) {
    return {
      tranche: "-",
      label: "No signal",
      explanation: "2H RSI not in buy zone yet.",
      confidence: "low",
    };
  }
  if (rsiDaily > 55) {
    const amt =
      liqAmt > 0
        ? ` Deploy ₹${Math.round(liqAmt / 8).toLocaleString("en-IN")} now.`
        : "";
    return {
      tranche: "1/8",
      label: "Minimal - daily still high",
      explanation: `Daily RSI ${rsiDaily.toFixed(1)} is still elevated - the big picture trend may have more downside. Deploy only 1/8 of LiquidCase.${amt} Save the rest for lower levels.`,
      confidence: "low",
    };
  }
  if (rsiDaily > 45) {
    const amt =
      liqAmt > 0
        ? ` Deploy ₹${Math.round(liqAmt / 4).toLocaleString("en-IN")} now.`
        : "";
    return {
      tranche: "1/4",
      label: "Cautious - daily cooling",
      explanation: `Daily RSI ${rsiDaily.toFixed(1)} is cooling but not washed out. Market correcting on bigger picture - deploy 1/4 of LiquidCase.${amt} Keep rest for further downside.`,
      confidence: "medium",
    };
  }
  if (rsiDaily > 35) {
    const amt =
      liqAmt > 0
        ? ` Deploy ₹${Math.round(liqAmt / 3).toLocaleString("en-IN")} now.`
        : "";
    return {
      tranche: "1/3",
      label: "Confident - both TFs correcting",
      explanation: `Daily RSI ${rsiDaily.toFixed(1)} also correcting - getting close to a real bottom. Deploy 1/3 of LiquidCase.${amt} Keep rest for final leg down.`,
      confidence: "high",
    };
  }
  if (rsiDaily > 30) {
    const amt =
      liqAmt > 0
        ? ` Deploy ₹${Math.round(liqAmt / 2).toLocaleString("en-IN")} now.`
        : "";
    return {
      tranche: "1/2",
      label: "Strong - daily near oversold",
      explanation: `Daily RSI ${rsiDaily.toFixed(1)} near oversold - broad correction confirmed. Deploy half of LiquidCase.${amt} Reserve rest in case of further panic.`,
      confidence: "high",
    };
  }
  // Daily RSI < 30 - both timeframes crushed
  const amt =
    liqAmt > 0 ? ` Deploy all ₹${liqAmt.toLocaleString("en-IN")} now.` : "";
  return {
    tranche: "ALL IN",
    label: "Max - both timeframes oversold",
    explanation: `Daily RSI ${rsiDaily.toFixed(1)} - both 2H and Daily are oversold. This is a confirmed broad market bottom, rare opportunity. Deploy entire LiquidCase.${amt}`,
    confidence: "max",
  };
}

// ── Dual-timeframe hedge signal (CAUTION/HEDGE zone only) ──────────────────
// Expiry rule: sell the monthly (last Thursday of month) that gives >= 21 DTE.
// If current month's last Thursday is < 21 days away, use next month's.
function getNiftyMonthlyExpiry(fromDate: Date): { label: string; dte: number } {
  function lastThursday(year: number, month: number): Date {
    // month is 0-indexed (JS Date). Find last Thursday of that month.
    const lastDay = new Date(year, month + 1, 0); // last day of month
    const offset = (lastDay.getDay() - 4 + 7) % 7; // days back to Thursday (4)
    return new Date(year, month, lastDay.getDate() - offset);
  }
  const MONTHS = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const y = fromDate.getFullYear(),
    m = fromDate.getMonth();
  const thisExpiry = lastThursday(y, m);
  const msPerDay = 86400000;
  const dte = Math.round(
    (thisExpiry.getTime() - fromDate.getTime()) / msPerDay,
  );
  if (dte >= 21) {
    return { label: `${MONTHS[m]} ${thisExpiry.getDate()} (${dte} DTE)`, dte };
  }
  // Use next month's expiry
  const nextM = m === 11 ? 0 : m + 1;
  const nextY = m === 11 ? y + 1 : y;
  const nextExpiry = lastThursday(nextY, nextM);
  const dte2 = Math.round(
    (nextExpiry.getTime() - fromDate.getTime()) / msPerDay,
  );
  return {
    label: `${MONTHS[nextM]} ${nextExpiry.getDate()} (${dte2} DTE)`,
    dte: dte2,
  };
}

// Returns the last Thursday 3 calendar months from fromDate
function getNiftyQuarterlyExpiry(fromDate: Date): {
  label: string;
  dte: number;
} {
  function lastThursday(year: number, month: number): Date {
    const lastDay = new Date(year, month + 1, 0);
    const offset = (lastDay.getDay() - 4 + 7) % 7;
    return new Date(year, month, lastDay.getDate() - offset);
  }
  const MONTHS = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const targetMonth = (fromDate.getMonth() + 3) % 12;
  const targetYear =
    fromDate.getFullYear() + Math.floor((fromDate.getMonth() + 3) / 12);
  const expiry = lastThursday(targetYear, targetMonth);
  const dte = Math.round((expiry.getTime() - fromDate.getTime()) / 86400000);
  return {
    label: `${MONTHS[targetMonth]} ${expiry.getDate()} (${dte} DTE)`,
    dte,
  };
}

function getHedgeSignal(
  rsi2h: number,
  rsiDaily: number,
  portfolioValue: number,
  costBasis: number,
  niftySpot: number,
): HedgeSignal {
  const none = (label: string, explanation: string): HedgeSignal => ({
    shouldHedge: false,
    verdict: "HOLD",
    label,
    action: "No action needed",
    explanation,
    strategy: "NONE",
  });

  if (rsi2h < 70)
    return none(
      "No hedge needed",
      "2H RSI below 70. Market not extended \u2014 hold positions, no action needed.",
    );

  if (rsiDaily < 65)
    return {
      shouldHedge: false,
      verdict: "WAIT",
      label: "Wait \u2014 daily trend still OK",
      action: "Do nothing yet. Watch daily RSI.",
      explanation: `2H RSI ${rsi2h.toFixed(1)} elevated but Daily RSI ${rsiDaily.toFixed(1)} is still below 65. Short-term blip \u2014 selling calls now risks bleeding if the trend continues. Wait for Daily RSI > 65.`,
      strategy: "NONE",
    };

  // Round strikes to nearest 100 for liquidity (avoid thin 50-point strikes)
  const r100 = (n: number) => Math.round(n / 100) * 100;
  const lots = Math.floor(portfolioValue / 800000);

  if (lots < 1)
    return {
      shouldHedge: false,
      verdict: "WAIT",
      label: "Portfolio below hedge threshold",
      action: "Do not hedge yet \u2014 portfolio too small.",
      explanation: `Both RSIs extended but portfolio \u20b9${(portfolioValue / 100000).toFixed(1)}L is below the \u20b98L minimum for 1 lot. Selling calls on a smaller portfolio makes you net short U2014 you lose if market keeps rising. Keep accumulating.`,
      strategy: "NONE",
    };

  const gainPct =
    costBasis > 0 ? ((portfolioValue - costBasis) / costBasis) * 100 : 0;
  const monthly = getNiftyMonthlyExpiry(new Date());
  const quarterly = getNiftyQuarterlyExpiry(new Date());

  if (gainPct < 5) {
    // Light hedge \u2014 CE only at 8% OTM (enough room if market runs further)
    const ceStrike = r100(niftySpot * 1.08);
    const leg: CollarLeg = {
      seq: 1,
      action: "SELL",
      instrument: `NIFTY ${ceStrike} CE`,
      strike: ceStrike,
      type: "CE",
      lots,
      expiryLabel: monthly.label,
      dte: monthly.dte,
      purpose:
        "Collect premium \u00b7 light income hedge (gain < 5%, no put needed yet)",
    };
    return {
      shouldHedge: true,
      verdict: "SELL",
      label: `Sell ${lots} × NIFTY ${ceStrike} CE \u00b7 ${monthly.label}`,
      action: `Sell ${lots} lot${lots > 1 ? "s" : ""} NIFTY ${ceStrike} CE \u00b7 ${monthly.label}`,
      explanation: `Portfolio gain ${gainPct.toFixed(1)}% \u2014 not enough to justify a full collar yet. Sell the 8% OTM call to collect premium. If RSI keeps rising above 80 and gain crosses 5%, upgrade to full collar.`,
      strategy: "SELL_CE",
      gainPercent: gainPct,
      legs: [leg],
      strike: ceStrike,
      expiryLabel: monthly.label,
      lotsNow: lots,
      maxLots: lots,
    };
  }

  // Full Gain-Lock Collar
  const peFloor = r100(niftySpot * 0.96); // 4% below \u2014 your profit floor
  const peCap = r100(niftySpot * 0.9); // 10% below \u2014 black swan floor (sell to fund)
  const ceStrike = r100(niftySpot * 1.08); // 8% OTM \u2014 gives portfolio room to run

  const legs: CollarLeg[] = [
    {
      seq: 1,
      action: "BUY",
      instrument: `NIFTY ${peFloor} PE`,
      strike: peFloor,
      type: "PE",
      lots,
      expiryLabel: quarterly.label,
      dte: quarterly.dte,
      purpose: "Downside protection \u2014 locks your gain floor",
    },
    {
      seq: 2,
      action: "SELL",
      instrument: `NIFTY ${peCap} PE`,
      strike: peCap,
      type: "PE",
      lots,
      expiryLabel: quarterly.label,
      dte: quarterly.dte,
      purpose:
        "Funds the long put \u2014 you accept risk only below a crash level",
    },
    {
      seq: 3,
      action: "SELL",
      instrument: `NIFTY ${ceStrike} CE`,
      strike: ceStrike,
      type: "CE",
      lots,
      expiryLabel: monthly.label,
      dte: monthly.dte,
      purpose: "Monthly income \u2014 roll each month to self-fund the collar",
    },
  ];

  return {
    shouldHedge: true,
    verdict: "COLLAR",
    label: `Gain-Lock Collar \u00b7 ${gainPct.toFixed(1)}% gain \u00b7 floor ${peFloor}`,
    action: "Place 3 legs in sequence \u2014 steps below",
    explanation: `Portfolio up ${gainPct.toFixed(1)}% from cost basis. Both RSIs extended. Lock gains: buy ${peFloor} PE (3-month protection), sell ${peCap} PE to fund it, sell ${ceStrike} CE monthly for income. Portfolio can still run 8% before the call bites \u2014 and if it does, your portfolio gains offset the call loss.`,
    strategy: "COLLAR",
    gainPercent: gainPct,
    legs,
    strike: ceStrike,
    expiryLabel: monthly.label,
    lotsNow: lots,
    maxLots: lots,
  };
}

async function fetchRsi2h(symbol: string): Promise<{
  rsiValues: number[];
  currentPrice: number;
  prevClose: number;
} | null> {
  try {
    // Yahoo Finance does not support 2h natively — fetch 1H over 6mo and resample 2 bars → 1x 2H candle
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=1h&range=6mo&includePrePost=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      next: { revalidate: 300 }, // cache 5 min
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const q = result.indicators?.quote?.[0] ?? {};
    const timestamps: number[] = result.timestamp ?? [];
    const raw1hCandles = [];

    for (let i = 0; i < timestamps.length; i++) {
      const o = q.open[i],
        h = q.high[i],
        l = q.low[i],
        c = q.close[i],
        v = q.volume[i];
      if (c != null && !isNaN(c) && c > 0)
        raw1hCandles.push({
          time: timestamps[i],
          open: o ?? c,
          high: h ?? c,
          low: l ?? c,
          close: c,
          volume: v ?? 0,
        });
    }
    if (raw1hCandles.length < 40) return null;

    // Resample 1H → 2H (group every 2 candles)
    const candles2h = resampleCandles(raw1hCandles, 2);
    const closes = candles2h.map((c) => c.close);
    if (closes.length < 20) return null;

    const rsiValues = rsi(closes, 14);
    const currentPrice = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    return { rsiValues, currentPrice, prevClose };
  } catch {
    return null;
  }
}

async function fetchRsiDaily(symbol: string): Promise<number | null> {
  try {
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      next: { revalidate: 3600 }, // cache 1hr - daily bar doesn't change often
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const closes: number[] = (
      result.indicators?.quote?.[0]?.close ?? []
    ).filter((c: number | null) => c != null && !isNaN(c) && c > 0);
    if (closes.length < 20) return null;
    const rsiVals = rsi(closes, 14);
    return rsiVals.length > 0
      ? Math.round(rsiVals[rsiVals.length - 1] * 10) / 10
      : null;
  } catch {
    return null;
  }
}

// ── Demo mode overrides ───────────────────────────────────────────────────────
// Used for video demos only. Pass ?demo=oversold or ?demo=overbought in the URL.
const DEMO_PRESETS: Record<
  string,
  {
    rsi2h: number;
    prevRsi2h: number;
    rsiDaily: number;
    etfRsi: number;
    gainPct?: number; // if set, overrides real portfolio gain for hedge demo
  }
> = {
  oversold: { rsi2h: 22.4, prevRsi2h: 24.1, rsiDaily: 26.8, etfRsi: 21.5 },
  overbought: { rsi2h: 78.3, prevRsi2h: 75.6, rsiDaily: 76.4, etfRsi: 77.8 },
  // Shows the full 3-leg Gain-Lock Collar (requires gain >= 5%)
  collaring: {
    rsi2h: 81.2,
    prevRsi2h: 78.9,
    rsiDaily: 77.5,
    etfRsi: 80.1,
    gainPct: 8.4,
  },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols") ?? "";
  const marketSymbol = searchParams.get("market") ?? "^NSEI";
  const demoMode = searchParams.get("demo") ?? "";

  // Normalize symbols: append .NS if no dot and not an index
  function normalize(s: string): string {
    return !s.includes(".") && !s.startsWith("^") ? `${s}.NS` : s;
  }

  // Validate
  const rawSymbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (rawSymbols.length > 30)
    return NextResponse.json({ error: "Max 30 symbols" }, { status: 400 });

  const symbolRegex = /^[\^A-Z0-9.]{1,25}$/;
  for (const s of [...rawSymbols, marketSymbol]) {
    if (!symbolRegex.test(s))
      return NextResponse.json(
        { error: `Invalid symbol: ${s}` },
        { status: 400 },
      );
  }

  // Fetch market pulse (2H + Daily) + all ETF symbols in parallel
  const normalizedMarket = normalize(marketSymbol);
  const normalizedSymbols = rawSymbols.map(normalize);
  const allSymbols = [normalizedMarket, ...normalizedSymbols];
  const [results, rsiDailyMarket] = await Promise.all([
    Promise.all(allSymbols.map((s) => fetchRsi2h(s))),
    fetchRsiDaily(normalizedMarket),
  ]);

  // ── Market Pulse ──────────────────────────────────────────────
  const mktData = results[0];
  let marketPulse: MarketPulse | null = null;
  if (mktData && mktData.rsiValues.length >= 2) {
    const demo = DEMO_PRESETS[demoMode];
    const cur = demo
      ? demo.rsi2h
      : mktData.rsiValues[mktData.rsiValues.length - 1];
    const prev = demo
      ? demo.prevRsi2h
      : mktData.rsiValues[mktData.rsiValues.length - 2];
    const dir =
      cur > prev + 0.5 ? "rising" : cur < prev - 0.5 ? "falling" : "flat";
    const zone = getZone(cur);
    const dailyRsi = demo ? demo.rsiDaily : (rsiDailyMarket ?? 50);

    // Calculate portfolio value + cost basis from holdings.json for hedge sizing
    let portfolioValue = 0;
    let costBasis = 0;
    try {
      const holdingsData = JSON.parse(
        readFileSync(join(process.cwd(), "data", "holdings.json"), "utf-8"),
      );
      const holdings: Array<{ symbol: string; qty: number; avgCost: number }> =
        holdingsData.etfHoldings ?? [];
      for (const h of holdings) {
        costBasis += h.qty * h.avgCost;
        const idx2 = normalizedSymbols.indexOf(h.symbol);
        const d = idx2 >= 0 ? results[idx2 + 1] : undefined;
        portfolioValue += h.qty * (d ? d.currentPrice : h.avgCost);
      }
    } catch {
      /* file unavailable in some serverless environments — hedging falls back to no-data path */
    }

    // In demo mode, override costBasis to simulate the preset gain% if provided
    if (demo?.gainPct !== undefined && portfolioValue > 0) {
      costBasis = portfolioValue / (1 + demo.gainPct / 100);
    }

    marketPulse = {
      symbol: normalizedMarket,
      rsi2h: Math.round(cur * 10) / 10,
      prevRsi2h: Math.round(prev * 10) / 10,
      rsiDaily: dailyRsi,
      currentPrice: mktData.currentPrice,
      direction: dir,
      zone,
      interpretation: getInterpretation(zone, cur, dailyRsi, dir),
      deploySignal: getDeploySignal(cur, dailyRsi, 0),
      hedgeSignal: getHedgeSignal(
        cur,
        dailyRsi,
        portfolioValue,
        costBasis,
        mktData.currentPrice,
      ),
    };
  }

  // ── Per-ETF results ────────────────────────────────────────────────────────
  const etfResults: EtfRsiResult[] = rawSymbols.map((symbol, idx) => {
    const data = results[idx + 1];
    if (!data || data.rsiValues.length < 2) {
      return {
        symbol,
        currentPrice: 0,
        prevClose: 0,
        rsi2h: 0,
        prevRsi2h: 0,
        direction: "flat" as const,
        zone: "HOLD" as const,
        signal: "Data unavailable",
        coveredCallStrike: 0,
        error: "Insufficient data",
      };
    }
    const demo = DEMO_PRESETS[demoMode];
    const cur = demo ? demo.etfRsi : data.rsiValues[data.rsiValues.length - 1];
    const prev = demo
      ? demo.etfRsi + (demoMode === "oversold" ? 2 : -2)
      : data.rsiValues[data.rsiValues.length - 2];
    const dir: EtfRsiResult["direction"] =
      cur > prev + 0.5 ? "rising" : cur < prev - 0.5 ? "falling" : "flat";
    const zone = getZone(cur);
    return {
      symbol,
      currentPrice: Math.round(data.currentPrice * 100) / 100,
      prevClose: Math.round(data.prevClose * 100) / 100,
      rsi2h: Math.round(cur * 10) / 10,
      prevRsi2h: Math.round(prev * 10) / 10,
      direction: dir,
      zone,
      signal: getSignal(zone, dir),
      coveredCallStrike: Math.round(data.currentPrice * 1.05 * 20) / 20,
    };
  });

  return NextResponse.json({
    marketPulse,
    etfResults,
    fetchedAt: Date.now(),
    demoMode: demoMode || null,
  });
}
