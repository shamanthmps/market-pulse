"use client";
import { useStore } from "@/lib/store";
import {
  TrendingUp,
  TrendingDown,
  Target,
  ShieldX,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";

const EXIT_ICONS = {
  TARGET: <Target className="w-3 h-3" />,
  STOPLOSS: <ShieldX className="w-3 h-3" />,
  MANUAL: <XCircle className="w-3 h-3" />,
};

const EXIT_COLORS = {
  TARGET: "bg-emerald-50 text-emerald-700",
  STOPLOSS: "bg-red-50 text-red-700",
  MANUAL: "bg-gray-50 text-gray-600",
};

export default function JournalPage() {
  const { trades } = useStore();

  const sorted = [...trades].sort((a, b) => b.entryTime - a.entryTime);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Trade Journal</h1>
        <p className="text-sm text-gray-500">{trades.length} trades recorded</p>
      </div>

      {trades.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
          <p className="text-lg font-medium">No trades yet</p>
          <p className="text-sm mt-1">Closed trades will appear here</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  "Symbol",
                  "Dir",
                  "Entry Date",
                  "Exit Date",
                  "Entry ₹",
                  "Exit ₹",
                  "SL ₹",
                  "Target ₹",
                  "Qty",
                  "P&L",
                  "R-Multiple",
                  "Exit",
                  "Notes",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-semibold text-gray-900">
                    {t.symbol.replace(".NS", "")}
                  </td>
                  <td className="px-3 py-3">
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
                  <td className="px-3 py-3 text-gray-500 text-xs">
                    {format(new Date(t.entryTime * 1000), "dd MMM yy")}
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">
                    {format(new Date(t.exitTime * 1000), "dd MMM yy")}
                  </td>
                  <td className="px-3 py-3">₹{t.entryPrice.toFixed(2)}</td>
                  <td className="px-3 py-3">₹{t.exitPrice.toFixed(2)}</td>
                  <td className="px-3 py-3 text-red-500">
                    ₹{t.stopLoss.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-emerald-600">
                    ₹{t.targetPrice.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-gray-600">{t.positionSize}</td>
                  <td
                    className={`px-3 py-3 font-bold ${t.pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {t.pnl >= 0 ? "+" : ""}₹{t.pnl.toLocaleString("en-IN")}
                  </td>
                  <td
                    className={`px-3 py-3 font-semibold ${t.rMultiple >= 1 ? "text-emerald-600" : t.rMultiple >= 0 ? "text-amber-600" : "text-red-600"}`}
                  >
                    {t.rMultiple >= 0 ? "+" : ""}
                    {t.rMultiple}R
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${EXIT_COLORS[t.exitReason]}`}
                    >
                      {EXIT_ICONS[t.exitReason]}
                      {t.exitReason}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-400 max-w-xs truncate">
                    {t.notes ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
