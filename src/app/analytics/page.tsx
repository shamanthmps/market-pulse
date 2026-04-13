"use client";
import { useStore } from "@/lib/store";
import { computeStats } from "@/lib/riskManager";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { format } from "date-fns";

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const { trades } = useStore();
  const stats = computeStats(trades);

  // Equity curve data
  let cumPnl = 0;
  const equityCurve = trades
    .sort((a, b) => a.exitTime - b.exitTime)
    .map((t, i) => {
      cumPnl += t.pnl;
      return { trade: i + 1, pnl: cumPnl, date: format(new Date(t.exitTime * 1000), "dd MMM") };
    });

  // R-multiple distribution
  const rBuckets: Record<string, number> = {
    "< -1R": 0, "-1R to 0": 0, "0 to 1R": 0, "1R to 2R": 0, "> 2R": 0,
  };
  for (const t of trades) {
    if (t.rMultiple < -1) rBuckets["< -1R"]++;
    else if (t.rMultiple < 0) rBuckets["-1R to 0"]++;
    else if (t.rMultiple < 1) rBuckets["0 to 1R"]++;
    else if (t.rMultiple < 2) rBuckets["1R to 2R"]++;
    else rBuckets["> 2R"]++;
  }
  const rDist = Object.entries(rBuckets).map(([bucket, count]) => ({ bucket, count }));

  if (trades.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Analytics</h1>
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
          <p className="text-lg font-medium">No trade data yet</p>
          <p className="text-sm mt-1">Close some trades to see your performance analytics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500">Based on {stats.totalTrades} closed trades</p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Win Rate" value={`${stats.winRate}%`} sub={`${stats.wins}W / ${stats.losses}L`} color={stats.winRate >= 50 ? "text-emerald-600" : "text-red-600"} />
        <Metric label="Profit Factor" value={String(stats.profitFactor)} sub="≥1.5 is good" color={stats.profitFactor >= 1.5 ? "text-emerald-600" : "text-amber-600"} />
        <Metric label="Expectancy" value={`${stats.expectancy}R`} sub="Avg R per trade" color={stats.expectancy > 0 ? "text-emerald-600" : "text-red-600"} />
        <Metric label="Sharpe Ratio" value={String(stats.sharpeRatio)} sub="Risk-adj return" color={stats.sharpeRatio >= 1 ? "text-emerald-600" : "text-amber-600"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Total P&L" value={`₹${stats.totalPnl.toLocaleString("en-IN")}`} color={stats.totalPnl >= 0 ? "text-emerald-600" : "text-red-600"} />
        <Metric label="Max Drawdown" value={`₹${stats.maxDrawdown.toLocaleString("en-IN")}`} color="text-red-600" />
        <Metric label="Avg Win" value={`₹${stats.avgWin.toLocaleString("en-IN")}`} color="text-emerald-600" />
        <Metric label="Avg Loss" value={`₹${stats.avgLoss.toLocaleString("en-IN")}`} color="text-red-600" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Largest Win" value={`₹${stats.largestWin.toLocaleString("en-IN")}`} color="text-emerald-600" />
        <Metric label="Largest Loss" value={`₹${stats.largestLoss.toLocaleString("en-IN")}`} color="text-red-600" />
        <Metric label="Consec. Wins" value={String(stats.consecutiveWins)} />
        <Metric label="Consec. Losses" value={String(stats.consecutiveLosses)} />
      </div>

      {/* Equity curve */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Equity Curve (Cumulative P&L)</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={equityCurve}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="trade" label={{ value: "Trade #", position: "insideBottom", offset: -5 }} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "P&L"]} />
            <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="pnl" stroke="#4f46e5" fill="#eef2ff" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* R-multiple distribution */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-4">R-Multiple Distribution</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rDist}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {rDist.map((entry, i) => (
                <Cell key={i} fill={entry.bucket.startsWith(">") || entry.bucket.startsWith("1R") ? "#10b981" : entry.bucket.startsWith("<") ? "#ef4444" : "#6366f1"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
