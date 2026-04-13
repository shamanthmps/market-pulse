"use client";
import { useState } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Legend,
} from "recharts";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  BarChart2,
  Layers,
} from "lucide-react";
import { format } from "date-fns";
import type { BacktestResult, BacktestTrade } from "@/lib/backtest";
import { STRATEGIES, DEFAULT_STRATEGY_ID } from "@/lib/strategies";

// ── Portfolio legs — locked-in conclusion ─────────────────────────────────────
interface PortfolioLeg {
  symbol: string;
  label: string;
  strategy: string;
  sector: string;
  color: string;
  interval: string;
  range: string;
}
const PORTFOLIO_LEGS: PortfolioLeg[] = [
  {
    symbol: "ONGC.NS",
    label: "ONGC",
    strategy: "ttm-squeeze",
    sector: "Oil PSU",
    color: "#f97316",
    interval: "1h",
    range: "2y",
  },
  {
    symbol: "TRENT.NS",
    label: "TRENT",
    strategy: "utbot-linreg",
    sector: "Consumer",
    color: "#8b5cf6",
    interval: "1h",
    range: "2y",
  },
  {
    symbol: "ADANIPORTS.NS",
    label: "ADANIPORTS",
    strategy: "utbot-linreg",
    sector: "Infrastructure",
    color: "#0ea5e9",
    interval: "1h",
    range: "2y",
  },
  {
    symbol: "BANKBEES.NS",
    label: "BANKBEES",
    strategy: "ttm-squeeze",
    sector: "Banking Index",
    color: "#10b981",
    interval: "1h",
    range: "2y",
  },
];
const COMBINED_COLOR = "#1e40af";

// ── Config ────────────────────────────────────────────────────────────────────
const TIMEFRAMES = [
  { label: "Daily", interval: "1d", range: "2y", commission: 0.2, note: "" },
  { label: "Weekly", interval: "1wk", range: "5y", commission: 0.2, note: "" },
  {
    label: "4H",
    interval: "4h",
    range: "1y",
    commission: 0.1,
    note: "1H resampled ×4",
  },
  {
    label: "2H",
    interval: "2h",
    range: "6mo",
    commission: 0.1,
    note: "1H resampled ×2",
  },
  { label: "1H", interval: "1h", range: "3mo", commission: 0.1, note: "" },
  { label: "15m", interval: "15m", range: "1mo", commission: 0.1, note: "" },
  { label: "5m", interval: "5m", range: "5d", commission: 0.1, note: "" },
];

const POPULAR_SYMBOLS = [
  "RELIANCE.NS",
  "TCS.NS",
  "HDFCBANK.NS",
  "INFY.NS",
  "ICICIBANK.NS",
  "SBIN.NS",
  "WIPRO.NS",
  "TATAMOTORS.NS",
  "ADANIENT.NS",
  "BAJFINANCE.NS",
];

