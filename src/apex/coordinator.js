// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — APEX COORDINATOR
// Orchestrates all faces and strategies
// The closed revenue loop — each face feeds the next
// ═══════════════════════════════════════════════════════
import { getStrategicDirection, getLastConfig } from './brain.js'
import { advanceSingularity } from './singularity.js'
import { runExpansion } from './expansion.js'
import { updateLearnerStats } from '../intelligence/learner.js'
import { startPriceUpdates } from '../intelligence/signals.js'
import { maintainGasReserves } from '../treasury/x7treasury.js'
import { shouldDeployYield } from './rules.js'
import { getConfig, setConfig, getTotalRevenue, getTodayRevenue } from '../utils/db.js'
import { logger } from '../utils/logger.js'

export async function startCoordinator() {
  logger.apex('APEX Coordinator starting...')

  // Start price feeds immediately
  startPriceUpdates()

  // Run coordination loop every 60 seconds
  setInterval(coordinationCycle, 60000)

  // Run expansion every 6 hours
  setInterval(runExpansion, 6 * 60 * 60 * 1000)

  // Update learner stats every hour
  setInterval(updateLearnerStats, 60 * 60 * 1000)

  // Check gas reserves every 30 minutes
  setInterval(maintainGasReserves, 30 * 60 * 1000)

  // Advance singularity every 30 minutes
  setInterval(advanceSingularity, 30 * 60 * 1000)

  // Initial coordination
  await coordinationCycle()
  logger.apex('APEX Coordinator active — Operation Singularity in progress')
}

async function coordinationCycle() {
  try {
    // 1. Get AI strategic direction
    const direction = await getStrategicDirection()

    // 2. Update system config with AI decisions
    setConfig('apex_priority_chain', direction.priorityChain || 'arbitrum')
    setConfig('apex_focus', direction.focusStrategy || 'liquidation')

    // 3. Track revenue stats
    const totalRev = getTotalRevenue()
    const todayRev = getTodayRevenue()
    setConfig('total_revenue', totalRev.toFixed(2))
    setConfig('today_revenue', todayRev.toFixed(2))

    logger.apex(`Cycle | Today: $${todayRev.toFixed(0)} | All time: $${totalRev.toFixed(0)}`)
  } catch (e) {
    logger.error('Coordinator cycle error:', e.message)
  }
}

export function getApexStatus() {
  return {
    priorityChain: getConfig('apex_priority_chain') || 'arbitrum',
    focus: getConfig('apex_focus') || 'liquidation',
    insight: getConfig('apex_insight') || 'Initializing...',
    lastAction: getConfig('apex_last_action') || 'Starting up...',
    totalRevenue: getTotalRevenue(),
    todayRevenue: getTodayRevenue()
  }
}
