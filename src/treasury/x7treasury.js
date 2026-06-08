// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — X7 TREASURY (System Revenue)
// All revenue tracking — fixed imports
// ═══════════════════════════════════════════════════════
import { run, query, setConfig, getConfig, getTotalRevenue, getTodayRevenue, recordRevenue } from '../utils/db.js'
import { logger } from '../utils/logger.js'

export { recordRevenue, getTotalRevenue, getTodayRevenue }

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
    try {
      const rows = query(
        `SELECT SUM(CAST(profit_usdc AS REAL)) as total FROM executions
         WHERE chain = ? AND status = 'success'`,
        [chain]
      )
      result[chain] = parseFloat(rows[0]?.total) || 0
    } catch { result[chain] = 0 }
  }
  return result
}

export async function maintainGasReserves() {
  const { getExecutorBalance } = await import('../utils/pimlico.js')
  const { CHAINS } = await import('../config/chains.js')
  const minBalances = {
    arbitrum: 0.001, polygon: 0.5, ethereum: 0.001, avalanche: 0.01, bnb: 0.005
  }
  for (const [chainName, minBalance] of Object.entries(minBalances)) {
    try {
      const balance = await getExecutorBalance(chainName)
      const chain = CHAINS[chainName]
      const balanceNative = Number(balance) / 10 ** chain.gasDecimals
      if (balanceNative < minBalance) {
        setConfig(`low_gas_${chainName}`, 'true')
        logger.warn(`Low gas on ${chainName}: ${balanceNative.toFixed(6)} ${chain.gasToken}`)
      } else {
        setConfig(`low_gas_${chainName}`, 'false')
      }
    } catch {}
  }
}
