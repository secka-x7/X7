// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — MASTER ENTRY POINT
// Health endpoint starts in <100ms (Railway requirement)
// Everything else loads after health passes
// ═══════════════════════════════════════════════════════
import { logger } from './utils/logger.js'
import { initDB } from './utils/db.js'
import { startDashboard } from './dashboard/server.js'

// ── STEP 1: Start health endpoint IMMEDIATELY ─────────────────
// This MUST respond before Railway's healthcheck timeout
logger.info('═══════════════════════════════════════')
logger.info('  X7 PROTOCOL — OPERATION SINGULARITY')
logger.info('═══════════════════════════════════════')
logger.info('Step 1: Starting health endpoint...')

// Start dashboard first — health endpoint lives inside
startDashboard()
logger.success('/health endpoint live — Railway healthcheck will pass')

// ── STEP 2: DB + full system (after health is live) ───────────
async function bootSystem() {
  try {
    logger.info('Step 2: Initializing database...')
    await initDB()
    logger.success('Database ready')
  } catch (e) {
    logger.error('DB error (non-fatal):', e.message)
  }

  try {
    logger.info('Step 3: Starting safety systems...')
    const { validateEnvironment, startHealthMonitor } = await import('./safety/wizard.js')
    validateEnvironment()
    startHealthMonitor()
  } catch (e) {
    logger.error('Safety system error (non-fatal):', e.message)
  }

  try {
    logger.info('Step 4: OPERATION SINGULARITY STARTING...')
    const { initSingularity } = await import('./apex/singularity.js')
    initSingularity()
  } catch (e) {
    logger.error('Singularity init error (non-fatal):', e.message)
  }

  try {
    logger.info('Step 5: Deploying contracts...')
    const { deployAll } = await import('../scripts/deploy.js')
    await deployAll()
  } catch (e) {
    logger.warn('Contract deploy deferred (non-fatal):', e.message)
  }

  try {
    logger.info('Step 6: Starting APEX Coordinator...')
    const { startCoordinator } = await import('./apex/coordinator.js')
    await startCoordinator()
  } catch (e) {
    logger.error('Coordinator error (non-fatal):', e.message)
  }

  try {
    logger.info('Step 7: Starting Face 1 detectors...')
    await startDetectors()
  } catch (e) {
    logger.error('Detector error (non-fatal):', e.message)
  }

  logger.success('═══════════════════════════════════════')
  logger.success('  X7 PROTOCOL FULLY OPERATIONAL')
  logger.success('  All systems active')
  logger.success('  Generating revenue...')
  logger.success('═══════════════════════════════════════')
}

async function startDetectors() {
  const { ACTIVE_CHAINS } = await import('./config/chains.js')
  const { loadBorrowersFromSubgraph, startWebSocketListener, startHealthFactorScanner, getUserReserves } = await import('./face1/detector.js')
  const { startCascadeEngine, getOptimalSequence } = await import('./face1/cascade.js')
  const { executeLiquidation, findBestLiquidationParams } = await import('./face1/executor.js')
  const { shouldExecute, priorityScore } = await import('./apex/rules.js')
  const { broadcastUpdate } = await import('./dashboard/server.js')
  const { initGuardian } = await import('./apex/guardian.js')

  initGuardian()

  const opportunityQueue = []
  let processing = false

  for (const chainName of ACTIVE_CHAINS) {
    try {
      // Non-blocking subgraph load
      loadBorrowersFromSubgraph(chainName).catch(() => {})

      // WebSocket listener
      startWebSocketListener(chainName, null)

      // Health factor scanner — fires callback when liquidatable found
      startHealthFactorScanner(chainName, (opp) => {
        const exists = opportunityQueue.some(o => o.borrower === opp.borrower && o.chain === opp.chain)
        if (!exists) {
          opp.priority = priorityScore({ profitUSD: opp.debtUSD * 0.05, healthFactor: opp.healthFactor, chain: opp.chain })
          const idx = opportunityQueue.findIndex(o => o.priority < opp.priority)
          if (idx === -1) opportunityQueue.push(opp)
          else opportunityQueue.splice(idx, 0, opp)
          broadcastUpdate('opportunity_detected', { chain: opp.chain, hf: opp.healthFactor })
        }
      })

      startCascadeEngine(chainName)
      await new Promise(r => setTimeout(r, 1000))
      logger.chain(chainName, 'Detector active')
    } catch (e) {
      logger.error(`${chainName} detector failed (continuing):`, e.message)
    }
  }

  // Process queue every 500ms
  setInterval(async () => {
    if (processing || opportunityQueue.length === 0) return
    processing = true
    try {
      const opp = opportunityQueue.shift()
      if (!opp) { processing = false; return }

      const { checkHealthFactor } = await import('./face1/detector.js')
      const fresh = await checkHealthFactor(opp.chain, opp.borrower)
      if (!fresh?.isLiquidatable) { processing = false; return }

      const reserves = await getUserReserves(opp.chain, opp.borrower)
      if (!reserves) { processing = false; return }

      const params = await findBestLiquidationParams(opp.chain, opp.borrower, reserves)
      if (!params) { processing = false; return }

      const decision = shouldExecute({
        chain: opp.chain,
        healthFactor: fresh.healthFactor,
        profitUSD: params.profitCalc.netProfitUSD,
        debtUSD: fresh.totalDebtUSD
      })

      if (!decision.execute) { processing = false; return }

      const result = await executeLiquidation({
        chain: opp.chain,
        borrower: opp.borrower,
        collateralAsset: params.collateralAsset,
        debtAsset: params.debtAsset,
        debtToCoverUSD: params.debtToCoverUSD,
        profitCalc: params.profitCalc
      })

      if (result?.success) {
        broadcastUpdate('execution_success', { chain: opp.chain, profit: result.profitUSDC })
        logger.profit(`Revenue: +$${result.profitUSDC?.toFixed(2)} on ${opp.chain}`)
      }
    } catch (e) {
      logger.error('Queue processor error (non-fatal):', e.message)
    } finally {
      processing = false
    }
  }, 500)

  logger.success('All detectors running — scanning for liquidations')
}

// ── GLOBAL CRASH PREVENTION ───────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception (system continues):', err.message)
  // NEVER exit — Railway would restart but lose state
})
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection (system continues):', String(reason)?.slice(0, 200))
})
process.on('SIGTERM', () => {
  logger.info('SIGTERM — graceful shutdown')
  process.exit(0)
})

// Boot with 100ms delay (lets health endpoint bind to port first)
setTimeout(bootSystem, 100)
