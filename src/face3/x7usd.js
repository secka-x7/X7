// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — X7USD STABLECOIN MANAGEMENT
// Yield-bearing stablecoin targeting $321B market
// ═══════════════════════════════════════════════════════
import { getConfig, setConfig, query } from '../utils/db.js'
import { logger } from '../utils/logger.js'

export function getX7USDStats() {
  const circulation = parseFloat(getConfig('x7usd_circulation') || '0')
  const burned = parseFloat(getConfig('x7t_burned') || '0')
  const backingUSDC = parseFloat(getConfig('x7usd_backing_usdc') || '0')
  const backingRatio = circulation > 0 ? ((backingUSDC / circulation) * 100).toFixed(1) : '100.0'

  return {
    circulation: circulation.toFixed(2),
    backingUSDC: backingUSDC.toFixed(2),
    backingRatio: `${backingRatio}%`,
    currentAPY: '10.00%',
    totalIssued: query('SELECT SUM(CAST(amount AS REAL)) as t FROM x7usd WHERE event = \'issue\'')[0]?.t || 0,
    recentActivity: query('SELECT * FROM x7usd ORDER BY created_at DESC LIMIT 10')
  }
}

// Add backing USDC (called when liquidation profits arrive)
export function addBacking(usdcAmount) {
  const current = parseFloat(getConfig('x7usd_backing_usdc') || '0')
  setConfig('x7usd_backing_usdc', current + usdcAmount)
}
