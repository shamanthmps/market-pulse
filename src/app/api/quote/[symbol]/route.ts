/**
 * GET /api/quote/[symbol]
 * Proxies Yahoo Finance chart API — returns OHLCV candles.
 * Query params: interval (1m/5m/15m/1h/1d), range (1d/5d/1mo/3mo/6mo/1y/2y)
 */

import { NextRequest, NextResponse } from "next/server";

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const interval = searchParams.get("interval") ?? "1d";
  const range = searchParams.get("range") ?? "6mo";

  // Validate symbol — only allow alphanumeric + . and ^
  if (!/^[A-Z0-9^.]+$/i.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  // Validate interval whitelist
  const allowedIntervals = ["1m", "5m", "15m", "30m", "1h", "1d", "1wk"];
  const allowedRanges = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"];
  if (!allowedIntervals.includes(interval) || !allowedRanges.includes(range)) {
    return NextResponse.json({ error: "Invalid interval or range" }, { status: 400 });
  }

  try {
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 60 }, // cache 60s for EOD data
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: "No data returned" }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: number[] = quote.open ?? [];
    const highs: number[] = quote.high ?? [];
    const lows: number[] = quote.low ?? [];
    const closes: number[] = quote.close ?? [];
    const volumes: number[] = quote.volume ?? [];

    const candles = timestamps
      .map((t, i) => ({
        time: t,
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
        volume: volumes[i] ?? 0,
      }))
      .filter(
        (c) =>
          c.open != null &&
          c.high != null &&
          c.low != null &&
          c.close != null &&
          !isNaN(c.close)
      );

    const meta = result.meta ?? {};

    return NextResponse.json({
      symbol: meta.symbol ?? symbol,
      currency: meta.currency ?? "INR",
      regularMarketPrice: meta.regularMarketPrice,
      previousClose: meta.previousClose ?? meta.chartPreviousClose,
      candles,
    });
  } catch (err) {
    console.error("[quote API error]", err);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
