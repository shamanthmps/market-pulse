"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Settings2,
  Plus,
  Trash2,
  Info,
  Lock,
} from "lucide-react";
import type { EtfHolding } from "@/lib/store";

// ── Types mirroring the API response ─────────────────────────────────────────
interface EtfRsiResult {
  symbol: string;
  currentPrice: number;
  prevClose: number;
  rsi2h: number;
  prevRsi2h: number;
  direction: "rising" | "falling" | "flat";
  zone: "BUY" | "WATCH" | "HOLD" | "CAUTION" | "HEDGE";
  signal: string;
  coveredCallStrike: number;
  error?: string;
}
interface DeploySignal {
  tranche: string;
  label: string;
  explanation: string;
  confidence: "low" | "medium" | "high" | "max";
}
interface CollarLeg {
  seq: number;
  action: "BUY" | "SELL";
  instrument: string;
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
  action: string;
  explanation: string;
  strategy: "SELL_CE" | "COLLAR" | "NONE";
  gainPercent?: number;
  legs?: CollarLeg[];
  strike?: number;
  expiryLabel?: string;
  lotsNow?: number;
  lotsReserve?: number;
  maxLots?: number;
}
interface MarketPulse {
  symbol: string;
  rsi2h: number;
  prevRsi2h: number;
  rsiDaily: number;
  currentPrice: number;
  direction: "rising" | "falling" | "flat";
  zone: "BUY" | "WATCH" | "HOLD" | "CAUTION" | "HEDGE";
  interpretation: string;
  deploySignal: DeploySignal;
  hedgeSignal: HedgeSignal;
}
interface MonitorData {
  marketPulse: MarketPulse | null;
  etfResults: EtfRsiResult[];
  fetchedAt: number;
}

// ── Zone config ───────────────────────────────────────────────────────────────
const ZONE_CONFIG = {
  BUY: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-300",
    badge: "bg-emerald-600 text-white",
    label: "BUY ZONE",
  },
  WATCH: {
    bg: "bg-lime-50",
    text: "text-lime-800",
    border: "border-lime-300",
    badge: "bg-lime-500 text-white",
    label: "WATCH",
  },
  HOLD: {
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-200",
    badge: "bg-gray-400 text-white",
    label: "HOLD",
  },
  CAUTION: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-300",
    badge: "bg-amber-500 text-white",
    label: "CAUTION",
  },
  HEDGE: {
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-300",
    badge: "bg-red-600 text-white",
    label: "SELL CALLS",
  },
};

function getZone(rsi: number): EtfRsiResult["zone"] {
  if (rsi < 30) return "BUY";
  if (rsi < 45) return "WATCH";
  if (rsi < 70) return "HOLD";
  if (rsi < 80) return "CAUTION";
  return "HEDGE";
}

