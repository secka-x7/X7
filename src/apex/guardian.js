// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — APEX GUARDIAN
// System health monitoring and self-healing
// Runs continuously — first thing started on deploy
// ═══════════════════════════════════════════════════════
import { getConfig, setConfig, logApex } from '../utils/db.js'
import { logger } from '../utils/logger.js'
import { validateEnvironment } from '../safety/wizard.js'

let wsHealth = {}
let lastExecutionTime = {}

export function initGuardian() {
  validateEnvironment()

  // Monitor every 30 seconds
  setInterval(runHealthChecks, 30000)

  // Monitor memory every 60 seconds
  setInterval(checkMemory, 60000)

  logger.apex('Guardian initialized — monitoring all systems')
}

async function runHealthChecks() {
  try {
    // Check WebSocket connections
    const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']
    for (const chain of chains) {
      const lastSeen = parseInt(getConfig(`ws_last_seen_${chain}`) || '0')
      const ageMs = Date.now() - lastSeen

      if (lastSeen > 0 && ageMs > 120000) { // 2 minutes without WS data
        logger.warn(`${chain} WebSocket may be stale (${(ageMs / 1000).toFixed(0)}s)`)
        setConfig(`ws_health_${chain}`, 'degraded')
      } else {
        setConfig(`ws_health_${chain}`, 'healthy')
      }
    }

    setConfig('guardian_last_check', Date.now())
  } catch (e) {
    logger.error('Guardian health check error:', e.message)
  }
}

function checkMemory() {
  const mem = process.memoryUsage()
  const heapMB = mem.heapUsed / 1024 / 1024

  setConfig('memory_heap_mb', heapMB.toFixed(0))

  if (heapMB > 450) {
    logger.warn(`High memory usage: ${heapMB.toFixed(0)}MB — forcing GC`)
    if (global.gc) global.gc()
  }
}

export function reportWSActivity(chain) {
  setConfig(`ws_last_seen_${chain}`, Date.now())
}

export function getGuardianStatus() {
  const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']
  const health = {}

  for (const chain of chains) {
    health[chain] = getConfig(`ws_health_${chain}`) || 'starting'
  }

  return {
    chainHealth: health,
    memoryMB: getConfig('memory_heap_mb') || '0',
    uptimeSeconds: Math.floor(process.uptime()),
    lastCheck: getConfig('guardian_last_check'),
    degradedMode: getConfig('degraded_mode') === 'true',
    missingVars: getConfig('missing_vars') || ''
  }
}
