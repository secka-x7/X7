// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — SELF-EXPANDING LOC LAYER
// System grows its own logic autonomously
// Every execution teaches the system new patterns
// Logic compounds: more data = smarter decisions
// ═══════════════════════════════════════════════════════
import { getConfig, setConfig, logApex, query, run } from '../utils/db.js'
import { logger } from '../utils/logger.js'

// ── PATTERN LIBRARY (grows with every execution) ──────────────
// The system writes new decision patterns based on real outcomes
let patternLibrary = []
let expansionCycles = 0

// Learn from execution outcomes
export function learnFromExecution(execution) {
  const {
    chain, collateralAsset, debtAsset, profitUsdc,
    gasUsed, status, healthFactorAtExecution
  } = execution

  if (!chain || !status) return

  const pattern = {
    chain,
    collateralAsset,
    debtAsset,
    profitUsdc: parseFloat(profitUsdc || 0),
    gasEfficiency: parseFloat(profitUsdc || 0) / Math.max(parseFloat(gasUsed || 1), 1),
    wasSuccessful: status === 'success',
    healthFactorAtExecution: parseFloat(healthFactorAtExecution || 1),
    timestamp: Date.now()
  }

  patternLibrary.push(pattern)

  // Keep last 10,000 patterns in memory
  if (patternLibrary.length > 10000) {
    patternLibrary = patternLibrary.slice(-10000)
  }

  // Persist pattern count
  setConfig('pattern_library_size', patternLibrary.length)
}

// Generate new decision rules from accumulated patterns
export function synthesizeNewRules() {
  if (patternLibrary.length < 10) return []

  const newRules = []

  // Rule synthesis 1: Find best performing chains
  const chainPerf = {}
  for (const p of patternLibrary) {
    if (!chainPerf[p.chain]) chainPerf[p.chain] = { wins: 0, losses: 0, profit: 0 }
    if (p.wasSuccessful) { chainPerf[p.chain].wins++; chainPerf[p.chain].profit += p.profitUsdc }
    else chainPerf[p.chain].losses++
  }

  for (const [chain, perf] of Object.entries(chainPerf)) {
    const total = perf.wins + perf.losses
    if (total < 3) continue
    const winRate = perf.wins / total
    const avgProfit = perf.profit / Math.max(perf.wins, 1)

    // Write learned win rate to config for rule engine
    setConfig(`learned_win_rate_${chain}`, winRate.toFixed(3))
    setConfig(`learned_avg_profit_${chain}`, avgProfit.toFixed(2))

    newRules.push({
      type: 'chain_performance',
      chain,
      winRate: winRate.toFixed(3),
      avgProfit: avgProfit.toFixed(2)
    })
  }

  // Rule synthesis 2: Find best collateral types
  const collateralPerf = {}
  for (const p of patternLibrary) {
    if (!p.collateralAsset) continue
    const key = `${p.chain}_${p.collateralAsset?.slice(0, 10)}`
    if (!collateralPerf[key]) collateralPerf[key] = { wins: 0, profit: 0, count: 0 }
    collateralPerf[key].count++
    if (p.wasSuccessful) { collateralPerf[key].wins++; collateralPerf[key].profit += p.profitUsdc }
  }

  for (const [key, perf] of Object.entries(collateralPerf)) {
    if (perf.count < 2) continue
    const winRate = perf.wins / perf.count
    if (winRate > 0.7) {
      newRules.push({ type: 'good_collateral', key, winRate: winRate.toFixed(2), avgProfit: (perf.profit / Math.max(perf.wins, 1)).toFixed(2) })
    }
  }

  // Rule synthesis 3: Optimal health factor range
  const hfBuckets = {}
  for (const p of patternLibrary) {
    if (!p.healthFactorAtExecution || p.healthFactorAtExecution > 1.0) continue
    const bucket = (Math.floor(p.healthFactorAtExecution * 20) / 20).toFixed(2)
    if (!hfBuckets[bucket]) hfBuckets[bucket] = { wins: 0, count: 0 }
    hfBuckets[bucket].count++
    if (p.wasSuccessful) hfBuckets[bucket].wins++
  }

  let bestHFBucket = { winRate: 0, bucket: '0.95' }
  for (const [bucket, data] of Object.entries(hfBuckets)) {
    if (data.count < 2) continue
    const wr = data.wins / data.count
    if (wr > bestHFBucket.winRate) bestHFBucket = { winRate: wr, bucket }
  }

  if (bestHFBucket.winRate > 0) {
    setConfig('learned_best_hf_range', bestHFBucket.bucket)
    newRules.push({ type: 'optimal_hf', range: bestHFBucket.bucket, winRate: bestHFBucket.winRate.toFixed(2) })
  }

  expansionCycles++
  setConfig('expansion_cycles', expansionCycles)

  if (newRules.length > 0) {
    logApex('selfExpand', 'rules_synthesized', { count: newRules.length, cycle: expansionCycles })
    logger.apex(`Self-expand: ${newRules.length} new rules synthesized (cycle ${expansionCycles})`)
  }

  return newRules
}

// Expand protocol coverage autonomously
export async function expandProtocolCoverage() {
  try {
    const { discoverNewProtocols } = await import('../face2/network.js')
    const newProtocols = await discoverNewProtocols()

    if (newProtocols.length > 0) {
      logger.apex(`Self-expand: Found ${newProtocols.length} new protocols to target`)
      setConfig('discovered_protocols', newProtocols.length)
    }
    return newProtocols.length
  } catch {
    return 0
  }
}

// Load patterns from database on startup
export function loadPatterns() {
  try {
    const executions = query(
      `SELECT chain, collateral_asset, debt_asset, profit_usdc, gas_used, status
       FROM executions ORDER BY created_at DESC LIMIT 5000`
    )
    for (const exec of executions) {
      learnFromExecution({
        chain: exec.chain,
        collateralAsset: exec.collateral_asset,
        debtAsset: exec.debt_asset,
        profitUsdc: exec.profit_usdc,
        gasUsed: exec.gas_used,
        status: exec.status
      })
    }
    logger.info(`Self-expand: Loaded ${patternLibrary.length} historical patterns`)
  } catch (e) {
    logger.warn('Pattern load error:', e.message)
  }
}

export function getExpansionStatus() {
  return {
    patternLibrarySize: patternLibrary.length,
    expansionCycles,
    learnedWinRates: {
      arbitrum: getConfig('learned_win_rate_arbitrum'),
      polygon: getConfig('learned_win_rate_polygon'),
      ethereum: getConfig('learned_win_rate_ethereum')
    },
    bestHFRange: getConfig('learned_best_hf_range'),
    discoveredProtocols: getConfig('discovered_protocols')
  }
}

// Start expansion loop
export function startSelfExpand() {
  // Load historical patterns immediately
  loadPatterns()

  // Synthesize rules every 5 minutes
  setInterval(synthesizeNewRules, 300000)

  // Expand protocol coverage every 12 hours
  setInterval(expandProtocolCoverage, 12 * 60 * 60 * 1000)

  logger.info('Self-expand layer active — learning from every execution')
}
