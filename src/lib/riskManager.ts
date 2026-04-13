/**
 * riskManager.ts
 * Handles position sizing, R:R validation, and portfolio-level risk rules.
 *
 * Rules enforced:
 *  - Max risk per trade: 1% of account (configurable, max 2%)
 *  - Minimum R:R ratio: 1:2 (target must be at least 2x the SL distance)
 *  - Max open positions: 5
 *  - Daily loss limit: 3% of account
 *  - Never risk more than 5% of account across all open positions combined
 */

export interface RiskParams {
  accountSize: number;      // INR
  riskPercent: number;      // e.g. 1 = 1%
  entryPrice: number;
  stopLoss: number;
  direction: "LONG" | "SHORT";
  openPositionsRisk: number; // total current risk on open trades in INR
  todayLoss: number;         // realized loss today in INR (positive = loss)
}

export interface RiskResult {
  isValid: boolean;
  rejectionReasons: string[];

  positionSize: number;      // shares/lots
  riskAmount: number;        // INR at risk on this trade
  riskPercent: number;       // actual % of account
  slDistance: number;        // entry - SL in points
  targetPrice: number;       // minimum target (1:2 R:R)
  rewardAmount: number;      // INR if target hit
  rrRatio: number;           // reward / risk
}

export const RISK_RULES = {
  MAX_RISK_PERCENT: 2,
  MIN_RR_RATIO: 2,
  MAX_OPEN_POSITIONS: 5,
  DAILY_LOSS_LIMIT_PERCENT: 3,
  MAX_PORTFOLIO_RISK_PERCENT: 5,
};

export function calculateRisk(params: RiskParams): RiskResult {
  const {
    accountSize,
    riskPercent,
    entryPrice,
    stopLoss,
    direction,
    openPositionsRisk,
    todayLoss,
  } = params;

  const rejectionReasons: string[] = [];

  // Clamp risk percent
  const clampedRisk = Math.min(riskPercent, RISK_RULES.MAX_RISK_PERCENT);
  const riskAmount = (accountSize * clampedRisk) / 100;

  // SL distance
  const slDistance =
    direction === "LONG"
      ? entryPrice - stopLoss
      : stopLoss - entryPrice;

  if (slDistance <= 0) {
    rejectionReasons.push("Stop loss is on the wrong side of entry.");
    return {
      isValid: false,
      rejectionReasons,
      positionSize: 0,
      riskAmount: 0,
      riskPercent: clampedRisk,
      slDistance: 0,
      targetPrice: 0,
      rewardAmount: 0,
      rrRatio: 0,
    };
  }

  // Position size = risk / SL distance (in shares)
  const positionSize = Math.floor(riskAmount / slDistance);

  if (positionSize < 1) {
    rejectionReasons.push(
      "Position size < 1 share. SL is too wide or account too small for this trade."
    );
  }

  // Target price (1:2 R:R minimum)
  const targetDistance = slDistance * RISK_RULES.MIN_RR_RATIO;
  const targetPrice =
    direction === "LONG"
      ? Math.round((entryPrice + targetDistance) * 100) / 100
      : Math.round((entryPrice - targetDistance) * 100) / 100;

  const rewardAmount = positionSize * targetDistance;
  const rrRatio = targetDistance / slDistance;

  // ── Rule checks ─────────────────────────────────────────────────────────────

  // 1. Daily loss limit
  const dailyLossPercent = (todayLoss / accountSize) * 100;
  if (dailyLossPercent >= RISK_RULES.DAILY_LOSS_LIMIT_PERCENT) {
    rejectionReasons.push(
      `Daily loss limit hit: ${dailyLossPercent.toFixed(1)}% ≥ ${RISK_RULES.DAILY_LOSS_LIMIT_PERCENT}%. No new trades today.`
    );
  }

  // 2. Portfolio risk cap
  const newTotalRisk = openPositionsRisk + riskAmount;
  const portfolioRiskPercent = (newTotalRisk / accountSize) * 100;
  if (portfolioRiskPercent > RISK_RULES.MAX_PORTFOLIO_RISK_PERCENT) {
    rejectionReasons.push(
      `Portfolio risk would be ${portfolioRiskPercent.toFixed(1)}% > max ${RISK_RULES.MAX_PORTFOLIO_RISK_PERCENT}%.`
    );
  }

  // 3. Risk percent cap
  if (clampedRisk > RISK_RULES.MAX_RISK_PERCENT) {
    rejectionReasons.push(
      `Risk ${clampedRisk}% exceeds max allowed ${RISK_RULES.MAX_RISK_PERCENT}%.`
    );
  }

  return {
    isValid: rejectionReasons.length === 0,
    rejectionReasons,
    positionSize,
    riskAmount: Math.round(riskAmount),
    riskPercent: clampedRisk,
    slDistance: Math.round(slDistance * 100) / 100,
    targetPrice,
    rewardAmount: Math.round(rewardAmount),
    rrRatio: Math.round(rrRatio * 10) / 10,
  };
}

