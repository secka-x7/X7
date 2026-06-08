// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — X7 TREASURY (System Revenue)
// Tracks all revenue across all chains
// ═══════════════════════════════════════════════════════
import { getPublicClient } from '../utils/pimlico.js'
import { CHAINS } from '../config/chains.js'
import { query, run, getTotalRevenue, getTodayRevenue, getConfig, setConfig } from '../utils/db.js'
import { logger } from '../utils/logger.js'

// Track revenue from an execution
export function recordRevenue(chain, profitUsdc, strategy = 'liquidation') {
  run(
    `INSERT OR REPLACE INTO treasury (chain, token, balance, updated_at)
     VALUES (?, 'revenue_today', 
     COALESCE((SELECT CAST(balance AS REAL) FROM treasury WHERE chain = ? AND token = 'revenue_today'), 0) + ?,
     strftime('%s','now'))`,
    [chain, chain, profitUsdc]
  )
  logger.profit(`+$${profitUsdc.toFixed(2)} USDC on ${chain} via ${strategy}`)
}

// Get treasury summary for dashboard
export function getTreasurySummary() {
  return {
    totalAllTime: getTotalRevenue(),
    totalToday: getTodayRevenue(),
    byChain: getRevenueByChain(),
    withdrawals: query('SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 5')
  }
}

function getRevenueByChain() {
  const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']
  const result = {}
  for (const chain of chains) {
    const rows = query(
      `SELECT SUM(CAST(profit_usdc AS REAL)) as total FROM executions 
       WHERE chain = ? AND status = 'success'`,
      [chain]
    )
    result[chain] = rows[0]?.total || 0
  }
  return result
}

// Maintain gas reserves autonomously
export async function maintainGasReserves() {
  const minBalances = {
    arbitrum: 0.001,  // ETH
    polygon: 0.5,     // MATIC
    ethereum: 0.001,  // ETH
    avalanche: 0.01,  // AVAX
    bnb: 0.005        // BNB
  }

  for (const [chainName, minBalance] of Object.entries(minBalances)) {
    try {
      const { getExecutorBalance } = await import('../utils/pimlico.js')
      const balance = await getExecutorBalance(chainName)
      const chain = CHAINS[chainName]
      const balanceNative = Number(balance) / 10 ** chain.gasDecimals

      if (balanceNative < minBalance) {
        logger.warn(`Low gas on ${chainName}: ${balanceNative} ${chain.gasToken}`)
        // APEX-TREASURY will handle refill from profits
        setConfig(`low_gas_${chainName}`, 'true')
      } else {
        setConfig(`low_gas_${chainName}`, 'false')
      }
    } catch (e) {
      logger.error(`Gas check failed for ${chainName}:`, e.message)
    }
  }
}
