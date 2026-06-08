// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — SELF-FIXING LAYER
// Detects and repairs issues autonomously
// Works with self-expanding layer for compounding intelligence
// ═══════════════════════════════════════════════════════
import { getConfig, setConfig, logApex, query, run } from '../utils/db.js'
import { logger } from '../utils/logger.js'

const fixHistory = []
let fixRunning = false

// ── ISSUE REGISTRY: Every known problem + its auto-fix ───────
const KNOWN_ISSUES = [
  {
    id: 'ws_stale',
    detect: () => {
      const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']
      return chains.some(c => {
        const last = parseInt(getConfig(`ws_last_seen_${c}`) || '0')
        return last > 0 && (Date.now() - last) > 300000 // 5 min stale
      })
    },
    fix: async () => {
      logger.info('Self-fix: Restarting stale WebSocket connections...')
      const { startWebSocketListener } = await import('../face1/detector.js')
      const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']
      for (const chain of chains) {
        startWebSocketListener(chain, null)
        await new Promise(r => setTimeout(r, 500))
      }
      return 'WebSocket connections restarted'
    }
  },
  {
    id: 'db_corrupt',
    detect: () => {
      try {
        query('SELECT 1')
        return false
      } catch {
        return true
      }
    },
    fix: async () => {
      logger.warn('Self-fix: Database issue detected — reinitializing...')
      const { initDB } = await import('../utils/db.js')
      await initDB()
      return 'Database reinitialized'
    }
  },
  {
    id: 'no_borrowers',
    detect: () => {
      const count = query('SELECT COUNT(*) as c FROM borrowers')[0]?.c || 0
      const uptime = process.uptime()
      return count === 0 && uptime > 300 // 5 min uptime, still no borrowers
    },
    fix: async () => {
      logger.info('Self-fix: No borrowers found — reloading from subgraphs...')
      const { loadBorrowersFromSubgraph } = await import('../face1/detector.js')
      const chains = ['polygon', 'arbitrum', 'avalanche']
      for (const chain of chains) {
        await loadBorrowersFromSubgraph(chain).catch(() => {})
      }
      return 'Borrower reload triggered'
    }
  },
  {
    id: 'apex_silent',
    detect: () => {
      const lastCycle = parseInt(getConfig('last_apex_cycle') || '0')
      return lastCycle > 0 && (Date.now() - lastCycle) > 180000 // 3 min silent
    },
    fix: async () => {
      logger.info('Self-fix: APEX silent — restarting coordinator...')
      const { startCoordinator } = await import('./coordinator.js')
      await startCoordinator()
      return 'APEX Coordinator restarted'
    }
  },
  {
    id: 'memory_leak',
    detect: () => {
      const memMB = process.memoryUsage().heapUsed / 1024 / 1024
      return memMB > 450
    },
    fix: async () => {
      const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)
      logger.warn(`Self-fix: High memory ${memMB}MB — forcing GC...`)
      if (global.gc) global.gc()
      return `GC triggered at ${memMB}MB`
    }
  },
  {
    id: 'circuit_stuck',
    detect: () => {
      const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']
      return chains.some(c => {
        const status = getConfig(`circuit_${c}`)
        const openedAt = parseInt(getConfig(`circuit_${c}_opened_at`) || '0')
        return status === 'open' && openedAt > 0 && (Date.now() - openedAt) > 1800000 // 30 min
      })
    },
    fix: async () => {
      const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']
      let reset = []
      for (const chain of chains) {
        const status = getConfig(`circuit_${chain}`)
        const openedAt = parseInt(getConfig(`circuit_${chain}_opened_at`) || '0')
        if (status === 'open' && (Date.now() - openedAt) > 1800000) {
          setConfig(`circuit_${chain}`, 'closed')
          reset.push(chain)
        }
      }
      return `Circuit breakers reset: ${reset.join(', ')}`
    }
  },
  {
    id: 'yield_not_deployed',
    detect: () => {
      const total = parseFloat(getConfig('total_revenue') || '0')
      const deployed = parseFloat(getConfig('yield_deployed_polygon') || '0') +
                       parseFloat(getConfig('yield_deployed_arbitrum') || '0')
      return total > 500 && deployed === 0 // $500+ revenue but nothing deployed to yield
    },
    fix: async () => {
      logger.info('Self-fix: Revenue available but not yielding — deploying...')
      const { autoDeployYield } = await import('../face3/yieldRouter.js')
      const total = parseFloat(getConfig('total_revenue') || '0')
      await autoDeployYield(total * 0.3)
      return `Yield deployment triggered for $${(total * 0.3).toFixed(0)}`
    }
  }
]

// ── MAIN SELF-FIX LOOP ────────────────────────────────────────
export async function runSelfFix() {
  if (fixRunning) return
  fixRunning = true

  try {
    for (const issue of KNOWN_ISSUES) {
      try {
        if (issue.detect()) {
          logger.warn(`Self-fix detecting issue: ${issue.id}`)
          const result = await issue.fix()
          const entry = { issueId: issue.id, result, fixedAt: Date.now() }
          fixHistory.push(entry)
          logApex('selfFix', issue.id, { result })
          setConfig(`last_fix_${issue.id}`, Date.now())
          logger.success(`Self-fix resolved: ${issue.id} — ${result}`)
        }
      } catch (e) {
        logger.error(`Self-fix failed for ${issue.id}:`, e.message)
      }
    }
  } finally {
    fixRunning = false
  }
}

export function getSelfFixStatus() {
  return {
    totalFixes: fixHistory.length,
    recentFixes: fixHistory.slice(-10),
    knownIssues: KNOWN_ISSUES.length,
    lastRun: getConfig('last_selffix_run') || 'never'
  }
}

// Run every 2 minutes
export function startSelfFix() {
  setInterval(async () => {
    setConfig('last_selffix_run', new Date().toISOString())
    await runSelfFix()
  }, 120000)
  logger.info('Self-fix layer active — monitoring for issues')
}
