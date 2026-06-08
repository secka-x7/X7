// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — MASTER ENTRY POINT
// Operation Singularity begins here
// Health endpoint starts FIRST (Railway requirement)
// Everything else starts after health is confirmed live
// ═══════════════════════════════════════════════════════
import { logger } from './utils/logger.js'
import { initDB } from './utils/db.js'
import { startDashboard } from './dashboard/server.js'
import { validateEnvironment, startHealthMonitor } from './safety/wizard.js'
import { deployAll } from '../scripts/deploy.js'
import { startCoordinator } from './apex/coordinator.js'
import { initGuardian } from './apex/guardian.js'
import { initSingularity } from './apex/singularity.js'
import { loadBorrowersFromSubgraph, startWebSocketListener, startHealthFactorScanner } from './face1/detector.js'
import { startCascadeEngine } from './face1/cascade.js'
import { executeLiquidation, findBestLiquidationParams } from './face1/executor.js'
import { getUserReserves } from './face1/detector.js'
import { getOptimalSequence } from './face1/cascade.js'
import { shouldExecute, priorityScore } from './apex/rules.js'
import { estimateProfit } from './intelligence/predictor.js'
import { CHAINS, ACTIVE_CHAINS } from './config/chains.js'
import { getConfig, setConfig, recordExecution } from './utils/db.js'
import { broadcastUpdate } from './dashboard/server.js'
import { getPrice } from './intelligence/signals.js'

// Global opportunity queue
const opportunityQueue = []
let isProcessingQueue = false

// ── STEP 1: START HEALTH ENDPOINT IMMEDIATELY ─────────────────
// Railway checks /health — must respond before timeout
logger.info('X7 PROTOCOL STARTING...')
logger.info('Step 1: Starting health endpoint...')

// DB init is synchronous-ish, start it before dashboard
let dbReady = false
initDB().then(() => {
  dbReady = true
  logger.success('Database ready')
}).catch(e => {
  logger.error('DB init error:', e.message)
})

// Start dashboard (health endpoint inside)
startDashboard()
logger.success('Health endpoint live — Railway check will pass')

// ── STEP 2: FULL SYSTEM STARTUP ───────────────────────────────
async function startSystem() {
  // Wait for DB
  let attempts = 0
  while (!dbReady && attempts < 30) {
    await new Promise(r => setTimeout(r, 500))
    attempts++
  }

  logger.info('Step 2: Validating environment...')
  const missing = validateEnvironment()
  if (missing.length > 0) {
    logger.warn(`Degraded mode: missing ${missing.join(', ')} — add in Railway Variables tab`)
  }

  // Start guardian first (monitors everything)
  logger.info('Step 3: Starting APEX Guardian...')
  initGuardian()
  startHealthMonitor()

  // Initialize Operation Singularity
  logger.info('Step 4: OPERATION SINGULARITY INITIATED')
  initSingularity()

  // Deploy contracts autonomously
  logger.info('Step 5: Autonomous contract deployment...')
  try {
    await deployAll()
  } catch (e) {
    logger.warn('Contract deployment deferred:', e.message)
    logger.warn('System will retry deployment after gas is available')
  }

  // Start APEX brain
  logger.info('Step 6: Starting APEX Coordinator...')
  await startCoordinator()

  // Start Face 1 — detection on all chains
  logger.info('Step 7: Starting Face 1 — Liquidation Detection...')
  await startAllDetectors()

  logger.success('═══════════════════════════════════════')
  logger.success('  X7 PROTOCOL FULLY OPERATIONAL')
  logger.success('  Operation Singularity: IN PROGRESS')
  logger.success('  All 5 chains: SCANNING')
  logger.success('  APEX AI: ACTIVE')
  logger.success('═══════════════════════════════════════')
}

// ── DETECTOR STARTUP ──────────────────────────────────────────
async function startAllDetectors() {
  const chains = ACTIVE_CHAINS

  for (const chainName of chains) {
    try {
      logger.chain(chainName, 'Starting detector...')

      // Load existing borrowers from subgraph (non-blocking)
      loadBorrowersFromSubgraph(chainName).catch(e =>
        logger.warn(`${chainName} subgraph load:`, e.message)
      )

      // Start WebSocket listener for real-time events
      startWebSocketListener(chainName, null)

      // Start health factor scanner
      startHealthFactorScanner(chainName, (opportunity) => {
        enqueueOpportunity(opportunity)
      })

      // Start cascade engine
      startCascadeEngine(chainName)

      // Small stagger between chains to avoid rate limits
      await new Promise(r => setTimeout(r, 1000))

    } catch (e) {
      logger.error(`${chainName} detector start failed:`, e.message)
    }
  }

  // Start queue processor
  processOpportunityQueue()
  logger.success('All detectors active — scanning for liquidations')
}

