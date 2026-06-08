// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — FACE 3: CONVERGENCE VAULT
// All tokens → one vault → X7USD issued
// ═══════════════════════════════════════════════════════
import { query, run, setConfig, getConfig } from '../utils/db.js'
import { getPrice } from '../intelligence/signals.js'
import { issueX7USD } from '../treasury/treasury7.js'
import { logger } from '../utils/logger.js'

// Track vault deposits
export function recordVaultDeposit(address, tokenSymbol, amount, usdValue) {
  run(
    `INSERT INTO x7usd (event, amount, address)
     VALUES ('vault_deposit', ?, ?)`,
    [String(usdValue), address]
  )

  const currentTVL = parseFloat(getConfig('vault_tvl') || '0')
  setConfig('vault_tvl', currentTVL + usdValue)

  // Issue X7USD to depositor
  issueX7USD(usdValue, address)
  logger.success(`Vault deposit: ${amount} ${tokenSymbol} ($${usdValue.toFixed(2)}) from ${address.slice(0, 10)}`)
  return usdValue
}

export function getVaultStats() {
  return {
    tvl: parseFloat(getConfig('vault_tvl') || '0'),
    x7usdCirculation: parseFloat(getConfig('x7usd_circulation') || '0'),
    depositCount: query('SELECT COUNT(*) as c FROM x7usd WHERE event = \'vault_deposit\'')[0]?.c || 0
  }
}
