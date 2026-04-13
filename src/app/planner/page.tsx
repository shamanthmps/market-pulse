"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { calculateRisk, RISK_RULES } from "@/lib/riskManager";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  PlusCircle,
} from "lucide-react";
import { analyzeSignals } from "@/lib/signals";
import { Candle } from "@/lib/indicators";

interface SignalFetch {
  loading: boolean;
  result: Awaited<ReturnType<typeof analyzeSignals>> | null;
  error: string | null;
}

export default function PlannerPage() {
  const { account, openPositions, trades, todayLoss, addPosition } = useStore();
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [entryPrice, setEntryPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [signalFetch, setSignalFetch] = useState<SignalFetch>({
    loading: false,
    result: null,
    error: null,
  });

  const openPositionsRisk = openPositions.reduce((s, p) => s + p.riskAmount, 0);

  const entry = parseFloat(entryPrice);
  const riskResult =
    !isNaN(entry) && signalFetch.result
      ? calculateRisk({
          accountSize: account.accountSize,
          riskPercent: account.riskPercent,
          entryPrice: entry,
          stopLoss: signalFetch.result.stopLoss,
          direction,
          openPositionsRisk,
          todayLoss,
        })
      : null;

  async function fetchSignals() {
    setSignalFetch({ loading: true, result: null, error: null });
    try {
      const sym = symbol.trim().toUpperCase();
      const res = await fetch(
        `/api/quote/${encodeURIComponent(sym)}?interval=1d&range=2y`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const candles: Candle[] = data.candles ?? [];
      if (candles.length < 210)
        throw new Error("Not enough historical data. Try a different symbol.");
      const result = analyzeSignals(candles);
      setEntryPrice(
        String(data.regularMarketPrice ?? candles[candles.length - 1].close),
      );
      setSignalFetch({ loading: false, result, error: null });
    } catch (e: unknown) {
      setSignalFetch({
        loading: false,
        result: null,
        error: (e as Error).message,
      });
    }
  }

  function enterTrade() {
    if (!riskResult || !riskResult.isValid || !signalFetch.result) return;
    const id = `${symbol}-${Date.now()}`;
    addPosition({
      id,
      symbol: symbol.trim().toUpperCase(),
      direction,
      entryPrice: parseFloat(entryPrice),
      stopLoss: signalFetch.result.stopLoss,
      targetPrice: riskResult.targetPrice,
      positionSize: riskResult.positionSize,
      riskAmount: riskResult.riskAmount,
      entryTime: Date.now() / 1000,
      signalScore: signalFetch.result.score,
      notes,
    });
    alert(
      `✅ Paper trade entered: ${direction} ${riskResult.positionSize} shares of ${symbol} @ ₹${entryPrice}`,
    );
    setSignalFetch({ loading: false, result: null, error: null });
    setNotes("");
  }

  const sig = signalFetch.result;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Trade Planner</h1>
        <p className="text-sm text-gray-500">
          Fetch signals → review risk → paper trade
        </p>
      </div>

      {/* Symbol & direction input */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">1. Select Symbol</h2>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-gray-500 block mb-1">
              Symbol (Yahoo Finance format)
            </label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. RELIANCE.NS, TCS.NS"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Direction
            </label>
            <div className="flex">
              {(["LONG", "SHORT"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  className={`px-4 py-2 text-sm font-medium border transition-colors ${
                    direction === d
                      ? d === "LONG"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-red-600 text-white border-red-600"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  } ${d === "LONG" ? "rounded-l-lg" : "rounded-r-lg"}`}
                >
                  {d === "LONG" ? (
                    <TrendingUp className="w-4 h-4 inline mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 inline mr-1" />
                  )}
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchSignals}
              disabled={signalFetch.loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {signalFetch.loading ? "Fetching…" : "Analyse Signals"}
            </button>
          </div>
        </div>
        {signalFetch.error && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <XCircle className="w-4 h-4" /> {signalFetch.error}
          </p>
        )}
      </div>

      {/* Signal result */}
      {sig && (
        <div
          className={`bg-white border rounded-xl p-5 space-y-4 ${sig.score >= 4 ? "border-indigo-300" : "border-amber-300"}`}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">2. Signal Analysis</h2>
            <div className="flex items-center gap-2">
              <span
                className={`text-lg font-bold px-3 py-1 rounded-lg border ${sig.score >= 5 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : sig.score >= 4 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}
              >
                {sig.score}/{sig.maxScore}
              </span>
              <span
                className={`font-bold text-sm ${sig.direction === "LONG" ? "text-emerald-600" : sig.direction === "SHORT" ? "text-red-600" : "text-gray-500"}`}
              >
                {sig.direction}
              </span>
            </div>
          </div>

          {sig.score < 4 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-sm text-amber-700 font-medium">
                Score {sig.score}/6 - Below minimum threshold of 4.{" "}
                <strong>Do not trade this setup.</strong>
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {Object.entries(sig.breakdown).map(([key, val]) => (
              <div
                key={key}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm ${val ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-gray-50 border-gray-200 text-gray-400"}`}
              >
                {val ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                <span className="text-xs font-medium">
                  {
                    {
                      emaTrend: "EMA Trend",
                      emaStack: "EMA Stack",
                      rsiMomentum: "RSI Zone",
                      macdSignal: "MACD Cross",
                      supertrendSignal: "Supertrend",
                      volumeConfirm: "Volume",
                    }[key]
                  }
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Entry (market)</p>
              <p className="font-semibold">₹{sig.entryPrice.toFixed(2)}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xs text-red-500">ATR Stop Loss (2×ATR)</p>
              <p className="font-semibold text-red-700">
                ₹{sig.stopLoss.toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">ATR Value</p>
              <p className="font-semibold">{sig.atrValue.toFixed(2)} pts</p>
            </div>
          </div>
        </div>
      )}

      {/* Risk calculator */}
      {sig && sig.score >= 4 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">
            3. Position Sizing & Risk
          </h2>
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Entry Price (₹)
            </label>
            <input
              type="number"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {riskResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {[
                  {
                    label: "Shares to Buy",
                    value: String(riskResult.positionSize),
                    color: "text-indigo-700",
                  },
                  {
                    label: "Risk Amount",
                    value: `₹${riskResult.riskAmount.toLocaleString("en-IN")}`,
                    color: "text-red-600",
                  },
                  {
                    label: "Target (1:2)",
                    value: `₹${riskResult.targetPrice.toFixed(2)}`,
                    color: "text-emerald-600",
                  },
                  {
                    label: "Reward Potential",
                    value: `₹${riskResult.rewardAmount.toLocaleString("en-IN")}`,
                    color: "text-emerald-600",
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className={`font-bold text-lg ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {riskResult.isValid ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm text-emerald-700 font-medium">
                    All risk rules passed. Trade is valid.
                  </p>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  {riskResult.rejectionReasons.map((r, i) => (
                    <p
                      key={i}
                      className="text-sm text-red-700 flex items-center gap-1"
                    >
                      <XCircle className="w-4 h-4 shrink-0" /> {r}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {riskResult?.isValid && (
            <>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why are you taking this trade? Any observations?"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={enterTrade}
                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700"
              >
                <PlusCircle className="w-4 h-4" /> Enter Paper Trade
              </button>
            </>
          )}
        </div>
      )}

      {/* Account context */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p>
          Account: ₹{account.accountSize.toLocaleString("en-IN")} · Risk/trade:{" "}
          {account.riskPercent}% (₹
          {((account.accountSize * account.riskPercent) / 100).toLocaleString(
            "en-IN",
          )}
          )
        </p>
        <p>
          Open positions: {openPositions.length}/{account.maxOpenPositions} ·
          Portfolio risk: ₹{openPositionsRisk.toLocaleString("en-IN")}
        </p>
        <p>
          Daily loss today: ₹{todayLoss.toLocaleString("en-IN")} / limit ₹
          {(
            (account.accountSize * RISK_RULES.DAILY_LOSS_LIMIT_PERCENT) /
            100
          ).toLocaleString("en-IN")}
        </p>
      </div>
    </div>
  );
}
