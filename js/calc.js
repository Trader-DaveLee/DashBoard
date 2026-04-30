function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

export function recalcTrade(trade) {
  const side = trade.side === 'SHORT' ? -1 : 1;
  const stop = Number(trade.stopPrice || 0);
  const targetPrice = Number(trade.targetPrice || 0);
  const accountSize = Math.max(0, Number(trade.accountSize || 0));
  const riskPct = Math.max(0, Number(trade.riskPct || 0));
  const riskDollar = accountSize * riskPct / 100;
  
  // 수동 입력값들
  const manualPnl = Number(trade.manualRealizedPnl || 0);
  const avgEntry = Number(trade.avgEntryPrice || 0);
  const exitPrice = Number(trade.exitPrice || 0);
  const rawQty = String(trade.totalPositionSize || '');
  const qty = Number(rawQty.replace(/[^0-9.]/g, '') || 0);
  const lev = Math.max(1, Number(trade.leverage || 1));

  // 기본 손익 및 R 계산
  const pnl = manualPnl;
  const r = riskDollar > 0 ? pnl / riskDollar : 0;
  const impact = accountSize > 0 ? (pnl / accountSize) * 100 : 0;

  // 거리 계산 (현재가 또는 평단가 기준)
  const current = Number(trade.currentPrice || avgEntry || 0);
  const stopDistPct = (current && stop) ? (Math.abs(current - stop) / current) * 100 : 0;
  const stopDistAbs = (current && stop) ? Math.abs(current - stop) : 0;

  const result = {
    valid: (avgEntry > 0 || pnl !== 0),
    directionError: false,
    riskDollar,
    avgEntry,
    avgExit: exitPrice,
    qty,
    margin: (avgEntry * qty) / lev,
    notional: avgEntry * qty,
    leverage: lev,
    weightedLeverage: lev,
    stopDistancePct: stopDistPct,
    stopDistanceAbs: stopDistAbs,
    pnl: pnl,
    netPnl: pnl,
    realizedPnl: pnl,
    unrealizedPnl: 0,
    r: r,
    realizedR: r,
    unrealizedR: 0,
    accountImpact: impact,
    projectedPnl: pnl,
    projectedR: r,
    totalFees: 0, 
    breakEvenPrice: avgEntry,
    actualRiskUsed: qty * stopDistAbs,
    actualRiskPctOfBudget: riskDollar > 0 ? (qty * stopDistAbs / riskDollar) * 100 : 0,
    residualRisk: trade.status === 'OPEN' ? qty * stopDistAbs : 0,
    actualExitPct: trade.status === 'CLOSED' ? 100 : 0,
    remainingPct: trade.status === 'OPEN' ? 100 : 0,
    entryBreakdown: [],
    projectionSteps: [],
    hasProjection: false,
    missingMarkPrice: false,
    exitExceeds100: false
  };

  // 추가 필드 병합 (UI 연동용)
  Object.assign(result, {
    manualRealizedPnl: trade.manualRealizedPnl,
    avgEntryPrice: trade.avgEntryPrice,
    exitPrice: trade.exitPrice,
    totalPositionSize: trade.totalPositionSize,
    result: trade.result,
    timeframe: trade.timeframe,
    capitalAllocation: trade.capitalAllocation
  });

  return result;
}

// Planner Suggestion은 수동 입력 모드에서는 큰 의미가 없으므로 최소화하거나 제거 가능
// 여기서는 호출 시 오류가 나지 않도록 빈 객체/기본값을 반환하는 형태로 유지하거나
// 사용자가 필요 없다고 했으므로 내부 로직을 아주 단순하게 변경
export function generatePlannerSuggestion(trade) {
  return {
    valid: false,
    reason: '수동 기록 모드에서는 플래너 기능을 사용하지 않습니다.',
    entries: [],
    metrics: recalcTrade(trade)
  };
}

function baseMetrics(pnlAdjustment = 0, riskDollar = 0, accountSize = 0, avgEntry = 0, directionError = false, trade = null) {
  // 기존 코드와의 하위 호환성을 위해 남겨두되, recalcTrade를 쓰도록 유도
  return recalcTrade(trade || { pnlAdjustment, riskDollar, accountSize, avgEntryPrice: avgEntry, side: 'LONG' });
}
