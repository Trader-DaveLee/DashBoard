export function summarize(trades) {
  const closed = trades.filter(t => t.status === 'CLOSED');
  const wins = closed.filter(t => (t.metrics?.pnl || 0) > 0);
  const losses = closed.filter(t => (t.metrics?.pnl || 0) < 0);
  const open = trades.filter(t => t.status === 'OPEN');

  const pnls = closed.map(t => Number(t.metrics?.pnl || 0));
  const winPnls = wins.map(t => Number(t.metrics?.pnl || 0));
  const lossPnls = losses.map(t => Number(t.metrics?.pnl || 0));

  const grossProfit = sum(winPnls);
  const grossLossAbs = Math.abs(sum(lossPnls));
  const net = sum(pnls);
  const totalNet = sum(trades.map(t => t.metrics?.pnl || 0));
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  
  const expectancy = avg(pnls);
  const avgR = avg(closed.map(t => t.metrics?.r || 0));
  const maxDD = calcDrawdown(closed);
  const fees = sum(trades.map(t => t.metrics?.totalFees || 0));
  const leakRate = closed.length ? closed.filter(t => (t.mistakes || []).length).length / closed.length * 100 : 0;
  const profitFactor = grossLossAbs ? grossProfit / grossLossAbs : (grossProfit ? Infinity : 0);
  const avgWin = avg(winPnls);
  const avgLoss = avg(lossPnls);

  // 📈 Advanced Risk Metrics
  const stdev = stdDev(pnls);
  const sharpeRatio = stdev > 0 ? (expectancy / stdev) : 0;
  
  // Downside Deviation for Sortino
  const negativePnls = pnls.filter(v => v < 0);
  const downsideDev = stdDev(negativePnls.length ? negativePnls : [0]);
  const sortinoRatio = downsideDev > 0 ? (expectancy / downsideDev) : 0;

  // Kelly Criterion: K% = W - [(1 - W) / (AvgWin / |AvgLoss|)]
  const winRateFract = winRate / 100;
  const winLossRatio = avgLoss !== 0 ? (avgWin / Math.abs(avgLoss)) : 0;
  const kellyPct = (winRateFract > 0 && winLossRatio > 0) 
    ? (winRateFract - ((1 - winRateFract) / winLossRatio)) * 100 
    : 0;

  // Streak Analysis
  let maxConsecWins = 0;
  let maxConsecLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  [...closed].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
    const pnl = t.metrics?.pnl || 0;
    if (pnl > 0) {
      currentWins++;
      currentLosses = 0;
      maxConsecWins = Math.max(maxConsecWins, currentWins);
    } else if (pnl < 0) {
      currentLosses++;
      currentWins = 0;
      maxConsecLosses = Math.max(maxConsecLosses, currentLosses);
    }
  });

  return {
    trades, closed, wins, losses, open,
    grossProfit, grossLossAbs, net, totalNet, winRate, expectancy, avgR, maxDD, fees,
    leakRate, profitFactor, avgWin, avgLoss,
    sharpeRatio, sortinoRatio, kellyPct, maxConsecWins, maxConsecLosses, stdev,
    realized: sum(trades.map(t => t.metrics?.realizedPnl || 0)),
    unrealized: sum(open.map(t => t.metrics?.unrealizedPnl || 0)),
  };
}

export function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = avg(arr);
  const variance = arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

export function groupAverageR(trades, field) {
  const map = new Map();
  for (const trade of trades) {
    const key = field(trade);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(trade.metrics?.r || 0);
  }
  return [...map.entries()]
    .map(([label, values]) => ({ label, value: avg(values), count: values.length }))
    .sort((a, b) => b.value - a.value);
}

export function bucketStats(trades, field) {
  const map = new Map();
  for (const trade of trades) {
    const key = field(trade);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(trade);
  }
  return [...map.entries()].map(([label, rows]) => ({
    label,
    count: rows.length,
    totalPnl: sum(rows.map(r => r.metrics?.pnl || 0)),
    avgPnl: avg(rows.map(r => r.metrics?.pnl || 0)),
    avgR: avg(rows.map(r => r.metrics?.r || 0)),
    winRate: rows.length ? rows.filter(r => (r.metrics?.pnl || 0) > 0).length / rows.length * 100 : 0,
    feeDrag: sum(rows.map(r => r.metrics?.totalFees || 0)),
  })).sort((a, b) => b.avgR - a.avgR);
}

export function tagStats(trades, selector) {
  const map = new Map();
  for (const trade of trades) {
    for (const tag of selector(trade) || []) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(trade);
    }
  }
  return [...map.entries()].map(([label, rows]) => ({
    label,
    count: rows.length,
    totalPnl: sum(rows.map(r => r.metrics?.pnl || 0)),
    avgPnl: avg(rows.map(r => r.metrics?.pnl || 0)),
    avgR: avg(rows.map(r => r.metrics?.r || 0)),
    winRate: rows.length ? rows.filter(r => (r.metrics?.pnl || 0) > 0).length / rows.length * 100 : 0,
  })).sort((a, b) => a.totalPnl - b.totalPnl);
}

// ✨ 타임존 오차 없이 로컬(한국시간) 날짜를 안전하게 문자열로 비교
export function filterTradesByDate(trades, from, to) {
  return trades.filter(trade => {
    const tradeLocal = new Date(trade.date);
    if (Number.isNaN(tradeLocal.getTime())) return true;
    
    const pad = n => String(n).padStart(2, '0');
    const tradeDateStr = `${tradeLocal.getFullYear()}-${pad(tradeLocal.getMonth() + 1)}-${pad(tradeLocal.getDate())}`;

    if (from && tradeDateStr < from) return false;
    if (to && tradeDateStr > to) return false;
    return true;
  });
}

export function calcDrawdown(trades) {
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const trade of [...trades].sort((a, b) => new Date(a.date) - new Date(b.date))) {
    equity += trade.metrics?.pnl || 0;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }
  return maxDD;
}

export function sum(arr) {
  return arr.reduce((acc, value) => acc + Number(value || 0), 0);
}

export function avg(arr) {
  return arr.length ? sum(arr) / arr.length : 0;
}
