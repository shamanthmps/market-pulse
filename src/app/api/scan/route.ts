/**
 * GET /api/scan
 * Scans a list of symbols and returns signal scores.
 * Query: symbols=RELIANCE.NS,TCS.NS,INFY.NS&interval=1d&range=1y
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzeSignals } from "@/lib/signals";
import { Candle } from "@/lib/indicators";

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

async function fetchCandles(symbol: string, interval: string, range: string): Promise<Candle[]> {
  const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  return timestamps
    .map((t: number, i: number) => ({
      time: t,
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
      volume: q.volume[i] ?? 0,
    }))
    .filter((c: Candle) => c.close != null && !isNaN(c.close));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols") ?? "";
  const interval = searchParams.get("interval") ?? "1d";
  const range = searchParams.get("range") ?? "1y";

  const allowedIntervals = ["5m", "15m", "1h", "1d"];
  const allowedRanges = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y"];
  if (!allowedIntervals.includes(interval) || !allowedRanges.includes(range)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  // Split, validate, and cap symbols
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9^.]{1,20}$/.test(s))
    .slice(0, 30); // cap at 30 to avoid abuse

  if (symbols.length === 0) {
    return NextResponse.json({ error: "No valid symbols provided" }, { status: 400 });
  }

  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const candles = await fetchCandles(symbol, interval, range);
      if (candles.length < 210) {
        return { symbol, error: "Insufficient data", score: 0, direction: "NEUTRAL" };
      }
      const signal = analyzeSignals(candles);
      return {
        symbol,
        score: signal.score,
        maxScore: signal.maxScore,
        direction: signal.direction,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        atrValue: signal.atrValue,
        breakdown: signal.breakdown,
      };
    })
  );

  const scanned = results.map((r, i) => {
    if (r.status === "rejected") {
      return { symbol: symbols[i], error: "Fetch failed", score: 0, direction: "NEUTRAL" };
    }
    return r.value;
  });

  // Sort by score descending — best setups first
  scanned.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return NextResponse.json({ scanned, scannedAt: Date.now() });
}
