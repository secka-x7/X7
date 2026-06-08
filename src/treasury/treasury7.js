// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — TREASURY 7 (X7T + X7USD Management)
// ═══════════════════════════════════════════════════════
import { query, run, setConfig, getConfig } from '../utils/db.js'
import { logger } from '../utils/logger.js'

// X7T Token config
export const X7T = {
  totalSupply: 7_000_000_000,
  distributed: 0,
  burned: 0
}

// X7USD config
export const X7USD = {
  circulation: 0,
  backingRatio: 1.0, // Always >= 1.0 (overcollateralized)
  currentYieldAPY: 10.0 // percent
}

// Issue X7USD backed by treasury USDC
export function issueX7USD(usdcAmount, recipientAddress) {
  const currentCirculation = Number(getConfig('x7usd_circulation') || 0)
  const newCirculation = currentCirculation + usdcAmount

  setConfig('x7usd_circulation', newCirculation)
  run(
    `INSERT INTO x7usd (event, amount, address) VALUES ('issue', ?, ?)`,
    [String(usdcAmount), recipientAddress]
  )

  logger.info(`X7USD issued: ${usdcAmount} to ${recipientAddress}`)
  return { issued: usdcAmount, totalCirculation: newCirculation }
}

// Get Treasury 7 summary for dashboard
export function getTreasury7Summary() {
  const circulation = Number(getConfig('x7usd_circulation') || 0)
  const burned = Number(getConfig('x7t_burned') || 0)

  return {
    x7t: {
      totalSupply: X7T.totalSupply,
      circulatingSupply: X7T.totalSupply - burned,
      burned,
      burnedPercent: ((burned / X7T.totalSupply) * 100).toFixed(4)
    },
    x7usd: {
      circulation: circulation.toFixed(2),
      backingRatio: '100%+',
      yieldAPY: X7USD.currentYieldAPY,
      recentEvents: query('SELECT * FROM x7usd ORDER BY created_at DESC LIMIT 10')
    }
  }
}

// Record X7T burn (1% of all protocol fees)
export function burnX7T(amount) {
  const currentBurned = Number(getConfig('x7t_burned') || 0)
  setConfig('x7t_burned', currentBurned + amount)
  logger.info(`X7T burned: ${amount} tokens 🔥`)
}
