"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";

interface ScanResult {
  symbol: string;
  score: number;
  maxScore: number;
  direction: string;
  entryPrice?: number;
  stopLoss?: number;
  atrValue?: number;
  breakdown?: Record<string, boolean>;
  error?: string;
}

const SIGNAL_LABELS: Record<string, string> = {
  emaTrend: "EMA Trend",
  emaStack: "EMA Stack",
  rsiMomentum: "RSI Zone",
  macdSignal: "MACD",
  supertrendSignal: "Supertrend",
  volumeConfirm: "Volume",
};

const TIMEFRAMES = [
  { label: "Daily", interval: "1d", range: "1y" },
  { label: "1H", interval: "1h", range: "3mo" },
  { label: "15m", interval: "15m", range: "1mo" },
  { label: "5m", interval: "5m", range: "5d" },
];

export default function ScannerPage() {
  const { watchlist } = useStore();
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [tf, setTf] = useState(TIMEFRAMES[0]);

  async function runScan() {
    setLoading(true);
    const symbols = watchlist.map((w) => w.symbol).join(",");
    try {
      const res = await fetch(
        `/api/scan?symbols=${encodeURIComponent(symbols)}&interval=${tf.interval}&range=${tf.range}`,
      );
      const data = await res.json();
      setResults(data.scanned ?? []);
      setScannedAt(data.scannedAt ?? Date.now());
    } catch {
      alert("Scan failed. Check your internet connection.");
    } finally {
      setLoading(false);
    }
  }

  function scoreColor(score: number) {
    if (score >= 5) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (score >= 4) return "text-indigo-700 bg-indigo-50 border-indigo-200";
    if (score >= 3) return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-gray-500 bg-gray-50 border-gray-200";
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Signal Scanner</h1>
          <p className="text-sm text-gray-500">
            Multi-signal confluence scan - trade only when score &gt;= 4/6
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Timeframe selector */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.interval}
                onClick={() => setTf(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tf.interval === t.interval
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={runScan}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Scanning…" : "Run Scan"}
          </button>
        </div>
      </div>

      {scannedAt && (
        <p className="text-xs text-gray-400">
          Last scanned: {new Date(scannedAt).toLocaleTimeString()} ·{" "}
          {watchlist.length} symbols · {tf.label} timeframe
        </p>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span>
          Strong (5-6)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-indigo-100 border border-indigo-300"></span>
          Valid (4)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span>
          Weak (3)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gray-100 border border-gray-300"></span>
          No setup (&lt;3)
        </span>
      </div>

      {results.length === 0 && !loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
          <p className="text-lg font-medium">No scan results yet</p>
          <p className="text-sm mt-1">
            Click &quot;Run Scan&quot; to analyse your watchlist
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid gap-3">
          {results.map((r) => (
            <div
              key={r.symbol}
              className={`bg-white border rounded-xl p-4 ${r.score >= 4 ? "border-indigo-200" : "border-gray-200"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900">
                    {r.symbol.replace(".NS", "").replace(".BO", "")}
                  </span>
                  {r.direction !== "NEUTRAL" && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${r.direction === "LONG" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                    >
                      {r.direction === "LONG" ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {r.direction}
                    </span>
                  )}
                  {r.direction === "NEUTRAL" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-500">
                      <Minus className="w-3 h-3" /> NEUTRAL
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {r.entryPrice && (
                    <span className="text-sm text-gray-600">
                      ₹{r.entryPrice.toFixed(2)}
                    </span>
                  )}
                  {r.stopLoss && (
                    <span className="text-xs text-red-500">
                      SL ₹{r.stopLoss.toFixed(2)}
                    </span>
                  )}
                  <span
                    className={`text-sm font-bold px-3 py-1 rounded-lg border ${scoreColor(r.score)}`}
                  >
                    {r.score}/{r.maxScore ?? 6}
                  </span>
                </div>
              </div>

              {/* Signal breakdown */}
              {r.breakdown && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {Object.entries(r.breakdown).map(([key, val]) => (
                    <span
                      key={key}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${
                        val
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-gray-50 border-gray-200 text-gray-400"
                      }`}
                    >
                      {val ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {SIGNAL_LABELS[key] ?? key}
                    </span>
                  ))}
                </div>
              )}
              {r.error && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {r.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
