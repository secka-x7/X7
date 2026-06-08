// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — APEX COORDINATOR
// Fixed: removed dynamic require() calls in ESM context
// ═══════════════════════════════════════════════════════
import { getStrategicDirection } from './brain.js'
import { advanceSingularity } from './singularity.js'
import { runExpansion } from './expansion.js'
import { updateLearnerStats } from '../intelligence/learner.js'
import { startPriceUpdates } from '../intelligence/signals.js'
import { maintainGasReserves } from '../treasury/x7treasury.js'
import { shouldDeployYield } from './rules.js'
import { getConfig, setConfig, getTotalRevenue, getTodayRevenue, logApex } from '../utils/db.js'
import { logger } from '../utils/logger.js'

export async function startCoordinator() {
  logger.apex('APEX Coordinator starting...')
  startPriceUpdates()
  setInterval(coordinationCycle, 60000)
  setInterval(runExpansion, 6 * 60 * 60 * 1000)
  setInterval(updateLearnerStats, 60 * 60 * 1000)
  setInterval(maintainGasReserves, 30 * 60 * 1000)
  setInterval(advanceSingularity, 30 * 60 * 1000)
  await coordinationCycle()
  logger.apex('APEX Coordinator active')
}

async function coordinationCycle() {
  try {
    const direction = await getStrategicDirection()
    setConfig('apex_priority_chain', direction.priorityChain || 'arbitrum')
    setConfig('apex_focus', direction.focusStrategy || 'liquidation')
    const totalRev = getTotalRevenue()
    const todayRev = getTodayRevenue()
    setConfig('total_revenue', totalRev.toFixed(2))
    setConfig('today_revenue', todayRev.toFixed(2))
    logApex('coordinator', 'cycle_complete', { today: todayRev, total: totalRev })
    logger.apex(`Cycle | Today: $${todayRev.toFixed(0)} | All time: $${totalRev.toFixed(0)}`)
  } catch (e) {
    logger.error('Coordinator cycle error:', e.message)
  }
}

export function getApexStatus() {
  return {
    priorityChain: getConfig('apex_priority_chain') || 'arbitrum',
    focus: getConfig('apex_focus') || 'liquidation',
    insight: getConfig('apex_insight') || 'Initializing APEX...',
    lastAction: getConfig('apex_last_action') || 'Starting up...',
    totalRevenue: getTotalRevenue(),
    todayRevenue: getTodayRevenue()
  }
}
