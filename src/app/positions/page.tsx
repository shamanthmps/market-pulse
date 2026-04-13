"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { TrendingUp, TrendingDown, XCircle, CheckCircle, Target, ShieldX } from "lucide-react";

export default function PositionsPage() {
  const { openPositions, closePosition, updatePositionPrice } = useStore();
  const [exitPrices, setExitPrices] = useState<Record<string, string>>({});
  const [livePrices, setLivePrices] = useState<Record<string, string>>({});

  function handleClose(id: string, reason: "TARGET" | "STOPLOSS" | "MANUAL") {
    const price = parseFloat(exitPrices[id] ?? "0");
    if (!price || isNaN(price)) return alert("Enter a valid exit price");
    closePosition(id, price, reason);
  }

  function handleUpdatePrice(symbol: string) {
    const price = parseFloat(livePrices[symbol] ?? "0");
    if (!price || isNaN(price)) return;
    updatePositionPrice(symbol, price);
  }

  if (openPositions.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Open Positions</h1>
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
          <p className="text-lg font-medium">No open positions</p>
          <p className="text-sm mt-1">Use the Trade Planner to enter paper trades</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Open Positions</h1>
        <p className="text-sm text-gray-500">{openPositions.length} active paper trades</p>
      </div>

      {openPositions.map((pos) => {
        const unrealized = pos.unrealizedPnl ?? 0;
        const pnlPct = pos.entryPrice > 0
          ? ((unrealized / (pos.entryPrice * pos.positionSize)) * 100).toFixed(2)
          : "0";

        return (
          <div key={pos.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-gray-900">{pos.symbol.replace(".NS", "")}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${pos.direction === "LONG" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {pos.direction === "LONG" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {pos.direction}
                </span>
                <span className="text-xs text-gray-400">Signal {pos.signalScore}/6</span>
              </div>
              <div className={`text-right`}>
                <p className={`text-xl font-bold ${unrealized >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {unrealized >= 0 ? "+" : ""}₹{unrealized.toLocaleString("en-IN")}
                </p>
                <p className="text-xs text-gray-400">{pnlPct}%</p>
              </div>
            </div>

            {/* Position details */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              {[
                { label: "Entry", value: `₹${pos.entryPrice.toFixed(2)}` },
                { label: "Stop Loss", value: `₹${pos.stopLoss.toFixed(2)}`, color: "text-red-600" },
                { label: "Target", value: `₹${pos.targetPrice.toFixed(2)}`, color: "text-emerald-600" },
                { label: "Shares", value: String(pos.positionSize) },
                { label: "Risk", value: `₹${pos.riskAmount.toLocaleString("en-IN")}` },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className={`font-semibold ${color ?? "text-gray-900"}`}>{value}</p>
                </div>
              ))}
            </div>

            {pos.notes && (
              <p className="text-xs text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2">📝 {pos.notes}</p>
            )}

            {/* Update live price */}
            <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
              <input
                type="number"
                placeholder="Update current price"
                value={livePrices[pos.symbol] ?? ""}
                onChange={(e) => setLivePrices((p) => ({ ...p, [pos.symbol]: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => handleUpdatePrice(pos.symbol)}
                className="text-xs px-3 py-1.5 border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50"
              >
                Update P&L
              </button>
            </div>

            {/* Close trade */}
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="number"
                placeholder="Exit price ₹"
                value={exitPrices[pos.id] ?? ""}
                onChange={(e) => setExitPrices((p) => ({ ...p, [pos.id]: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button onClick={() => handleClose(pos.id, "TARGET")} className="flex items-center gap-1 text-xs px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                <Target className="w-3 h-3" /> Hit Target
              </button>
              <button onClick={() => handleClose(pos.id, "STOPLOSS")} className="flex items-center gap-1 text-xs px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                <ShieldX className="w-3 h-3" /> Stop Hit
              </button>
              <button onClick={() => handleClose(pos.id, "MANUAL")} className="flex items-center gap-1 text-xs px-3 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                <XCircle className="w-3 h-3" /> Manual Exit
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