function RsiGauge({
  value,
  zone,
  label = "RSI (2H)",
}: {
  value: number;
  zone: EtfRsiResult["zone"];
  label?: string;
}) {
  const pct = Math.min(Math.max(value, 0), 100);
  const color =
    zone === "BUY"
      ? "#16a34a"
      : zone === "WATCH"
        ? "#65a30d"
        : zone === "HOLD"
          ? "#9ca3af"
          : zone === "CAUTION"
            ? "#f59e0b"
            : "#dc2626";

  // SVG arc gauge - cy pushed down so top label (50) has room above it
  const r = 46,
    cx = 76,
    cy = 82;
  const startAngle = -210,
    sweepAngle = 240;
  function polarToXY(deg: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  const start = polarToXY(startAngle);
  const active = polarToXY(startAngle + (sweepAngle * pct) / 100);
  const large = (sweepAngle * pct) / 100 > 180 ? 1 : 0;
  const end = polarToXY(startAngle + sweepAngle);
  const largeAll = sweepAngle > 180 ? 1 : 0;

  // Label positions - placed outside the arc
  function labelPos(pct100: number, offset: number) {
    const deg = startAngle + (sweepAngle * pct100) / 100;
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + (r + offset) * Math.cos(rad),
      y: cy + (r + offset) * Math.sin(rad),
    };
  }
  const lbl30 = labelPos(30, 18);
  const lbl50 = labelPos(50, 18);
  const lbl70 = labelPos(70, 18);
  const tick30i = polarToXY(startAngle + (sweepAngle * 30) / 100);
  const tick30o = labelPos(30, 10);
  const tick70i = polarToXY(startAngle + (sweepAngle * 70) / 100);
  const tick70o = labelPos(70, 10);

  return (
    <div className="flex flex-col items-center">
      <svg width="152" height="124" viewBox="0 0 152 124">
        {/* Track */}
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeAll} 1 ${end.x} ${end.y}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Active arc */}
        {pct > 0 && (
          <path
            d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${active.x} ${active.y}`}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
          />
        )}
        {/* Tick at 30 */}
        <line
          x1={tick30i.x}
          y1={tick30i.y}
          x2={tick30o.x}
          y2={tick30o.y}
          stroke="#16a34a"
          strokeWidth="2.5"
        />
        {/* Tick at 70 */}
        <line
          x1={tick70i.x}
          y1={tick70i.y}
          x2={tick70o.x}
          y2={tick70o.y}
          stroke="#f59e0b"
          strokeWidth="2.5"
        />
        {/* Zone labels - outside arc, clear and readable */}
        <text
          x={lbl30.x}
          y={lbl30.y}
          fontSize="13"
          fill="#16a34a"
          fontWeight="800"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          30
        </text>
        <text
          x={lbl50.x}
          y={lbl50.y}
          fontSize="12"
          fill="#9ca3af"
          fontWeight="600"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          50
        </text>
        <text
          x={lbl70.x}
          y={lbl70.y}
          fontSize="13"
          fill="#f59e0b"
          fontWeight="800"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          70
        </text>
      </svg>
      <p className="text-3xl font-bold -mt-10" style={{ color }}>
        {value.toFixed(1)}
      </p>
      <p className="text-xs font-semibold mt-1" style={{ color }}>
        {label}
      </p>
    </div>
  );
}

function DirectionIcon({ d }: { d: "rising" | "falling" | "flat" }) {
  if (d === "rising")
    return <TrendingUp className="w-4 h-4 text-emerald-600 inline-block" />;
  if (d === "falling")
    return <TrendingDown className="w-4 h-4 text-red-500 inline-block" />;
  return <Minus className="w-4 h-4 text-gray-400 inline-block" />;
}

// ── Edit Holdings Modal ────────────────────────────────────────────────────────
function EditHoldingsModal({
  holdings,
  onSave,
  onClose,
}: {
  holdings: EtfHolding[];
  onSave: (h: EtfHolding[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<EtfHolding[]>(
    holdings.map((h) => ({ ...h })),
  );
  const update = (idx: number, field: keyof EtfHolding, val: string | number) =>
    setRows((r) =>
      r.map((row, i) => (i === idx ? { ...row, [field]: val } : row)),
    );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Edit ETF Holdings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-5 space-y-2">
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-1 mb-1">
            <div className="col-span-3">Symbol</div>
            <div className="col-span-3">Display Name</div>
            <div className="col-span-2">Qty</div>
            <div className="col-span-3">Avg Cost (₹)</div>
            <div className="col-span-1"></div>
          </div>
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <input
                value={row.symbol}
                onChange={(e) =>
                  update(idx, "symbol", e.target.value.toUpperCase())
                }
                placeholder="BANKBEES.NS"
                className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
              />
              <input
                value={row.displayName}
                onChange={(e) => update(idx, "displayName", e.target.value)}
                placeholder="Bank BeES"
                className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="number"
                value={row.qty}
                onChange={(e) => update(idx, "qty", Number(e.target.value))}
                className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="number"
                value={row.avgCost}
                onChange={(e) => update(idx, "avgCost", Number(e.target.value))}
                className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => setRows((r) => r.filter((_, i) => i !== idx))}
                className="col-span-1 text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              setRows((r) => [
                ...r,
                { symbol: "", displayName: "", qty: 0, avgCost: 0 },
              ])
            }
            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-xs font-medium mt-2"
          >
            <Plus className="w-3.5 h-3.5" /> Add ETF
          </button>
        </div>
        <div className="p-5 border-t border-gray-200 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(rows.filter((r) => r.symbol.trim()))}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
          >
            Save Holdings
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
import { Suspense } from "react";

function EtfMonitorInner() {
  const searchParams = useSearchParams();
  const demoMode = searchParams.get("demo") ?? ""; // "oversold" | "overbought" | ""
  const [etfHoldings, setEtfHoldings] = useState<EtfHolding[]>([]);
  const [liquidcaseAmount, setLiquidcaseAmountState] = useState(0);
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [liqInput, setLiqInput] = useState("0");
  const [rulesOpen, setRulesOpen] = useState(false);

  // Load holdings from file-based API on mount
  useEffect(() => {
    fetch("/api/holdings")
      .then((r) => r.json())
      .then((d) => {
        setEtfHoldings(d.etfHoldings ?? []);
        setLiquidcaseAmountState(d.liquidcaseAmount ?? 0);
        setLiqInput(String(d.liquidcaseAmount ?? 0));
      })
      .catch(() => {});
  }, []);

  async function saveHoldings(holdings: EtfHolding[]) {
    setSaving(true);
    try {
      await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etfHoldings: holdings }),
      });
      setEtfHoldings(holdings);
    } finally {
      setSaving(false);
    }
  }

  async function saveLiquidcase(amount: number) {
    setLiquidcaseAmountState(amount);
    await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liquidcaseAmount: amount }),
    });
  }

  const fetchData = useCallback(async () => {
    const validSymbols = etfHoldings
      .filter((h) => h.symbol.trim())
      .map((h) => h.symbol);
    if (!validSymbols.length) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        symbols: validSymbols.join(","),
        market: "^NSEI",
      });
      if (demoMode) params.set("demo", demoMode);
      const res = await fetch(`/api/etf-monitor?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Fetch failed");
        return;
      }
      setData(json);
    } catch {
      setError("Network error. Check connection.");
    } finally {
      setLoading(false);
    }
  }, [etfHoldings, demoMode]);

  useEffect(() => {
    if (etfHoldings.length > 0) fetchData();
  }, [fetchData, etfHoldings]);

  const pulse = data?.marketPulse;
  const pulseZone = pulse ? ZONE_CONFIG[pulse.zone] : ZONE_CONFIG.HOLD;

  // Map results back to enriched rows (join with holdings for qty/avgCost)
  const rows = (data?.etfResults ?? []).map((r) => {
    const h = etfHoldings.find((h) => h.symbol === r.symbol);
    const invested = h ? h.qty * h.avgCost : 0;
    const curVal = h && r.currentPrice ? h.qty * r.currentPrice : 0;
    const pnl = curVal - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...r, holding: h, invested, curVal, pnl, pnlPct };
  });

  const totalInvested = rows.reduce((s, r) => s + r.invested, 0);
  const totalCurVal = rows.reduce((s, r) => s + r.curVal, 0);
  const totalPnl = totalCurVal - totalInvested;
  const liqAmt = Number(liqInput) || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Demo mode banner ────────────────────────────────────────────────── */}
      {demoMode && (
        <div
          className={`px-4 py-2 text-center text-xs font-bold tracking-widest uppercase ${
            demoMode === "oversold"
              ? "bg-emerald-500 text-white"
              : demoMode === "collaring"
                ? "bg-purple-600 text-white"
                : "bg-red-500 text-white"
          }`}
        >
          {demoMode === "oversold"
            ? "DEMO: OVERSOLD SCENARIO — RSI 22.4 · Buy Zone Active · Real prices, mocked RSI"
            : demoMode === "collaring"
              ? "DEMO: GAIN-LOCK COLLAR — RSI 81.2 · +8.4% Gain · 3-Leg Collar Active · Real prices, mocked RSI + gain"
              : "DEMO: OVERBOUGHT SCENARIO — RSI 78.3 · Hedge Zone Active · Real prices, mocked RSI"}
        </div>
      )}
      {/* ── Dark gradient header ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 px-4 py-4 md:px-8 md:py-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">
              ETF Portfolio Monitor
            </h1>
            <p className="text-slate-400 text-xs md:text-sm mt-0.5 hidden md:block">
              NIFTY 2H RSI timing · Covered call signals · LiquidCase tracker
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 md:py-2 text-xs md:text-sm border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> Edit Holdings
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("mp-gate-v1");
                location.reload();
              }}
              title="Lock"
              className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 border border-slate-700 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Lock className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 md:gap-2 bg-indigo-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-900/40"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 md:w-4 md:h-4 ${loading ? "animate-spin" : ""}`}
              />
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 md:px-8 py-4 md:py-6 space-y-4 md:space-y-5">
        {/* placeholder-open */}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* ── Quick stats row ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-2 py-3 md:px-5 md:py-4">
            <p className="text-[10px] md:text-xs text-gray-400 font-medium uppercase tracking-wide">
              Invested
            </p>
            <p className="text-base md:text-2xl font-bold text-gray-900 mt-1 tabular-nums">
              ₹
              {totalInvested.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-2 py-3 md:px-5 md:py-4">
            <p className="text-[10px] md:text-xs text-gray-400 font-medium uppercase tracking-wide">
              Current Value
            </p>
            <p className="text-base md:text-2xl font-bold text-gray-900 mt-1 tabular-nums">
              ₹
              {totalCurVal.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-2 py-3 md:px-5 md:py-4">
            <p className="text-[10px] md:text-xs text-gray-400 font-medium uppercase tracking-wide">
              P&L
            </p>
            <p
              className={`text-base md:text-2xl font-bold mt-1 tabular-nums ${totalPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {totalPnl >= 0 ? "+" : ""}₹
              {Math.round(totalPnl).toLocaleString("en-IN")}
              <span className="hidden md:inline text-sm font-normal ml-1 text-gray-500">
                (
                {totalInvested > 0
                  ? ((totalPnl / totalInvested) * 100).toFixed(2)
                  : "0.00"}
                %)
              </span>
            </p>
            <p className="md:hidden text-[10px] text-gray-400 mt-0.5 tabular-nums">
              {totalInvested > 0
                ? `(${((totalPnl / totalInvested) * 100).toFixed(1)}%)`
                : ""}
            </p>
          </div>
        </div>

        {/* ── Market Pulse + LiquidCase ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          {/* Market Pulse */}
          <div
            className={`rounded-2xl border-2 p-6 ${pulseZone.border} ${pulseZone.bg} flex flex-col gap-3`}
          >
            <p className="font-bold text-gray-800 text-sm uppercase tracking-wide">
              NIFTY Market Pulse
            </p>
            {pulse ? (
              <>
                {/* Dual RSI row */}
                <div className="flex items-center justify-around gap-2">
                  <div className="flex-1">
                    <RsiGauge
                      value={pulse.rsi2h}
                      zone={pulse.zone}
                      label="RSI (2H)"
                    />
                  </div>
                  <div className="flex-1">
                    <RsiGauge
                      value={pulse.rsiDaily}
                      zone={getZone(pulse.rsiDaily)}
                      label="RSI (Daily)"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DirectionIcon d={pulse.direction} />
                  <span className="text-xs text-gray-500 capitalize">
                    2H {pulse.direction} from {pulse.prevRsi2h.toFixed(1)}
                  </span>
                </div>
                <div
                  className={`w-full rounded-lg px-3 py-2 text-center text-xs font-semibold ${pulseZone.badge}`}
                >
                  {pulseZone.label}
                </div>
                <p className={`text-xs leading-relaxed ${pulseZone.text}`}>
                  {pulse.interpretation}
                </p>

                {/* Deploy signal - shown when 2H in BUY zone */}
                {pulse.zone === "BUY" &&
                  (() => {
                    const ds = pulse.deploySignal;
                    const confColor =
                      ds.confidence === "max"
                        ? "bg-emerald-600 text-white"
                        : ds.confidence === "high"
                          ? "bg-emerald-100 border border-emerald-300 text-emerald-900"
                          : ds.confidence === "medium"
                            ? "bg-lime-50 border border-lime-300 text-lime-900"
                            : "bg-amber-50 border border-amber-200 text-amber-900";
                    return (
                      <div className={`rounded-xl p-3 ${confColor}`}>
                        <p className="font-bold text-xs mb-1">
                          Deploy signal: {ds.tranche} of LiquidCase
                        </p>
                        <p className="text-xs leading-relaxed opacity-90">
                          {ds.explanation}
                        </p>
                      </div>
                    );
                  })()}

                {/* Hedge signal compact — full detail card is below the ETF table */}
                {(pulse.zone === "CAUTION" || pulse.zone === "HEDGE") &&
                  (() => {
                    const hs = pulse.hedgeSignal;
                    const isCollar = hs.verdict === "COLLAR";
                    const isActive = hs.verdict === "SELL" || isCollar;
                    const color = isCollar
                      ? "bg-purple-700 text-white"
                      : hs.verdict === "SELL"
                        ? "bg-red-600 text-white"
                        : hs.verdict === "WAIT"
                          ? "bg-amber-50 border border-amber-300 text-amber-900"
                          : "bg-gray-100 text-gray-600";
                    return (
                      <div className={`rounded-xl p-3 ${color}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-bold text-xs">
                            {isCollar ? "Gain-Lock Collar active" : hs.label}
                          </p>
                          <span
                            className={`text-xs font-black px-2 py-0.5 rounded-lg ${isActive ? "bg-white/20" : "bg-black/10"}`}
                          >
                            {hs.verdict}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed opacity-80">
                          {isActive
                            ? hs.action
                            : hs.explanation.split(".")[0] + "."}
                        </p>
                      </div>
                    );
                  })()}
              </>
            ) : (
              <div className="text-sm text-gray-400 py-10 text-center">
                {loading ? "Loading NIFTY data…" : "Click Refresh to load"}
              </div>
            )}
          </div>

          {/* LiquidCase + Portfolio Summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <p className="font-bold text-gray-800 text-sm uppercase tracking-wide">
              Portfolio + LiquidCase
            </p>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">ETF Invested</span>
                <span className="font-semibold text-gray-900">
                  ₹
                  {totalInvested.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Current Value</span>
                <span className="font-semibold text-gray-900">
                  ₹
                  {totalCurVal.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Unrealised P&L</span>
                <span
                  className={`font-bold ${totalPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}
                >
                  {totalPnl >= 0 ? "+" : ""}₹
                  {Math.round(totalPnl).toLocaleString("en-IN")}
                  <span className="text-xs ml-1 font-normal">
                    ({totalPnl >= 0 ? "+" : ""}
                    {totalInvested > 0
                      ? ((totalPnl / totalInvested) * 100).toFixed(2)
                      : 0}
                    %)
                  </span>
                </span>
              </div>
            </div>
            <hr className="border-gray-100" />
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">
                LiquidCase / Deployable Cash
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={liqInput}
                  onChange={(e) => setLiqInput(e.target.value)}
                  placeholder="0"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                />
                <button
                  onClick={() => saveLiquidcase(Number(liqInput) || 0)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {liqAmt > 0
                  ? `₹${liqAmt.toLocaleString("en-IN")} parked · earning ~6.5% annualised`
                  : "Enter amount parked in LiquidCase / liquid funds"}
              </p>
              {/* Deploy amount hint - computed client-side with actual liqAmt */}
              {liqAmt > 0 &&
                pulse?.zone === "BUY" &&
                (() => {
                  const d = pulse.deploySignal;
                  const trancheMap: Record<string, number> = {
                    "1/8": 8,
                    "1/4": 4,
                    "1/3": 3,
                    "1/2": 2,
                  };
                  const divisor = trancheMap[d.tranche];
                  const deployAmt = divisor
                    ? Math.round(liqAmt / divisor)
                    : liqAmt;
                  const confColor =
                    d.confidence === "max"
                      ? "bg-emerald-600 text-white"
                      : d.confidence === "high"
                        ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                        : d.confidence === "medium"
                          ? "bg-lime-50 border border-lime-200 text-lime-800"
                          : "bg-amber-50 border border-amber-200 text-amber-800";
                  return (
                    <div
                      className={`mt-2 rounded-lg p-2.5 text-xs font-medium ${confColor}`}
                    >
                      <p className="font-bold">
                        {d.label} - Deploy {d.tranche} = ₹
                        {deployAmt.toLocaleString("en-IN")}
                      </p>
                      <p className="font-normal mt-0.5 opacity-80">
                        {d.explanation.split(".")[0]}.
                      </p>
                    </div>
                  );
                })()}
              {liqAmt > 0 && pulse?.zone === "WATCH" && (
                <div className="mt-2 bg-lime-50 border border-lime-200 rounded-lg p-2.5 text-xs text-lime-800 font-medium">
                  Approaching buy zone - keep ₹{liqAmt.toLocaleString("en-IN")}{" "}
                  ready. Do not deploy yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Strategy Rules (collapsible) ─────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => setRulesOpen(!rulesOpen)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-500" /> ETF Strategy Rules
            </span>
            {rulesOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {rulesOpen && (
            <div className="px-6 pb-5 border-t border-gray-50 pt-4 space-y-2.5 text-xs text-gray-700">
              {[
                {
                  color: "bg-emerald-500",
                  title: "BUY zone (2H RSI < 30):",
                  body: "2H RSI triggers the buy. Daily RSI controls tranche size: Daily > 55 = deploy 1/8 only (market still expensive, more downside likely). Daily 45-55 = 1/4. Daily 35-45 = 1/3. Daily < 35 = 1/2. Daily < 30 = ALL IN. Always buy the most oversold individual ETF by its own 2H RSI.",
                },
                {
                  color: "bg-lime-500",
                  title: "WATCH zone (2H RSI 30-45):",
                  body: "Move funds from savings into LiquidCase so they are ready. No ETF purchases yet.",
                },
                {
                  color: "bg-gray-400",
                  title: "HOLD zone (2H RSI 45-70):",
                  body: "No new buys. Park surplus in LiquidCase. Let existing ETFs compound. Continue monthly SIPs normally.",
                },
                {
                  color: "bg-amber-500",
                  title: "CAUTION/HEDGE - hedge trigger:",
                  body: "ONLY hedge when BOTH 2H RSI > 70 AND Daily RSI > 65. If 2H > 70 but Daily < 65, it is a short-term blip - do NOT hedge, the daily trend is still OK.",
                },
                {
                  color: "bg-red-500",
                  title: "Hedge strategy — gain-proportional:",
                  body: "Gain < 5%: sell 1 NIFTY call at 8% OTM (monthly) to collect premium. Gain >= 5%: full Gain-Lock Collar — buy put 4% OTM (quarterly), sell put 10% OTM (quarterly, funds the long), sell call 8% OTM (monthly, roll monthly for income). Sizing: 1 lot per Rs 8L portfolio value. Strikes rounded to nearest 100 for liquidity.",
                },
              ].map(({ color, title, body }) => (
                <div key={title} className="flex gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${color} mt-0.5 shrink-0`}
                  />
                  <div>
                    <span className="font-semibold">{title}</span> {body}
                  </div>
                </div>
              ))}
              <p className="pt-2 border-t border-gray-100 text-gray-400 italic">
                Never sell ETF units · Deploy into most oversold ETF by
                individual RSI · BANKBEES passive holds are separate from algo
                trading capital
              </p>
            </div>
          )}
        </div>

        {/* ── Holdings RSI Table ───────────────────────────────────────────── */}
        {rows.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 md:px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">Holdings RSI Status</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                2H timeframe RSI for each ETF · refreshed on demand
              </p>
            </div>

            {/* ── Mobile cards ── */}
            <div className="md:hidden divide-y divide-gray-100">
              {rows.map((row) => {
                const zc = ZONE_CONFIG[row.zone];
                return (
                  <div
                    key={row.symbol}
                    className={`px-4 py-3 ${
                      row.zone === "BUY"
                        ? "bg-emerald-50/40"
                        : row.zone === "HEDGE"
                          ? "bg-red-50/30"
                          : ""
                    }`}
                  >
                    {/* Row 1: name + zone badge */}
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">
                          {row.holding?.displayName ?? row.symbol}
                        </p>
                        <p className="text-xs text-gray-400">{row.symbol}</p>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${zc.badge}`}
                      >
                        {zc.label}
                      </span>
                    </div>
                    {/* Row 2: LTP · RSI · P&L */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="text-[10px] text-gray-400 uppercase font-medium">
                          LTP
                        </p>
                        <p className="text-sm font-semibold text-gray-900 mt-0.5">
                          {row.currentPrice > 0
                            ? `₹${row.currentPrice.toLocaleString("en-IN")}`
                            : "-"}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="text-[10px] text-gray-400 uppercase font-medium">
                          2H RSI
                        </p>
                        <p className={`text-sm font-bold mt-0.5 ${zc.text}`}>
                          {row.rsi2h.toFixed(1)}
                        </p>
                        <div className="flex items-center justify-center gap-0.5">
                          <DirectionIcon d={row.direction} />
                          <p className="text-[10px] text-gray-400">
                            {row.prevRsi2h.toFixed(1)}
                          </p>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="text-[10px] text-gray-400 uppercase font-medium">
                          P&L
                        </p>
                        {row.invested > 0 ? (
                          <>
                            <p
                              className={`text-sm font-semibold mt-0.5 ${row.pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}
                            >
                              {row.pnl >= 0 ? "+" : ""}₹
                              {Math.round(row.pnl).toLocaleString("en-IN")}
                            </p>
                            <p
                              className={`text-[10px] ${row.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                            >
                              {row.pnl >= 0 ? "+" : ""}
                              {row.pnlPct.toFixed(2)}%
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-400 mt-0.5">-</p>
                        )}
                      </div>
                    </div>
                    {/* Signal */}
                    {!row.error && row.signal && (
                      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                        {row.signal}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Desktop table ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-medium text-gray-400 uppercase bg-gray-50/60">
                    <th className="px-6 py-3 text-left">ETF</th>
                    <th className="px-4 py-3 text-right">LTP</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Avg Cost</th>
                    <th className="px-4 py-3 text-right">P&L</th>
                    <th className="px-4 py-3 text-center">2H RSI</th>
                    <th className="px-4 py-3 text-center">Zone</th>
                    <th className="px-6 py-3 text-left">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row) => {
                    const zc = ZONE_CONFIG[row.zone];
                    return (
                      <tr
                        key={row.symbol}
                        className={`hover:bg-gray-50/70 transition-colors ${
                          row.zone === "BUY"
                            ? "bg-emerald-50/40"
                            : row.zone === "HEDGE"
                              ? "bg-red-50/30"
                              : ""
                        }`}
                      >
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900">
                            {row.holding?.displayName ?? row.symbol}
                          </p>
                          <p className="text-xs text-gray-400">{row.symbol}</p>
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-gray-900">
                          {row.currentPrice > 0
                            ? `₹${row.currentPrice.toLocaleString("en-IN")}`
                            : "-"}
                        </td>
                        <td className="px-4 py-4 text-right text-gray-600">
                          {row.holding?.qty?.toLocaleString("en-IN") ?? "-"}
                        </td>
                        <td className="px-4 py-4 text-right text-gray-600">
                          {row.holding ? `₹${row.holding.avgCost}` : "-"}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {row.invested > 0 ? (
                            <div>
                              <p
                                className={`font-semibold ${row.pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}
                              >
                                {row.pnl >= 0 ? "+" : ""}₹
                                {Math.round(row.pnl).toLocaleString("en-IN")}
                              </p>
                              <p
                                className={`text-xs ${row.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                              >
                                {row.pnl >= 0 ? "+" : ""}
                                {row.pnlPct.toFixed(2)}%
                              </p>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`text-base font-bold ${zc.text}`}>
                            {row.rsi2h.toFixed(1)}
                          </span>
                          <div className="flex items-center justify-center gap-1 mt-0.5">
                            <DirectionIcon d={row.direction} />
                            <p className="text-xs text-gray-400">
                              prev {row.prevRsi2h.toFixed(1)}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${zc.badge}`}
                          >
                            {zc.label}
                          </span>
                          {row.zone === "HEDGE" && (
                            <p className="text-xs text-red-500 mt-1 font-medium">
                              5% OTM: ₹{row.coveredCallStrike}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 max-w-xs">
                          {row.error ? (
                            <span className="text-red-400">{row.error}</span>
                          ) : (
                            row.signal
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Action Card ──────────────────────────────────────────────────── */}
        {pulse &&
          (() => {
            const hs = pulse.hedgeSignal;
            const isCollar = hs.verdict === "COLLAR";
            const isSell = hs.verdict === "SELL";
            const isWait = hs.verdict === "WAIT";
            const isActive = isCollar || isSell;
            const vc = isCollar
              ? {
                  bg: "bg-purple-50",
                  border: "border-purple-400",
                  badge: "bg-purple-700 text-white",
                  title: "text-purple-900",
                  sub: "text-purple-700",
                  actionBg: "bg-purple-100 border border-purple-300",
                  legBuy: "bg-emerald-100 text-emerald-800",
                  legSell: "bg-red-100 text-red-800",
                }
              : isSell
                ? {
                    bg: "bg-red-50",
                    border: "border-red-300",
                    badge: "bg-red-600 text-white",
                    title: "text-red-900",
                    sub: "text-red-700",
                    actionBg: "bg-red-100 border border-red-300",
                    legBuy: "bg-emerald-100 text-emerald-800",
                    legSell: "bg-red-100 text-red-800",
                  }
                : isWait
                  ? {
                      bg: "bg-amber-50",
                      border: "border-amber-300",
                      badge: "bg-amber-500 text-white",
                      title: "text-amber-900",
                      sub: "text-amber-700",
                      actionBg: "",
                      legBuy: "",
                      legSell: "",
                    }
                  : {
                      bg: "bg-gray-50",
                      border: "border-gray-200",
                      badge: "bg-gray-400 text-white",
                      title: "text-gray-700",
                      sub: "text-gray-500",
                      actionBg: "",
                      legBuy: "",
                      legSell: "",
                    };
            return (
              <div
                className={`${vc.bg} border-2 ${vc.border} rounded-2xl p-5 space-y-4`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                      Options Hedge · 2H RSI {pulse.rsi2h} · Daily RSI{" "}
                      {pulse.rsiDaily}
                      {isActive && hs.gainPercent !== undefined
                        ? ` · Portfolio +${hs.gainPercent.toFixed(1)}%`
                        : ""}
                    </p>
                    <p
                      className={`font-bold text-base ${vc.title} leading-snug`}
                    >
                      {hs.label}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-black px-4 py-2 rounded-xl whitespace-nowrap ${vc.badge}`}
                  >
                    {hs.verdict}
                  </span>
                </div>

                {/* ACTION LINE — most prominent when active */}
                {isActive && (
                  <div className={`rounded-xl p-4 ${vc.actionBg}`}>
                    <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">
                      What to do right now
                    </p>
                    <p className={`font-bold text-sm ${vc.title}`}>
                      {hs.action}
                    </p>
                  </div>
                )}

                {/* Legs — numbered steps */}
                {isActive && hs.legs && hs.legs.length > 0 && (
                  <div className="space-y-2">
                    {hs.legs.map((leg) => (
                      <div
                        key={leg.seq}
                        className="flex items-start gap-3 bg-white rounded-xl p-3 border border-gray-100"
                      >
                        <span className="shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-black flex items-center justify-center mt-0.5">
                          {leg.seq}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${leg.action === "BUY" ? vc.legBuy : vc.legSell}`}
                            >
                              {leg.action}
                            </span>
                            <span className="font-bold text-sm text-gray-900">
                              {leg.instrument}
                            </span>
                            <span className="text-xs text-gray-500">
                              {leg.lots} lot{leg.lots > 1 ? "s" : ""} ·{" "}
                              {leg.expiryLabel}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 leading-snug">
                            {leg.purpose}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Explanation — collapsible */}
                <details className="group">
                  <summary
                    className={`text-xs font-semibold cursor-pointer select-none ${vc.sub} list-none flex items-center gap-1`}
                  >
                    <span className="group-open:hidden">
                      ▶ Why this strategy?
                    </span>
                    <span className="hidden group-open:inline">
                      ▼ Why this strategy?
                    </span>
                  </summary>
                  <p className={`text-xs leading-relaxed mt-2 ${vc.sub}`}>
                    {hs.explanation}
                  </p>
                </details>

                {/* NIFTY spot reference */}
                <p className="text-[10px] text-gray-400">
                  NIFTY spot ₹{pulse.currentPrice.toLocaleString("en-IN")} · Lot
                  size 65 · ₹8L per lot threshold
                </p>
              </div>
            );
          })()}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {etfHoldings.length === 0 && (
          <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
            <p className="text-gray-400 mb-4">No ETF holdings configured.</p>
            <button
              onClick={() => setEditOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
            >
              + Add Holdings
            </button>
          </div>
        )}

        {/* Timestamp */}
        {data && (
          <p className="text-xs text-gray-400 text-right pb-2">
            Last refreshed:{" "}
            {new Date(data.fetchedAt).toLocaleTimeString("en-IN")} · Data: Yahoo
            Finance 2H (15-min delayed)
          </p>
        )}
      </div>

      {/* ── Modals & toasts ─────────────────────────────────────────────────── */}
      {editOpen && (
        <EditHoldingsModal
          holdings={etfHoldings}
          onSave={(h) => {
            saveHoldings(h);
            setEditOpen(false);
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
      {saving && (
        <div className="fixed bottom-4 right-4 bg-indigo-600 text-white text-xs px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin" /> Saving to file…
        </div>
      )}
    </div>
  );
}

export default function EtfMonitorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center text-slate-500">
          Loading…
        </div>
      }
    >
      <EtfMonitorInner />
    </Suspense>
  );
}
