/**
 * store.ts — Zustand global state for Market Pulse
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TradeRecord } from "@/lib/riskManager";

export interface EtfHolding {
  symbol: string; // e.g. "BANKBEES.NS"
  displayName: string; // "Bank BeES"
  qty: number;
  avgCost: number;
}

export interface WatchlistItem {
  symbol: string; // e.g. "RELIANCE.NS"
  displayName: string;
  exchange: "NSE" | "BSE" | "CRYPTO";
  addedAt: number;
}

export interface OpenPosition {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  positionSize: number;
  riskAmount: number;
  entryTime: number;
  signalScore: number;
  currentPrice?: number;
  unrealizedPnl?: number;
  notes?: string;
}

export interface AccountSettings {
  accountSize: number;
  riskPercent: number;
  maxOpenPositions: number;
  dailyLossLimitPercent: number;
}

interface MarketPulseStore {
  // Account
  account: AccountSettings;
  setAccount: (s: AccountSettings) => void;

  // Watchlist
  watchlist: WatchlistItem[];
  addToWatchlist: (item: WatchlistItem) => void;
  removeFromWatchlist: (symbol: string) => void;

  // Open positions (paper trading)
  openPositions: OpenPosition[];
  addPosition: (p: OpenPosition) => void;
  closePosition: (
    id: string,
    exitPrice: number,
    exitReason: TradeRecord["exitReason"],
    notes?: string,
  ) => void;
  updatePositionPrice: (symbol: string, currentPrice: number) => void;

  // Trade journal
  trades: TradeRecord[];
  todayLoss: number;

  // UI state
  selectedSymbol: string | null;
  setSelectedSymbol: (s: string | null) => void;
  selectedTimeframe: string;
  setSelectedTimeframe: (tf: string) => void;
}

export const useStore = create<MarketPulseStore>()(
  persist(
    (set, get) => ({
      account: {
        accountSize: 100000,
        riskPercent: 1,
        maxOpenPositions: 5,
        dailyLossLimitPercent: 3,
      },
      setAccount: (account) => set({ account }),

      watchlist: [
        {
          symbol: "RELIANCE.NS",
          displayName: "Reliance",
          exchange: "NSE",
          addedAt: Date.now(),
        },
        {
          symbol: "TCS.NS",
          displayName: "TCS",
          exchange: "NSE",
          addedAt: Date.now(),
        },
        {
          symbol: "HDFCBANK.NS",
          displayName: "HDFC Bank",
          exchange: "NSE",
          addedAt: Date.now(),
        },
        {
          symbol: "INFY.NS",
          displayName: "Infosys",
          exchange: "NSE",
          addedAt: Date.now(),
        },
        {
          symbol: "ICICIBANK.NS",
          displayName: "ICICI Bank",
          exchange: "NSE",
          addedAt: Date.now(),
        },
        {
          symbol: "NIFTY50.NS",
          displayName: "Nifty 50 ETF",
          exchange: "NSE",
          addedAt: Date.now(),
        },
        {
          symbol: "SBIN.NS",
          displayName: "SBI",
          exchange: "NSE",
          addedAt: Date.now(),
        },
        {
          symbol: "WIPRO.NS",
          displayName: "Wipro",
          exchange: "NSE",
          addedAt: Date.now(),
        },
      ],
      addToWatchlist: (item) =>
        set((s) => ({
          watchlist: s.watchlist.find((w) => w.symbol === item.symbol)
            ? s.watchlist
            : [...s.watchlist, item],
        })),
      removeFromWatchlist: (symbol) =>
        set((s) => ({
          watchlist: s.watchlist.filter((w) => w.symbol !== symbol),
        })),

      openPositions: [],
      addPosition: (p) =>
        set((s) => ({ openPositions: [...s.openPositions, p] })),
      closePosition: (id, exitPrice, exitReason, notes) => {
        const state = get();
        const pos = state.openPositions.find((p) => p.id === id);
        if (!pos) return;

        const pnl =
          pos.direction === "LONG"
            ? (exitPrice - pos.entryPrice) * pos.positionSize
            : (pos.entryPrice - exitPrice) * pos.positionSize;

        const rMultiple = pnl / pos.riskAmount;

        const record: TradeRecord = {
          id: pos.id,
          symbol: pos.symbol,
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          exitPrice,
          stopLoss: pos.stopLoss,
          targetPrice: pos.targetPrice,
          positionSize: pos.positionSize,
          riskAmount: pos.riskAmount,
          pnl: Math.round(pnl),
          rMultiple: Math.round(rMultiple * 100) / 100,
          entryTime: pos.entryTime,
          exitTime: Date.now() / 1000,
          exitReason,
          notes,
          signalScore: pos.signalScore,
        };

        const todayLoss = state.todayLoss + (pnl < 0 ? Math.abs(pnl) : 0);

        set((s) => ({
          openPositions: s.openPositions.filter((p) => p.id !== id),
          trades: [...s.trades, record],
          todayLoss,
        }));
      },
      updatePositionPrice: (symbol, currentPrice) =>
        set((s) => ({
          openPositions: s.openPositions.map((p) => {
            if (p.symbol !== symbol) return p;
            const unrealizedPnl =
              p.direction === "LONG"
                ? (currentPrice - p.entryPrice) * p.positionSize
                : (p.entryPrice - currentPrice) * p.positionSize;
            return {
              ...p,
              currentPrice,
              unrealizedPnl: Math.round(unrealizedPnl),
            };
          }),
        })),

      trades: [],
      todayLoss: 0,

      selectedSymbol: "RELIANCE.NS",
      setSelectedSymbol: (s) => set({ selectedSymbol: s }),
      selectedTimeframe: "1d",
      setSelectedTimeframe: (tf) => set({ selectedTimeframe: tf }),
    }),
    {
      name: "market-pulse-store",
      partialize: (s) => ({
        account: s.account,
        watchlist: s.watchlist,
        openPositions: s.openPositions,
        trades: s.trades,
        todayLoss: s.todayLoss,
      }),
    },
  ),
);
