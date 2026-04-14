/**
 * 🎲 Monte Carlo Simulation Engine
 * Generates probabilistic future performance based on historical trade distribution.
 */

export function runMonteCarlo(trades, options = {}) {
  const {
    startBalance = 10000,
    tradeCount = 50,
    iterationCount = 1000
  } = options;

  if (!trades.length) return null;

  // 1. Extract PnL distribution from historical trades
  const pnlPool = trades.map(t => Number(t.metrics?.pnl || 0));
  
  const paths = [];
  const finalBalances = [];
  let ruinCount = 0;
  const ruinThreshold = startBalance * 0.5; // 50% Drawdown considered as "Ruin"

  for (let i = 0; i < iterationCount; i++) {
    const path = [{ x: 0, y: startBalance }];
    let currentBalance = startBalance;
    let maxDD = 0;
    let peak = startBalance;

    for (let t = 1; t <= tradeCount; t++) {
      // Pick a random PnL from historical pool (with replacement)
      const randomPnL = pnlPool[Math.floor(Math.random() * pnlPool.length)];
      currentBalance += randomPnL;
      
      peak = Math.max(peak, currentBalance);
      maxDD = Math.max(maxDD, peak - currentBalance);

      path.push({ x: t, y: currentBalance });
    }

    if (maxDD >= ruinThreshold) ruinCount++;
    
    paths.push(path);
    finalBalances.push(currentBalance);
  }

  // Sort final balances for percentile calculation
  finalBalances.sort((a, b) => a - b);

  return {
    paths, // Full set of paths (may be large, suggested to only render a sample)
    stats: {
      avgFinal: finalBalances.reduce((a, b) => a + b, 0) / iterationCount,
      medianFinal: finalBalances[Math.floor(iterationCount / 2)],
      worstFinal: finalBalances[0],
      bestFinal: finalBalances[iterationCount - 1],
      probRuin: (ruinCount / iterationCount) * 100,
      p10: finalBalances[Math.floor(iterationCount * 0.1)], // 10th percentile
      p90: finalBalances[Math.floor(iterationCount * 0.9)], // 90th percentile
    }
  };
}
