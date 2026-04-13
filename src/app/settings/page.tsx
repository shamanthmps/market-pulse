"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { Save, RefreshCw, AlertTriangle } from "lucide-react";
import { RISK_RULES } from "@/lib/riskManager";

export default function SettingsPage() {
  const { account, setAccount, watchlist, addToWatchlist, removeFromWatchlist } = useStore();
  const [form, setForm] = useState({ ...account });
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");
  const [saved, setSaved] = useState(false);

  function saveSettings() {
    if (form.riskPercent > RISK_RULES.MAX_RISK_PERCENT) {
      alert(`Risk per trade cannot exceed ${RISK_RULES.MAX_RISK_PERCENT}%. Adjust it.`);
      return;
    }
    setAccount(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addSymbol() {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    if (!/^[A-Z0-9^.]{1,20}$/.test(sym)) {
      alert("Invalid symbol format. Use Yahoo Finance format e.g. RELIANCE.NS");
      return;
    }
    addToWatchlist({
      symbol: sym,
      displayName: newName.trim() || sym.replace(".NS", "").replace(".BO", ""),
      exchange: sym.endsWith(".BO") ? "BSE" : "NSE",
      addedAt: Date.now(),
    });
    setNewSymbol("");
    setNewName("");
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Configure your account, risk parameters, and watchlist</p>
      </div>

      {/* Account settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Account & Risk Parameters</h2>

        <div className="grid grid-cols-2 gap-4">
          {[
            { key: "accountSize", label: "Account Size (₹)", type: "number", min: 10000, step: 10000 },
            { key: "riskPercent", label: `Risk per Trade (%, max ${RISK_RULES.MAX_RISK_PERCENT}%)`, type: "number", min: 0.1, max: 2, step: 0.1 },
            { key: "maxOpenPositions", label: "Max Open Positions", type: "number", min: 1, max: 10, step: 1 },
            { key: "dailyLossLimitPercent", label: "Daily Loss Limit (%)", type: "number", min: 1, max: 10, step: 0.5 },
          ].map(({ key, label, type, min, max, step }) => (
            <div key={key}>
              <label className="text-xs text-gray-500 block mb-1">{label}</label>
              <input
                type={type}
                min={min}
                max={max}
                step={step}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: parseFloat(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-700 space-y-1">
          <p>Max risk per trade: <strong>₹{(form.accountSize * form.riskPercent / 100).toLocaleString("en-IN")}</strong></p>
          <p>Daily loss limit: <strong>₹{(form.accountSize * form.dailyLossLimitPercent / 100).toLocaleString("en-IN")}</strong></p>
          <p>Max portfolio risk (5%): <strong>₹{(form.accountSize * 5 / 100).toLocaleString("en-IN")}</strong></p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={saveSettings}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <Save className="w-4 h-4" /> {saved ? "Saved!" : "Save Settings"}
          </button>
          <button
            onClick={() => setForm({ ...account })}
            className="flex items-center gap-2 border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" /> Reset
          </button>
        </div>
      </div>

      {/* Watchlist management */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Watchlist ({watchlist.length} symbols)</h2>

        <div className="flex gap-2 flex-wrap">
          <input
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            placeholder="Symbol e.g. TATAMOTORS.NS"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Display name (optional)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={addSymbol}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Add
          </button>
        </div>

        <div className="space-y-2">
          {watchlist.map((w) => (
            <div key={w.symbol} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
              <div>
                <span className="text-sm font-medium text-gray-800">{w.symbol}</span>
                <span className="text-xs text-gray-400 ml-2">{w.displayName}</span>
                <span className="text-xs text-gray-400 ml-2 bg-gray-200 px-1.5 py-0.5 rounded">{w.exchange}</span>
              </div>
              <button
                onClick={() => removeFromWatchlist(w.symbol)}
                className="text-xs text-red-500 hover:text-red-700 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            Use Yahoo Finance format: <strong>RELIANCE.NS</strong> (NSE), <strong>RELIANCE.BO</strong> (BSE).
            For Nifty index ETFs use <strong>NIFTYBEES.NS</strong>.
            Crypto: <strong>BTC-USD</strong>.
          </p>
        </div>
      </div>

      {/* System info */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2 text-xs text-gray-500">
        <h2 className="font-semibold text-gray-700 text-sm">System Info</h2>
        <p>Data source: Yahoo Finance (free, 15-min delayed for NSE)</p>
        <p>Indicators: EMA 20/50/200 · RSI 14 · MACD 12/26/9 · Supertrend 10/3 · ATR 14</p>
        <p>Signal threshold: 4/6 signals must align before trade entry</p>
        <p>Stop loss: 2× ATR from entry · Target: minimum 1:2 R:R</p>
        <p>All data stored locally in your browser (localStorage)</p>
        <p className="text-amber-600 font-medium">⚠ Paper trading only. Not connected to any live broker.</p>
      </div>
    </div>
  );
}
