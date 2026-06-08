// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — THE WIZARD
// Expect the unexpected — prevents every failure
// Self-healing autonomous protection system
// ═══════════════════════════════════════════════════════
import { logger } from '../utils/logger.js'
import { getConfig, setConfig, logApex } from '../utils/db.js'

const circuitBreakers = {}
const failureCounts = {}

// ── CIRCUIT BREAKER ───────────────────────────────────────────
export function checkCircuitBreaker(domain) {
  const key = `circuit_${domain}`
  const status = getConfig(key)
  if (status === 'open') {
    logger.warn(`Circuit breaker OPEN for ${domain}`)
    return false // blocked
  }
  return true // allowed
}

export function recordFailure(domain, error) {
  failureCounts[domain] = (failureCounts[domain] || 0) + 1
  logger.warn(`Failure #${failureCounts[domain]} in ${domain}: ${error}`)

  // Open circuit after 5 consecutive failures
  if (failureCounts[domain] >= 5) {
    setConfig(`circuit_${domain}`, 'open')
    logger.error(`Circuit breaker OPENED for ${domain}`)
    logApex('wizard', 'circuit_breaker_open', { domain, failures: failureCounts[domain] })

    // Auto-reset after 10 minutes
    setTimeout(() => {
      setConfig(`circuit_${domain}`, 'closed')
      failureCounts[domain] = 0
      logger.info(`Circuit breaker RESET for ${domain}`)
    }, 600000)
  }
}

export function recordSuccess(domain) {
  if (failureCounts[domain] > 0) {
    failureCounts[domain] = Math.max(0, failureCounts[domain] - 1)
  }
  setConfig(`circuit_${domain}`, 'closed')
}

// ── ANOMALY DETECTION ─────────────────────────────────────────
export function detectAnomaly(type, value, expectedRange) {
  const [min, max] = expectedRange
  if (value < min || value > max) {
    logger.warn(`Anomaly detected: ${type} = ${value} (expected ${min}-${max})`)
    logApex('wizard', 'anomaly_detected', { type, value, expectedRange })
    return true
  }
  return false
}

// ── HEALTH MONITOR ────────────────────────────────────────────
export function startHealthMonitor() {
  setInterval(() => {
    // Check memory usage
    const memUsage = process.memoryUsage()
    const memMB = memUsage.heapUsed / 1024 / 1024

    if (memMB > 400) {
      logger.warn(`High memory: ${memMB.toFixed(0)}MB`)
      // Force garbage collection if available
      if (global.gc) global.gc()
    }

    // Log system health
    setConfig('system_memory_mb', memMB.toFixed(0))
    setConfig('system_uptime_s', Math.floor(process.uptime()))
    setConfig('last_health_check', Date.now())
  }, 60000)

  logger.info('Wizard health monitor started')
}

// ── VALIDATE ENV VARS ─────────────────────────────────────────
export function validateEnvironment() {
  const required = [
    'MODEM_PAY_SECRET_KEY',
    'MODEM_PAY_PUBLIC_KEY',
    'MODEM_PAY_WAVE_NUMBER',
    'PIMLICO_API_KEY',
    'ANTHROPIC_API_KEY'
  ]

  const missing = []
  for (const key of required) {
    if (!process.env[key] || process.env[key].includes('your_')) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    logger.warn(`Missing env vars: ${missing.join(', ')}`)
    logger.warn('System running in DEGRADED mode — add vars in Railway dashboard')
    setConfig('degraded_mode', 'true')
    setConfig('missing_vars', missing.join(','))
  } else {
    setConfig('degraded_mode', 'false')
    logger.success('All environment variables validated')
  }

  return missing
}