const ETF_SYMBOLS = [
  "NIFTYBEES.NS",
  "BANKBEES.NS",
  "ITBEES.NS",
  "GOLDBEES.NS",
  "MONIFTY500.NS",
  "MIDCAPIETF.NS",
  "SMALLCAP.NS",
  "LOWVOLIETF.NS",
  "MOM30IETF.NS",
  "MON100.NS",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n}%`;
}
function inr(n: number) {
  return `₹${Math.abs(n).toLocaleString("en-IN")}`;
}
function color(n: number) {
  return n >= 0 ? "text-emerald-600" : "text-red-600";
}
function bgColor(n: number) {
  if (n > 500) return "bg-emerald-700 text-white";
  if (n > 0) return "bg-emerald-100 text-emerald-800";
  if (n < -500) return "bg-red-700 text-white";
  if (n < 0) return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-500";
}

function StatTile({
  label,
  value,
  sub,
  valColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valColor?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-xl font-bold mt-1 ${valColor ?? "text-gray-900"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Monthly heatmap ───────────────────────────────────────────────────────────
function MonthlyHeatmap({ data }: { data: BacktestResult["monthlyPnl"] }) {
  if (!data.length) return null;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const years = [...new Set(data.map((d) => d.year))].sort();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="font-semibold text-gray-800 mb-4">Monthly P&L Heatmap</h2>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1 text-gray-400 font-medium text-left">
                Year
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className="px-2 py-1 text-gray-400 font-medium w-14 text-center"
                >
                  {m}
                </th>
              ))}
              <th className="px-2 py-1 text-gray-400 font-medium text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {years.map((yr) => {
              const yearTotal = data
                .filter((d) => d.year === yr)
                .reduce((s, d) => s + d.pnl, 0);
              return (
                <tr key={yr}>
                  <td className="px-2 py-1 font-medium text-gray-700">{yr}</td>
                  {months.map((_, mi) => {
                    const cell = data.find(
                      (d) => d.year === yr && d.month === mi + 1,
                    );
                    return (
                      <td key={mi} className="px-1 py-1">
                        {cell ? (
                          <div
                            className={`rounded px-1 py-1 text-center font-medium ${bgColor(cell.pnl)}`}
                            title={`${cell.trades} trades`}
                          >
                            {cell.pnl >= 0 ? "+" : ""}
                            {Math.round(cell.pnl / 1000)}k
                          </div>
                        ) : (
                          <div className="px-1 py-1 text-center text-gray-200">
                            -
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td
                    className={`px-2 py-1 font-bold text-right ${color(yearTotal)}`}
                  >
                    {yearTotal >= 0 ? "+" : ""}
                    {inr(Math.round(yearTotal))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Portfolio Simulation ──────────────────────────────────────────────────────
type PortfolioResult =
  | (BacktestResult & { symbol: string; totalCandles: number })
  | null;

function LegCard({
  leg,
  result,
}: {
  leg: PortfolioLeg;
  result: PortfolioResult;
}) {
  if (!result)
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-24 mb-2" />
        <div className="h-8 bg-gray-100 rounded w-32" />
      </div>
    );
  const mo = result.monthlyPnl;
  const prof = mo.filter((m) => m.pnl > 0).length;
  const avg = mo.length
    ? Math.round(mo.reduce((s, m) => s + m.pnl, 0) / mo.length)
    : 0;
  return (
    <div
      className="bg-white border-2 rounded-xl p-4"
      style={{ borderColor: leg.color }}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded text-white"
            style={{ background: leg.color }}
          >
            {leg.label}
          </span>
          <span className="ml-2 text-xs text-gray-400">{leg.sector}</span>
        </div>
        <span className="text-xs text-gray-400">
          {STRATEGIES.find((s) => s.id === leg.strategy)?.pill}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
        <div>
          <span className="text-xs text-gray-400">Net P&L</span>
          <p
            className={`font-bold ${result.netPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {result.netPnl >= 0 ? "+" : ""}₹
            {Math.abs(result.netPnl).toLocaleString("en-IN")}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-400">Avg / Month</span>
          <p
            className={`font-bold ${avg >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {avg >= 0 ? "+" : ""}₹{Math.abs(avg).toLocaleString("en-IN")}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-400">Win Rate</span>
          <p className="font-semibold text-gray-700">{result.winRate}%</p>
        </div>
        <div>
          <span className="text-xs text-gray-400">Profitable months</span>
          <p className="font-semibold text-gray-700">
            {prof}/{mo.length}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-400">Max Drawdown</span>
          <p className="font-semibold text-red-600">
            ₹{result.maxDrawdown.toLocaleString("en-IN")}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-400">Trades</span>
          <p className="font-semibold text-gray-700">{result.totalTrades}</p>
        </div>
      </div>
    </div>
  );
}

function PortfolioSimulation({
  equity,
  risk,
}: {
  equity: number;
  risk: number;
}) {
  const [results, setResults] = useState<PortfolioResult[]>([
    null,
    null,
    null,
    null,
  ]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  async function runAll() {
    setLoading(true);
    setRan(false);
    setResults([null, null, null, null]);
    const fetched = await Promise.all(
      PORTFOLIO_LEGS.map(async (leg) => {
        try {
          const params = new URLSearchParams({
            symbol: leg.symbol,
            interval: leg.interval,
            range: leg.range,
            risk: String(risk),
            equity: String(equity),
            strategy: leg.strategy,
          });
          const res = await fetch(`/api/backtest?${params}`);
          if (!res.ok) return null;
          return res.json() as Promise<
            BacktestResult & { symbol: string; totalCandles: number }
          >;
        } catch {
          return null;
        }
      }),
    );
    setResults(fetched);
    setLoading(false);
    setRan(true);
  }

  // Combined equity curve: sum gains/losses across all 4 legs by bar-position index
  const combinedCurve = (() => {
    const valid = results.filter(
      (r): r is NonNullable<PortfolioResult> =>
        r !== null && r.equityCurve.length > 0,
    );
    if (valid.length === 0) return [];
    const minLen = Math.min(...valid.map((r) => r.equityCurve.length));
    return Array.from({ length: minLen }, (_, i) => {
      const combined = valid.reduce(
        (sum, r) => sum + (r.equityCurve[i].equity - equity),
        equity * valid.length,
      );
      return { bar: i, combined };
    });
  })();

  // Per-leg % return curves, aligned by bar position
  const overlayCurves = results.map((r, idx) => {
    if (!r || r.equityCurve.length === 0) return [];
    return r.equityCurve.map((p, i) => ({
      bar: i,
      pct: parseFloat((((p.equity - equity) / equity) * 100).toFixed(2)),
      legIdx: idx,
    }));
  });

  // Merge overlay curves into single data array for recharts
  const maxLen = Math.max(...overlayCurves.map((c) => c.length), 0);
  const mergedOverlay = Array.from({ length: maxLen }, (_, i) => {
    const pt: Record<string, number> = { bar: i };
    overlayCurves.forEach((c, idx) => {
      if (c[i]) pt[`leg${idx}`] = c[i].pct;
    });
    return pt;
  });

  // Combined summary stats
  const validResults = results.filter(
    (r): r is NonNullable<PortfolioResult> => r !== null,
  );
  const allMonthlyAvg = validResults.map((r) => {
    const mo = r.monthlyPnl;
    return mo.length ? mo.reduce((s, m) => s + m.pnl, 0) / mo.length : 0;
  });
  const totalAvgMo = Math.round(allMonthlyAvg.reduce((s, v) => s + v, 0));
  const totalNet = validResults.reduce((s, r) => s + r.netPnl, 0);
  const totalDeploy = equity * PORTFOLIO_LEGS.length;
  const totalRetPct =
    totalDeploy > 0
      ? parseFloat(((totalNet / totalDeploy) * 100).toFixed(1))
      : 0;
  const moRetPct =
    totalDeploy > 0
      ? parseFloat(((totalAvgMo / totalDeploy) * 100).toFixed(2))
      : 0;

  return (
    <div className="space-y-6">
      {/* Header + run button */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 text-lg">
              Portfolio Simulation
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              4-leg diversified portfolio · 1H · 2y walk-forward ·{" "}
              {equity === 100000 ? "₹1L" : `₹${(equity / 100000).toFixed(1)}L`}{" "}
              per leg · Total deployed: ₹{(totalDeploy / 100000).toFixed(0)}L ·
              Risk {risk}% per trade
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {PORTFOLIO_LEGS.map((leg) => (
                <span
                  key={leg.symbol}
                  className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border font-medium"
                  style={{ borderColor: leg.color, color: leg.color }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: leg.color }}
                  />
                  {leg.label} ·{" "}
                  {STRATEGIES.find((s) => s.id === leg.strategy)?.pill} ·{" "}
                  {leg.sector}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={runAll}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Running 4 legs…" : ran ? "Re-run" : "Run Portfolio"}
          </button>
        </div>
      </div>

      {/* Leg cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {PORTFOLIO_LEGS.map((leg, i) => (
          <LegCard
            key={leg.symbol}
            leg={leg}
            result={loading ? null : results[i]}
          />
        ))}
      </div>

      {/* Combined summary */}
      {ran && validResults.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-5">
          <h3 className="font-semibold text-indigo-800 mb-4">
            Combined Portfolio
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">
                Total Net P&L
              </p>
              <p
                className={`text-2xl font-bold ${totalNet >= 0 ? "text-emerald-700" : "text-red-700"}`}
              >
                {totalNet >= 0 ? "+" : ""}₹
                {Math.abs(totalNet).toLocaleString("en-IN")}
              </p>
            </div>
            <div>
              <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">
                Avg / Month
              </p>
              <p
                className={`text-2xl font-bold ${totalAvgMo >= 0 ? "text-emerald-700" : "text-red-700"}`}
              >
                {totalAvgMo >= 0 ? "+" : ""}₹
                {Math.abs(totalAvgMo).toLocaleString("en-IN")}
              </p>
            </div>
            <div>
              <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">
                Monthly Return
              </p>
              <p
                className={`text-2xl font-bold ${moRetPct >= 0 ? "text-emerald-700" : "text-red-700"}`}
              >
                {moRetPct >= 0 ? "+" : ""}
                {moRetPct}%
              </p>
              <p className="text-xs text-indigo-400 mt-0.5">
                on ₹{(totalDeploy / 100000).toFixed(0)}L
              </p>
            </div>
            <div>
              <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">
                2Y Total Return
              </p>
              <p
                className={`text-2xl font-bold ${totalRetPct >= 0 ? "text-emerald-700" : "text-red-700"}`}
              >
                {totalRetPct >= 0 ? "+" : ""}
                {totalRetPct}%
              </p>
            </div>
            <div>
              <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">
                Legs Active
              </p>
              <p className="text-2xl font-bold text-indigo-700">
                {validResults.length}/4
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Overlay equity curve — % return per leg */}
      {ran && mergedOverlay.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-800 mb-1">
            Equity Curves - % Return per Leg
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Each curve starts at 0%. Divergence shows diversification benefit -
            legs moving independently.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mergedOverlay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="bar"
                tick={{ fontSize: 10 }}
                label={{
                  value: "Bar (1H)",
                  position: "insideBottom",
                  offset: -4,
                  fontSize: 11,
                }}
              />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v, name) => {
                  const idx = parseInt((name as string).replace("leg", ""));
                  return [`${v}%`, PORTFOLIO_LEGS[idx]?.label ?? name];
                }}
              />
              <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
              <Legend
                formatter={(value) => {
                  const idx = parseInt(value.replace("leg", ""));
                  const leg = PORTFOLIO_LEGS[idx];
                  return `${leg?.label} (${leg?.sector})`;
                }}
              />
              {PORTFOLIO_LEGS.map((leg, i) => (
                <Line
                  key={i}
                  type="monotone"
                  dataKey={`leg${i}`}
                  stroke={leg.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Combined portfolio equity curve */}
      {ran && combinedCurve.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-800 mb-1">
            Combined Portfolio Equity Curve
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Sum of all 4 legs. Base = ₹{(totalDeploy / 100000).toFixed(0)}L
            deployed. Smoother than any single leg - diverging legs cancel each
            other's drawdowns.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={combinedCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="bar"
                tick={{ fontSize: 10 }}
                label={{
                  value: "Bar (1H)",
                  position: "insideBottom",
                  offset: -4,
                  fontSize: 11,
                }}
              />
              <YAxis
                tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(v) => [
                  `₹${Number(v).toLocaleString("en-IN")}`,
                  "Portfolio",
                ]}
              />
              <ReferenceLine
                y={totalDeploy}
                stroke="#9ca3af"
                strokeDasharray="4 4"
                label={{
                  value: "Deployed Capital",
                  position: "right",
                  fontSize: 10,
                }}
              />
              <Area
                type="monotone"
                dataKey="combined"
                stroke={COMBINED_COLOR}
                fill="#dbeafe"
                strokeWidth={2.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BacktestPage() {
  const [mode, setMode] = useState<"single" | "portfolio">("single");
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [tfIdx, setTfIdx] = useState(0);
  const [equity, setEquity] = useState(100000);
  const [risk, setRisk] = useState(1);
  const [strategyId, setStrategyId] = useState(DEFAULT_STRATEGY_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    (BacktestResult & { symbol: string; totalCandles: number }) | null
  >(null);
  const [showTrades, setShowTrades] = useState(false);

  const tf = TIMEFRAMES[tfIdx];

  async function runBacktest() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({
        symbol,
        interval: tf.interval,
        range: tf.range,
        risk: String(risk),
        equity: String(equity),
        strategy: strategyId,
      });
      const res = await fetch(`/api/backtest?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unknown error");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header + mode tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Backtesting</h1>
          <p className="text-sm text-gray-500">
            Walk-forward simulation · No look-ahead bias · Entry at next-bar
            open · ATR stops · 1:2 R:R target
          </p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          <button
            onClick={() => setMode("single")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === "single" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            <BarChart2 className="w-4 h-4" /> Single
          </button>
          <button
            onClick={() => setMode("portfolio")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === "portfolio" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Layers className="w-4 h-4" /> Portfolio
          </button>
        </div>
      </div>

      {/* Portfolio mode */}
      {mode === "portfolio" && (
        <PortfolioSimulation equity={equity} risk={risk} />
      )}

      {/* Single mode */}
      {mode === "single" && (
        <>
          {/* Config panel */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Configuration</h2>
            <div className="flex flex-wrap gap-4 items-end">
              {/* Symbol */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Symbol
                </label>
                <div className="flex gap-2">
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    onBlur={(e) => {
                      // Auto-append .NS if user forgot the exchange suffix
                      const v = e.target.value.trim().toUpperCase();
                      if (v && !v.includes(".") && !v.startsWith("^"))
                        setSymbol(`${v}.NS`);
                    }}
                    placeholder="e.g. NIFTYBEES.NS"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <select
                    onChange={(e) => setSymbol(e.target.value)}
                    value=""
                    className="border border-gray-300 rounded-lg px-2 py-2 text-xs text-gray-600"
                  >
                    <option value="">Quick pick…</option>
                    <optgroup
                      label={
                        strategyId === "etf-dip-buy" ? "▼ ETFs" : "▼ Stocks"
                      }
                    >
                      {(strategyId === "etf-dip-buy"
                        ? ETF_SYMBOLS
                        : POPULAR_SYMBOLS
                      ).map((s) => (
                        <option key={s} value={s}>
                          {s.replace(".NS", "")}
                        </option>
                      ))}
                    </optgroup>
                    {strategyId === "etf-dip-buy" && (
                      <optgroup label="▼ Stocks">
                        {POPULAR_SYMBOLS.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(".NS", "")}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              {/* Timeframe */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Timeframe
                </label>
                <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                  {TIMEFRAMES.map((t, i) => (
                    <button
                      key={t.interval}
                      onClick={() => setTfIdx(i)}
                      title={t.note || undefined}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex flex-col items-center leading-tight ${
                        tfIdx === i
                          ? "bg-white text-indigo-700 shadow-sm"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      {t.label}
                      {t.note && (
                        <span className="text-[9px] opacity-60 font-normal">
                          {t.note}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Starting Capital (₹)
                </label>
                <input
                  type="number"
                  value={equity}
                  min={10000}
                  step={10000}
                  onChange={(e) => setEquity(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Risk */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Risk per Trade (%)
                </label>
                <input
                  type="number"
                  value={risk}
                  min={0.1}
                  max={2}
                  step={0.1}
                  onChange={(e) => setRisk(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Commission info */}
              <div className="text-xs text-gray-400 pb-2">
                Commission: {tf.commission}% round-trip
                <br />
                Range: {tf.range}
              </div>

              <button
                onClick={runBacktest}
                disabled={loading}
                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
                {loading ? "Running…" : "Run Backtest"}
              </button>
            </div>

            {/* Strategy selector */}
            <div className="mt-4">
              <label className="text-xs text-gray-500 font-medium uppercase tracking-wide block mb-2">
                Strategy
              </label>
              <div className="flex flex-wrap gap-2">
                {STRATEGIES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setStrategyId(s.id);
                      setResult(null);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm border transition-all ${
                      strategyId === s.id
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-700"
                    }`}
                  >
                    <span className="font-semibold">{s.name}</span>
                    <span
                      className={`ml-2 text-xs px-1.5 py-0.5 rounded ${strategyId === s.id ? "bg-indigo-500 text-indigo-100" : "bg-gray-100 text-gray-500"}`}
                    >
                      {s.pill}
                    </span>
                  </button>
                ))}
              </div>
              {/* tagline for active strategy */}
              <p className="mt-1.5 text-xs text-gray-400 italic">
                {STRATEGIES.find((s) => s.id === strategyId)?.tagline}
              </p>
            </div>

            {/* Methodology note */}
            <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex gap-2">
              <Info className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
              <p className="text-xs text-indigo-700">
                {STRATEGIES.find((s) => s.id === strategyId)?.methodologyNote}{" "}
                &middot; No look-ahead bias &middot; Entry at next-bar open
                &middot; Commission {tf.commission}% included.
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2 text-red-700 text-sm">
              <XCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {result && (
            <>
              {/* Headline metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatTile
                  label="Net Return"
                  value={pct(result.netReturnPct)}
                  sub={`${inr(result.netPnl)} on ${inr(equity)}`}
                  valColor={color(result.netReturnPct)}
                />
                <StatTile
                  label="Win Rate"
                  value={`${result.winRate}%`}
                  sub={`${result.wins}W / ${result.losses}L of ${result.totalTrades}`}
                  valColor={
                    result.winRate >= 50 ? "text-emerald-600" : "text-red-600"
                  }
                />
                <StatTile
                  label="Profit Factor"
                  value={String(result.profitFactor)}
                  sub="Gross profit ÷ gross loss"
                  valColor={
                    result.profitFactor >= 1.5
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }
                />
                <StatTile
                  label="Expectancy"
                  value={`${result.expectancy}R`}
                  sub="Avg R-multiple per trade"
                  valColor={
                    result.expectancy > 0 ? "text-emerald-600" : "text-red-600"
                  }
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatTile
                  label="Max Drawdown"
                  value={inr(result.maxDrawdown)}
                  sub={`${result.maxDrawdownPct}% of peak`}
                  valColor="text-red-600"
                />
                <StatTile
                  label="Sharpe Ratio"
                  value={String(result.sharpeRatio)}
                  sub="R-adjusted"
                  valColor={
                    result.sharpeRatio >= 1
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }
                />
                <StatTile
                  label="Avg Win / Loss"
                  value={`${inr(result.avgWin)} / ${inr(result.avgLoss)}`}
                  sub={`Ratio: ${result.avgLoss > 0 ? (result.avgWin / result.avgLoss).toFixed(2) : "∞"}`}
                />
                <StatTile
                  label="Signal Frequency"
                  value={`${result.signalFrequency}% of bars`}
                  sub={`${result.totalTrades} trades / ${result.totalBarsScanned} bars`}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatTile
                  label="Consec. Wins/Losses"
                  value={`${result.maxConsecWins} / ${result.maxConsecLosses}`}
                />
                <StatTile
                  label="Largest Win"
                  value={inr(result.largestWin)}
                  valColor="text-emerald-600"
                />
                <StatTile
                  label="Largest Loss"
                  value={inr(result.largestLoss)}
                  valColor="text-red-600"
                />
                <StatTile
                  label="Avg Holding"
                  value={`${result.avgHoldingBars} bars`}
                  sub={`${result.symbol} · ${tf.label} · ${tf.range}`}
                />
              </div>

              {/* Verdict */}
              <div
                className={`rounded-xl border p-4 flex items-start gap-3 ${
                  result.profitFactor >= 1.5 && result.expectancy > 0
                    ? "bg-emerald-50 border-emerald-200"
                    : result.profitFactor >= 1 && result.expectancy > 0
                      ? "bg-amber-50 border-amber-200"
                      : "bg-red-50 border-red-200"
                }`}
              >
                {result.profitFactor >= 1.5 && result.expectancy > 0 ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                )}
                <div>
                  <p className="font-semibold text-sm text-gray-800">
                    {result.profitFactor >= 1.5 && result.expectancy > 0
                      ? `✅ System shows positive edge on ${result.symbol} (${tf.label})`
                      : result.profitFactor >= 1 && result.expectancy > 0
                        ? `⚠ System shows marginal edge - trade with caution`
                        : `❌ No edge found on this symbol/timeframe combination`}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Profit Factor {result.profitFactor} · Expectancy{" "}
                    {result.expectancy}R · Win Rate {result.winRate}% ·{" "}
                    {result.totalTrades} trades over {result.totalBarsScanned}{" "}
                    bars
                    {result.profitFactor < 1.5 &&
                      " - Consider a different symbol, timeframe, or parameter tuning."}
                  </p>
                </div>
              </div>

              {/* Equity curve */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="font-semibold text-gray-800 mb-4">
                  Equity Curve
                </h2>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={result.equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="bar"
                      tick={{ fontSize: 10 }}
                      label={{
                        value: "Bar",
                        position: "insideBottom",
                        offset: -4,
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(v) => [
                        `₹${Number(v).toLocaleString("en-IN")}`,
                        "Equity",
                      ]}
                    />
                    <ReferenceLine
                      y={equity}
                      stroke="#9ca3af"
                      strokeDasharray="4 4"
                      label={{
                        value: "Start",
                        position: "right",
                        fontSize: 10,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="#4f46e5"
                      fill="#eef2ff"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly heatmap */}
              <MonthlyHeatmap data={result.monthlyPnl} />

              {/* Trade list */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div
                  className="flex items-center justify-between px-5 py-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50"
                  onClick={() => setShowTrades((s) => !s)}
                >
                  <h2 className="font-semibold text-gray-800">
                    Trade List ({result.trades.length} trades)
                  </h2>
                  <span className="text-xs text-indigo-600">
                    {showTrades ? "Hide ▲" : "Show ▼"}
                  </span>
                </div>
                {showTrades && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {[
                            "#",
                            "Dir",
                            "Entry Date",
                            "Exit Date",
                            "Entry ₹",
                            "Exit ₹",
                            "SL",
                            "Target",
                            "Qty",
                            "Gross",
                            "Comm",
                            "Net P&L",
                            "R-Mult",
                            "Exit",
                            "Score",
                            "Equity",
                          ].map((h) => (
                            <th
                              key={h}
                              className="px-3 py-2 text-left font-medium text-gray-500 uppercase whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {result.trades.map((t: BacktestTrade) => (
                          <tr key={t.tradeNum} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">
                              {t.tradeNum}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${t.direction === "LONG" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                              >
                                {t.direction === "LONG" ? (
                                  <TrendingUp className="w-3 h-3" />
                                ) : (
                                  <TrendingDown className="w-3 h-3" />
                                )}
                                {t.direction}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {format(
                                new Date(t.entryTime * 1000),
                                "dd MMM yy",
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {format(new Date(t.exitTime * 1000), "dd MMM yy")}
                            </td>
                            <td className="px-3 py-2">
                              ₹{t.entryPrice.toFixed(2)}
                            </td>
                            <td className="px-3 py-2">
                              ₹{t.exitPrice.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-red-500">
                              ₹{t.stopLoss.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-emerald-600">
                              ₹{t.target.toFixed(2)}
                            </td>
                            <td className="px-3 py-2">{t.shares}</td>
                            <td className={`px-3 py-2 ${color(t.grossPnl)}`}>
                              {t.grossPnl >= 0 ? "+" : ""}₹
                              {Math.abs(t.grossPnl).toLocaleString("en-IN")}
                            </td>
                            <td className="px-3 py-2 text-gray-400">
                              ₹{t.commission}
                            </td>
                            <td
                              className={`px-3 py-2 font-semibold ${color(t.netPnl)}`}
                            >
                              {t.netPnl >= 0 ? "+" : ""}₹
                              {Math.abs(t.netPnl).toLocaleString("en-IN")}
                            </td>
                            <td
                              className={`px-3 py-2 font-semibold ${t.rMultiple >= 1 ? "text-emerald-600" : t.rMultiple >= 0 ? "text-amber-600" : "text-red-600"}`}
                            >
                              {t.rMultiple >= 0 ? "+" : ""}
                              {t.rMultiple}R
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs ${t.exitReason === "TARGET" ? "bg-emerald-50 text-emerald-700" : t.exitReason === "STOPLOSS" ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-500"}`}
                              >
                                {t.exitReason}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {t.score}/6
                            </td>
                            <td className="px-3 py-2 font-medium">
                              ₹{t.equityAfter.toLocaleString("en-IN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
