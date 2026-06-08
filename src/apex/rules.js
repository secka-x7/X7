// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — APEX RULE ENGINE
// Deterministic decisions — no AI needed — <1ms
// Handles 90% of decisions without Claude API
// ═══════════════════════════════════════════════════════
import { getConfig, setConfig } from '../utils/db.js'
import { getAdaptiveMinProfit } from '../intelligence/learner.js'
import { MIN_PROFIT_USD } from '../config/protocols.js'
import { logger } from '../utils/logger.js'

// Should we execute this liquidation?
export function shouldExecute(opportunity) {
  const { chain, healthFactor, profitUSD, debtUSD } = opportunity

  // Rule 1: Must be liquidatable
  if (healthFactor >= 1.0) return { execute: false, reason: 'not_liquidatable' }

  // Rule 2: Circuit breaker check
  const circuitOpen = getConfig(`circuit_${chain}`) === 'open'
  if (circuitOpen) return { execute: false, reason: 'circuit_breaker' }

  // Rule 3: Profit threshold (adaptive)
  const minProfit = getAdaptiveMinProfit(chain, MIN_PROFIT_USD[chain] || 30)
  if (profitUSD < minProfit) return { execute: false, reason: `profit_too_low_${profitUSD}_min_${minProfit}` }

  // Rule 4: Degraded mode — still execute but log
  const degraded = getConfig('degraded_mode') === 'true'
  if (degraded) logger.warn('Executing in degraded mode')

  // Rule 5: Max single liquidation size (risk management)
  if (debtUSD > 50_000_000) return { execute: false, reason: 'position_too_large' }

  return { execute: true, reason: 'approved' }
}

// Priority score for opportunity queue
export function priorityScore(opportunity) {
  const profitScore = Math.min(opportunity.profitUSD / 1000, 50) // Up to 50 pts
  const urgencyScore = opportunity.healthFactor < 0.95 ? 30 : 10
  const chainScore = { arbitrum: 10, polygon: 8, ethereum: 6, avalanche: 5, bnb: 4 }
  return profitScore + urgencyScore + (chainScore[opportunity.chain] || 3)
}

// Decide gas bid strategy
export function getGasBid(chainName, baseGasPrice) {
  const multiplierStr = getConfig(`gas_multiplier_${chainName}`) || '1.1'
  const multiplier = parseFloat(multiplierStr)
  return BigInt(Math.floor(Number(baseGasPrice) * multiplier))
}

// Should we deploy capital to yield?
export function shouldDeployYield(availableUSDC) {
  if (availableUSDC < 100) return false
  const degraded = getConfig('degraded_mode') === 'true'
  if (degraded) return false
  return true
}
