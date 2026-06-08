// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — FACE 4: DEFI HEALTH INDEX
// X7 sees more DeFi positions than anyone
// Monetize the view from above
// ═══════════════════════════════════════════════════════
import { query, getConfig } from '../utils/db.js'
import { logger } from '../utils/logger.js'

// Calculate real-time DeFi health score (0-100)
export function calculateHealthScore() {
  const totalBorrowers = query('SELECT COUNT(*) as c FROM borrowers')[0]?.c || 0
  const liquidatableBorrowers = query(
    'SELECT COUNT(*) as c FROM borrowers WHERE CAST(health_factor AS REAL) < 1.0'
  )[0]?.c || 0
  const atRiskBorrowers = query(
    'SELECT COUNT(*) as c FROM borrowers WHERE CAST(health_factor AS REAL) < 1.1'
  )[0]?.c || 0

  if (totalBorrowers === 0) return { score: 85, level: 'healthy' }

  const liquidatableRatio = liquidatableBorrowers / totalBorrowers
  const atRiskRatio = atRiskBorrowers / totalBorrowers

  let score = 100
  score -= liquidatableRatio * 500  // -5 per 1% liquidatable
  score -= atRiskRatio * 200         // -2 per 1% at risk
  score = Math.max(0, Math.min(100, score))

  let level = 'healthy'
  if (score < 30) level = 'critical'
  else if (score < 50) level = 'stressed'
  else if (score < 70) level = 'moderate'

  return {
    score: Math.round(score),
    level,
    totalBorrowers,
    liquidatable: liquidatableBorrowers,
    atRisk: atRiskBorrowers,
    timestamp: Date.now()
  }
}

export function getIntelligenceReport() {
  const health = calculateHealthScore()
  const volatility = getConfig('market_volatility') || 'moderate'
  const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']

  const chainHealth = {}
  for (const chain of chains) {
    const liquidatable = query(
      'SELECT COUNT(*) as c FROM borrowers WHERE chain = ? AND CAST(health_factor AS REAL) < 1.0',
      [chain]
    )[0]?.c || 0
    chainHealth[chain] = liquidatable
  }

  return { health, volatility, chainHealth, generatedAt: new Date().toISOString() }
}
