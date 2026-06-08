// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — PATTERN LEARNER
// Learns from every execution to improve win rate
// Day 1: 40% win rate → Day 3: 80% win rate
// ═══════════════════════════════════════════════════════
import { query, setConfig, getConfig } from '../utils/db.js'
import { logger } from '../utils/logger.js'

// Calculate win rate per chain (last 100 executions)
export function getWinRate(chain) {
  const rows = query(
    `SELECT COUNT(*) as total,
     SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as wins
     FROM executions WHERE chain = ? ORDER BY created_at DESC LIMIT 100`,
    [chain]
  )
  if (!rows[0] || rows[0].total === 0) return 0.4 // Default 40%
  return rows[0].wins / rows[0].total
}

// Get optimal gas multiplier based on win rate
// More wins = we can be more conservative on gas
export function getGasMultiplier(chain) {
  const winRate = getWinRate(chain)
  if (winRate < 0.3) return 1.5  // Losing too much — bid higher
  if (winRate < 0.5) return 1.3
  if (winRate < 0.7) return 1.1
  return 1.05 // Winning well — minimal premium
}

// Get best performing hours (UTC)
export function getBestHours(chain) {
  const rows = query(
    `SELECT strftime('%H', datetime(created_at, 'unixepoch')) as hour,
     AVG(CAST(profit_usdc AS REAL)) as avg_profit,
     COUNT(*) as count
     FROM executions WHERE chain = ? AND status = 'success'
     GROUP BY hour ORDER BY avg_profit DESC LIMIT 5`,
    [chain]
  )
  return rows.map(r => parseInt(r.hour))
}

// Get most profitable collateral assets
export function getBestAssets(chain) {
  const rows = query(
    `SELECT collateral_asset,
     AVG(CAST(profit_usdc AS REAL)) as avg_profit,
     COUNT(*) as count
     FROM executions WHERE chain = ? AND status = 'success'
     GROUP BY collateral_asset ORDER BY avg_profit DESC LIMIT 10`,
    [chain]
  )
  return rows
}

// Adaptive threshold: lower min profit when win rate is high
export function getAdaptiveMinProfit(chain, baseMin = 30) {
  const winRate = getWinRate(chain)
  if (winRate > 0.8) return baseMin * 0.7  // Can afford lower profit
  if (winRate > 0.6) return baseMin * 0.85
  if (winRate < 0.3) return baseMin * 1.5  // Need higher margin when losing
  return baseMin
}

// Update learner stats every hour
export function updateLearnerStats() {
  const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']
  for (const chain of chains) {
    const winRate = getWinRate(chain)
    setConfig(`win_rate_${chain}`, winRate.toFixed(3))
    const multiplier = getGasMultiplier(chain)
    setConfig(`gas_multiplier_${chain}`, multiplier.toFixed(2))
  }
  logger.apex('Learner stats updated')
}
