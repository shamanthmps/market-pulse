"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Search,
  BookOpen,
  TrendingUp,
  Settings,
  Activity,
  Zap,
  FlaskConical,
  PieChart,
} from "lucide-react";

const NAV_PRIMARY = [
  { href: "/etf-monitor", label: "ETF Monitor", icon: PieChart },
];

const NAV_SECONDARY = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/scanner", label: "Scanner", icon: Search },
  { href: "/planner", label: "Trade Planner", icon: Zap },
  { href: "/positions", label: "Positions", icon: TrendingUp },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/backtest", label: "Backtest", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-52 bg-slate-950 flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-tight">
                Market Pulse
              </p>
              <p className="text-xs text-slate-500 leading-tight">
                ETF Monitor
              </p>
            </div>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="px-3 pt-5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 px-2 mb-2">
            Portfolio
          </p>
          {NAV_PRIMARY.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/50"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mx-4 border-t border-slate-800 my-4" />

        {/* Secondary nav */}
        <nav className="px-3 pb-4 space-y-0.5 flex-1 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 px-2 mb-2">
            Dev Tools
          </p>
          {NAV_SECONDARY.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "bg-slate-800 text-slate-200"
                    : "text-slate-600 hover:bg-slate-900 hover:text-slate-400"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-slate-800">
          <p className="text-xs text-slate-600">NSE/BSE · Yahoo Finance</p>
          <p className="text-xs text-slate-700">2H delayed data</p>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-slate-950 border-t border-slate-800 flex items-center justify-around px-2 py-2 safe-area-pb">
        {[...NAV_PRIMARY, ...NAV_SECONDARY.slice(0, 3)].map(
          ({ href, label, icon: Icon }) => {
            const active =
              href === "/etf-monitor"
                ? pathname.startsWith(href)
                : pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                  active ? "text-indigo-400" : "text-slate-600"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">
                  {label.split(" ")[0]}
                </span>
              </Link>
            );
          },
        )}
      </nav>
    </>
  );
}
