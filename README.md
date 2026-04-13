<div align="center">

# Market Pulse

**Algorithmic trading research platform for Indian equities**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/new/clone?repository-url=https://github.com/shamanthmps/market-pulse)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

[**Live Demo**](https://market-pulse-shamanth.vercel.app) &nbsp;·&nbsp; [How It Works](https://market-pulse-shamanth.vercel.app/how-it-works.html) &nbsp;·&nbsp; [Deploy in 1 Click](#one-click-deploy)

</div>

---

## What is this?

Market Pulse is a self-hosted algo trading research platform built for Indian equity markets (NSE).

You tell it what ETFs you hold and at what price. It watches NIFTY RSI across two timeframes and tells you exactly what to do - when to deploy more capital, when to sit on your hands, when to sell covered calls, and when to lock in profits with a hedge collar. All of that, live, every time you open the app.

Beyond the portfolio monitor, it lets you backtest 10 strategies on any NSE stock, paper trade with proper position sizing, and track your trading performance over time.

**No API key. No paid data feed. No broker account needed.**

Data comes free from Yahoo Finance. Nothing is stored on any server. You own everything.

---

## Your data never leaves your machine

> This is the most important thing to understand before you start.

Market Pulse has **no backend, no database, no user accounts**. There is no server storing your portfolio.

- Your ETF holdings live in a single JSON file on your own machine (or your own private fork)
- Live prices are fetched directly from Yahoo Finance in your browser - no intermediary
- If you deploy to Vercel, your holdings file deploys with your code - only you control it
- Nothing is ever sent to any third-party service

**The right way to use this with your real data: fork the repo, add your holdings to `data/holdings.json` in your private fork, deploy to Vercel.** Your portfolio lives in your own GitHub repo, behind your own Vercel deployment, optionally PIN-locked. Nobody else can see it.

---

## What it actually helps you decide

The ETF monitor is not a chart you stare at. It is a **decision engine** - it reads the current market condition and tells you:

| When NIFTY RSI is... | Market Pulse tells you to... |
|---|---|
| Below 30 (oversold) | Deploy cash in 3 tranches - 1/3 now, 1/3 lower, 1/3 lower still. Buy the most oversold ETF. |
| 30–45 (recovering) | Move funds from savings into your LiquidCase so you are ready. No buys yet. |
| 45–70 (normal) | Hold. Let your ETFs compound. Park surplus in LiquidCase. |
| 70–80 (extended) | Pause new lump sums. Sell OTM NIFTY calls at 5% OTM to collect premium while waiting. |
| Above 80 (overbought) | Sell covered calls aggressively. Consider the Gain-Lock Collar to protect your gains. |

It also checks your **actual portfolio gain percentage** against your cost basis. If you are sitting on 5%+ gains and the market is extended, it triggers the **Gain-Lock Rolling Collar** - a 3-leg options hedge that locks in your profits without selling a single ETF unit. It computes exact strike prices, lot sizes, and expiry dates so you know precisely what to execute.

No guessing. No FOMO. No panic selling. Just a clear signal every time you check.

---

## Features

### ETF Portfolio Monitor
- Dual-timeframe NIFTY RSI (2H + Daily) - catches real inflection points, not noise
- Five zones with exact action rules: BUY / WATCH / HOLD / CAUTION / HEDGE
- **Gain-Lock Rolling Collar** - 3-leg hedge with computed strikes, lots, and expiry dates
- LiquidCase tracker - always know how much deployable cash you have ready
- Per-ETF RSI so you know which one to buy when you are in the BUY zone
- PIN gate - lock your monitor when deployed publicly

### Strategy Backtester
- **10 strategies** across momentum, mean reversion, volatility breakout, and regime-filtered approaches
- Walk-forward engine with no look-ahead bias, ATR stops, 1:2 R:R, realistic slippage
- Single stock or Portfolio mode - see combined equity curve, monthly P&L, win rate, max drawdown

### Paper Trading Flow
- `/planner` - symbol + risk % = exact position size, entry, SL, target
- `/positions` - track open trades
- `/journal` - full closed trade log
- `/analytics` - equity curve, win rate, monthly P&L over time

### Scanner
- Scan multiple NSE symbols at once against any strategy
- Signal strength, RSI, trend direction in a single table

---

## Quick start (3 commands)

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/shamanthmps/market-pulse.git
cd market-pulse
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app loads with demo holdings so you can explore every feature immediately. Replace with your real data when you are ready (see below).

---

## Use it with your real portfolio (recommended)

The best way to get full value from Market Pulse is to run it against your actual holdings.

### Option 1 - Local only (simplest)

1. Clone the repo
2. Edit `data/holdings.json` with your real ETFs, quantities, and average costs
3. Run `npm run dev` - your real portfolio is live locally
4. Your holdings file never goes anywhere

### Option 2 - Private fork + Vercel (recommended)

This gives you a live, always-on URL you can check from your phone anytime.

```bash
# 1. Fork the repo on GitHub (keeps your data in your own account)
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/market-pulse.git
cd market-pulse

# 3. Add your holdings
# Edit data/holdings.json - see format below

# 4. Set a PIN so only you can view your portfolio
# (see PIN setup section below)

# 5. Commit and push
git add data/holdings.json
git commit -m "add my portfolio"
git push

# 6. Deploy - connect your fork to Vercel
# vercel.com/new -> Import Git Repository -> select your fork
```

Your app is live at `your-project.vercel.app/etf-monitor`. PIN-locked so only you can see your data. Every time you update your holdings, push the change and Vercel redeploys in ~60 seconds.

### Holdings file format

```json
{
  "etfHoldings": [
    { "symbol": "NIFTYBEES.NS",   "displayName": "Nifty BeES",     "qty": 500,   "avgCost": 240.50 },
    { "symbol": "BANKBEES.NS",    "displayName": "Bank BeES",       "qty": 200,   "avgCost": 510.00 },
    { "symbol": "MIDCAPIETF.NS",  "displayName": "Midcap ETF",      "qty": 1000,  "avgCost": 22.10  },
    { "symbol": "SMALLCAP.NS",    "displayName": "Smallcap ETF",    "qty": 800,   "avgCost": 45.00  },
    { "symbol": "MOM30IETF.NS",   "displayName": "Momentum 30 ETF", "qty": 600,   "avgCost": 30.00  }
  ],
  "liquidcaseAmount": 50000,
  "updatedAt": "2026-04-13"
}
```

- `symbol` - use `TICKER.NS` format for NSE (Yahoo Finance convention)
- `qty` - total units held (include any pledged shares)
- `avgCost` - your average purchase price per unit
- `liquidcaseAmount` - cash you have set aside and ready to deploy on a BUY signal
- `updatedAt` - any date string, just for your reference

**Common NSE ETF symbols:** `NIFTYBEES.NS` `BANKBEES.NS` `ITBEES.NS` `MIDCAPIETF.NS` `SMALLCAP.NS` `MOM30IETF.NS` `MONIFTY500.NS` `LOWVOLIETF.NS`

---

## One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/shamanthmps/market-pulse)

1. Click the button
2. Connect your GitHub account - Vercel forks the repo into your account automatically
3. Edit `data/holdings.json` in your new fork with your real data
4. Set your PIN hash in Vercel environment variables (see below)
5. Push - Vercel redeploys in ~60 seconds

---

## PIN-protect your ETF monitor

Lock `/etf-monitor` behind a 4-digit PIN so only you can view your portfolio when deployed.

**Step 1 - Generate your hash** (run in browser console):

```js
crypto.subtle.digest("SHA-256", new TextEncoder().encode("YOUR_PIN"))
  .then(b => console.log(Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join("")))
```

**Step 2 - Set it in Vercel:**
Dashboard > Your Project > Settings > Environment Variables

```
NEXT_PUBLIC_PIN_HASH = <paste your hash here>
```

If the variable is not set, the PIN gate is disabled and the monitor is open.

---

## Strategies included

| Strategy | Best for | Key logic |
|---|---|---|
| SMA Crossover | Trending markets | SMA(20) x SMA(50) golden/death cross |
| RSI Mean Reversion | Range-bound stocks | RSI < 35 bounce / RSI > 65 short |
| EMA Momentum Stack | Strong uptrends | EMA(9) > EMA(20) > EMA(50) + MACD |
| Multi-Signal Confluence | High-conviction entries | 6-point scoring system |
| ETF Dip Buy | Index ETFs | RSI oversold + volume + EMA200 trend |
| UTBot + LinReg v1 | General momentum | UT Bot trailing stop + LinReg candle colour |
| UTBot + LinReg v2 | Filtered momentum | v1 + higher timeframe EMA trend filter |
| UTBot + LinReg v3 | Regime-aware | v2 + Nifty market regime filter |
| Supertrend + ADX | Trending instruments | Supertrend crossovers gated by ADX >= 18 |
| TTM Squeeze | Volatility breakouts | Bollinger inside Keltner compression + LazyBear momentum |

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | File-based routing, server components, built-in API routes |
| Language | TypeScript 5 | Full type safety across indicators, strategies, and API layer |
| Styling | Tailwind CSS 4 | Utility-first, zero runtime CSS |
| Charts | Lightweight Charts + Recharts | TradingView-quality candlesticks + composable stat charts |
| State | Zustand + localStorage | Zero-config persistence, no backend needed |
| Data | Yahoo Finance (free) | No API key, covers all NSE/BSE symbols |

---

## Project structure

```
src/
  app/
    api/
      backtest/      - backtest engine API (Yahoo Finance + strategy runner)
      etf-monitor/   - RSI signal + hedge verdict API
      quote/         - single symbol live quote + signal
      scan/          - multi-symbol scanner
    backtest/        - backtest UI (single + portfolio mode)
    etf-monitor/     - ETF monitor, RSI zones, Gain-Lock Collar card
    planner/         - paper trade entry with position sizing
    positions/       - open positions tracker
    journal/         - closed trade history
    analytics/       - win rate, equity curve, monthly P&L
    scanner/         - multi-symbol signal scanner
  lib/
    indicators.ts    - EMA, SMA, RSI, MACD, ATR, ADX, Supertrend, LinReg, UTBot, Bollinger
    backtest.ts      - walk-forward engine, slippage model, strategy dispatcher
    strategies.ts    - strategy registry
    store.ts         - Zustand store with localStorage persistence
    riskManager.ts   - position sizing, risk rules
data/
  holdings.json      - your ETF portfolio (edit this)
public/
  how-it-works.html  - public explainer page (shareable, no PIN required)
```

---

## Limitations

- **Paper trading only.** No broker API - this is a research and planning tool.
- **Yahoo Finance data.** Free tier can rate-limit on large scans (10+ symbols simultaneously).
- **2H candles are resampled** from 1H data - Yahoo Finance does not natively support 2H intervals.
- **Indian markets only.** NSE/BSE symbols tested. International symbols not verified.
- **Backtests are not guarantees.** Historical results do not predict future performance.

---

## Contributing

PRs are welcome. Open an issue first for anything larger than a bug fix.

Good areas for contributions:
- Additional strategies
- Broker API integration (Zerodha Kite, Upstox)
- Live price auto-refresh on the positions page
- Mobile layout improvements

---

## License

MIT

---

## Built by

**Shamanth Kumar M** - Staff Technical Program Manager with 14+ years in engineering delivery. I build systems that replace manual work: sprint trackers, DevOps pipelines, delivery health dashboards, and now algo trading tools.

Market Pulse is something I built for myself - to stop guessing when to invest, when to hold, and when to protect gains. I'm sharing it because I think more people should have a system like this.

[![Website](https://img.shields.io/badge/Website-shamanthkm.vercel.app-black?logo=vercel)](https://shamanthkm.vercel.app/)
[![GitHub](https://img.shields.io/badge/GitHub-shamanthmps-181717?logo=github)](https://github.com/shamanthmps)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-shamanthkumarm-0A66C2?logo=linkedin)](https://www.linkedin.com/in/shamanthkumarm/)
[![YouTube](https://img.shields.io/badge/YouTube-ShamanthDanceClub-FF0000?logo=youtube)](https://www.youtube.com/@ShamanthDanceClub)
[![Instagram](https://img.shields.io/badge/Instagram-shamanth__skm-E4405F?logo=instagram)](https://www.instagram.com/shamanth_skm/)

If this helped you, star the repo. If you build something with it, I'd love to hear about it.


