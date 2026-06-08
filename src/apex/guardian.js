// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — APEX GUARDIAN (with self-fix + self-expand)
// ═══════════════════════════════════════════════════════
import { getConfig, setConfig, logApex } from '../utils/db.js'
import { logger } from '../utils/logger.js'
import { validateEnvironment } from '../safety/wizard.js'
import { startSelfFix } from './selfFix.js'
import { startSelfExpand } from './selfExpand.js'

export function initGuardian() {
  validateEnvironment()
  setInterval(runHealthChecks, 30000)
  setInterval(checkMemory, 60000)

  // Wire in self-fix and self-expand
  startSelfFix()
  startSelfExpand()

  logger.apex('Guardian + Self-Fix + Self-Expand: ALL ACTIVE')
}

async function runHealthChecks() {
  try {
    const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']
    for (const chain of chains) {
      const lastSeen = parseInt(getConfig(`ws_last_seen_${chain}`) || '0')
      const ageMs = Date.now() - lastSeen
      if (lastSeen > 0 && ageMs > 120000) {
        setConfig(`ws_health_${chain}`, 'degraded')
      } else {
        setConfig(`ws_health_${chain}`, 'healthy')
      }
    }
    setConfig('guardian_last_check', Date.now())
  } catch (e) {
    logger.error('Guardian check error:', e.message)
  }
}

function checkMemory() {
  const mem = process.memoryUsage()
  const heapMB = mem.heapUsed / 1024 / 1024
  setConfig('memory_heap_mb', heapMB.toFixed(0))
  if (heapMB > 450) {
    logger.warn(`High memory: ${heapMB.toFixed(0)}MB`)
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
    missingVars: getConfig('missing_vars') || '',
    selfFixActive: true,
    selfExpandActive: true
  }
}