// ── OPPORTUNITY QUEUE ─────────────────────────────────────────
function enqueueOpportunity(opportunity) {
  // Check if already in queue
  const exists = opportunityQueue.some(
    o => o.borrower === opportunity.borrower && o.chain === opportunity.chain
  )
  if (exists) return

  // Add priority score
  opportunity.priority = priorityScore({
    profitUSD: opportunity.debtUSD * 0.05, // Estimate 5% profit
    healthFactor: opportunity.healthFactor,
    chain: opportunity.chain
  })

  // Insert by priority (highest first)
  const idx = opportunityQueue.findIndex(o => o.priority < opportunity.priority)
  if (idx === -1) opportunityQueue.push(opportunity)
  else opportunityQueue.splice(idx, 0, opportunity)

  logger.chain(opportunity.chain, `Queued: ${opportunity.borrower?.slice(0,10)}... HF=${opportunity.healthFactor?.toFixed(3)} Priority=${opportunity.priority}`)

  // Broadcast to dashboard
  broadcastUpdate('opportunity_detected', {
    chain: opportunity.chain,
    hf: opportunity.healthFactor,
    debtUSD: opportunity.debtUSD
  })
}

// ── QUEUE PROCESSOR ───────────────────────────────────────────
async function processOpportunityQueue() {
  setInterval(async () => {
    if (isProcessingQueue || opportunityQueue.length === 0) return
    isProcessingQueue = true

    try {
      const opportunity = opportunityQueue.shift()
      if (!opportunity) { isProcessingQueue = false; return }

      // Re-verify health factor (may have changed)
      const { checkHealthFactor } = await import('./face1/detector.js')
      const fresh = await checkHealthFactor(opportunity.chain, opportunity.borrower)

      if (!fresh || !fresh.isLiquidatable) {
        logger.chain(opportunity.chain, `Position no longer liquidatable: ${opportunity.borrower?.slice(0,10)}`)
        isProcessingQueue = false
        return
      }

      // Get user reserves to find best liquidation params
      const reserves = await getUserReserves(opportunity.chain, opportunity.borrower)
      if (!reserves) { isProcessingQueue = false; return }

      const params = await findBestLiquidationParams(
        opportunity.chain,
        opportunity.borrower,
        reserves
      )

      if (!params) { isProcessingQueue = false; return }

      // Rule engine check
      const decision = shouldExecute({
        chain: opportunity.chain,
        healthFactor: fresh.healthFactor,
        profitUSD: params.profitCalc.netProfitUSD,
        debtUSD: fresh.totalDebtUSD
      })

      if (!decision.execute) {
        logger.chain(opportunity.chain, `Skipped: ${decision.reason}`)
        isProcessingQueue = false
        return
      }

      // Execute the liquidation
      const result = await executeLiquidation({
        chain: opportunity.chain,
        borrower: opportunity.borrower,
        collateralAsset: params.collateralAsset,
        debtAsset: params.debtAsset,
        debtToCoverUSD: params.debtToCoverUSD,
        profitCalc: params.profitCalc
      })

      if (result?.success) {
        broadcastUpdate('execution_success', {
          chain: opportunity.chain,
          profit: result.profitUSDC,
          txHash: result.txHash
        })
      }

    } catch (e) {
      logger.error('Queue processor error:', e.message)
    } finally {
      isProcessingQueue = false
    }
  }, 500) // Process every 500ms
}

// ── GLOBAL ERROR HANDLERS (prevents Railway crash) ────────────
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception (system continues):', err.message)
  // DO NOT exit — log and continue
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection (system continues):', String(reason)?.slice(0, 200))
  // DO NOT exit — log and continue
})

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — graceful shutdown')
  process.exit(0)
})

// ── START ─────────────────────────────────────────────────────
// Health endpoint already live above
// Full system starts with 2 second delay
// (gives Railway time to confirm health before heavy operations)
setTimeout(startSystem, 2000)
