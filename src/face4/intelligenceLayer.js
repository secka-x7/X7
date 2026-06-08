// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — FACE 4: INTELLIGENCE LAYER
// Systemic risk detection and data monetization
// ═══════════════════════════════════════════════════════
import { calculateHealthScore } from './healthIndex.js'
import { query, getConfig } from '../utils/db.js'

export function getSystemicRiskReport() {
  const health = calculateHealthScore()
  const cascadeData = {}
  const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']

  for (const chain of chains) {
    const tier1 = query(
      `SELECT COUNT(*) as c, SUM(CAST(debt_usd AS REAL)) as total 
       FROM borrowers WHERE chain = ? AND CAST(health_factor AS REAL) < 1.0`,
      [chain]
    )[0] || { c: 0, total: 0 }

    cascadeData[chain] = {
      liquidatablePositions: tier1.c,
      totalDebtAtRisk: tier1.total || 0
    }
  }

  return {
    overallHealthScore: health.score,
    riskLevel: health.level,
    cascadeRisk: cascadeData,
    recommendation: health.score < 50
      ? 'HIGH ALERT: Multiple cascade events imminent'
      : health.score < 70
        ? 'MODERATE: Monitor closely'
        : 'STABLE: Normal operations',
    generatedAt: new Date().toISOString()
  }
}