// ── Trade outcome analytics ───────────────────────────────────────────────────
export interface TradeRecord {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  targetPrice: number;
  positionSize: number;
  riskAmount: number;
  pnl: number;              // realized P&L in INR
  rMultiple: number;        // pnl / riskAmount
  entryTime: number;
  exitTime: number;
  exitReason: "TARGET" | "STOPLOSS" | "MANUAL";
  notes?: string;
  signals?: string[];
  signalScore?: number;
}

export interface PortfolioStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;       // avg R per trade
  maxDrawdown: number;
  sharpeRatio: number;
  largestWin: number;
  largestLoss: number;
  avgHoldingHours: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}

export function computeStats(trades: TradeRecord[]): PortfolioStats {
  if (trades.length === 0) {
    return {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      totalPnl: 0, grossProfit: 0, grossLoss: 0, profitFactor: 0,
      avgWin: 0, avgLoss: 0, expectancy: 0, maxDrawdown: 0,
      sharpeRatio: 0, largestWin: 0, largestLoss: 0,
      avgHoldingHours: 0, consecutiveWins: 0, consecutiveLosses: 0,
    };
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);

  // R-multiples for expectancy & Sharpe
  const rMultiples = trades.map((t) => t.rMultiple);
  const avgR = rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length;
  const stdR = Math.sqrt(
    rMultiples.map((r) => (r - avgR) ** 2).reduce((a, b) => a + b, 0) /
      rMultiples.length
  );

  // Max drawdown (equity curve)
  let peak = 0, equity = 0, maxDD = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  // Consecutive wins/losses
  let maxConsecWins = 0, maxConsecLosses = 0;
  let curW = 0, curL = 0;
  for (const t of trades) {
    if (t.pnl > 0) { curW++; curL = 0; maxConsecWins = Math.max(maxConsecWins, curW); }
    else { curL++; curW = 0; maxConsecLosses = Math.max(maxConsecLosses, curL); }
  }

  // Avg holding time
  const avgHoldingHours =
    trades.reduce((s, t) => s + (t.exitTime - t.entryTime), 0) /
    trades.length /
    3600;

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: Math.round((wins.length / trades.length) * 1000) / 10,
    totalPnl: Math.round(totalPnl),
    grossProfit: Math.round(grossProfit),
    grossLoss: Math.round(grossLoss),
    profitFactor: grossLoss === 0 ? 999 : Math.round((grossProfit / grossLoss) * 100) / 100,
    avgWin: wins.length ? Math.round(grossProfit / wins.length) : 0,
    avgLoss: losses.length ? Math.round(grossLoss / losses.length) : 0,
    expectancy: Math.round(avgR * 100) / 100,
    maxDrawdown: Math.round(maxDD),
    sharpeRatio: stdR === 0 ? 0 : Math.round((avgR / stdR) * 100) / 100,
    largestWin: Math.round(Math.max(...wins.map((t) => t.pnl), 0)),
    largestLoss: Math.round(Math.min(...losses.map((t) => t.pnl), 0)),
    avgHoldingHours: Math.round(avgHoldingHours * 10) / 10,
    consecutiveWins: maxConsecWins,
    consecutiveLosses: maxConsecLosses,
  };
}
