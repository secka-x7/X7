// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — FACE 1: CASCADE ENGINE
// Maps liquidation chains and sequences them optimally
// Day 1 micro-cascades → Week 1 billion-level cascades
// ═══════════════════════════════════════════════════════
import { getAtRiskBorrowers, query, setConfig, getConfig } from '../utils/db.js'
import { scorePosition, estimateProfit } from '../intelligence/predictor.js'
import { getPrice } from '../intelligence/signals.js'
import { CHAINS } from '../config/chains.js'
import { logger } from '../utils/logger.js'

// Cascade graph: maps positions that affect each other
const cascadeGraph = {}
const prebuiltTransactions = {}

// ── BUILD CASCADE GRAPH ───────────────────────────────────────
export async function buildCascadeGraph(chainName) {
  const atRisk = getAtRiskBorrowers(chainName, 1.3)

  if (atRisk.length === 0) return

  logger.chain(chainName, `Building cascade graph for ${atRisk.length} positions...`)

  // Group by collateral type (ETH positions affect each other)
  const byCollateral = {}
  for (const pos of atRisk) {
    const key = chainName
    if (!byCollateral[key]) byCollateral[key] = []
    byCollateral[key].push(pos)
  }

  // Calculate cascade potential
  let totalCascadeValueUSD = 0
  let tier1Count = 0
  let tier2Count = 0

  for (const pos of atRisk) {
    const hf = parseFloat(pos.health_factor)
    const debtUSD = parseFloat(pos.debt_usd || 0)

    if (hf < 1.0) {
      tier1Count++
      totalCascadeValueUSD += debtUSD
    } else if (hf < 1.05) {
      tier2Count++
      totalCascadeValueUSD += debtUSD * 0.7 // 70% probability
    }
  }

  cascadeGraph[chainName] = {
    positions: atRisk,
    tier1: atRisk.filter(p => parseFloat(p.health_factor) < 1.0),
    tier2: atRisk.filter(p => parseFloat(p.health_factor) >= 1.0 && parseFloat(p.health_factor) < 1.05),
    tier3: atRisk.filter(p => parseFloat(p.health_factor) >= 1.05 && parseFloat(p.health_factor) < 1.2),
    totalCascadeValueUSD,
    tier1Count,
    tier2Count,
    probability: calculateCascadeProbability(chainName, atRisk),
    updatedAt: Date.now()
  }

  setConfig(`cascade_${chainName}`, JSON.stringify({
    tier1: tier1Count,
    tier2: tier2Count,
    totalValueUSD: totalCascadeValueUSD,
    probability: cascadeGraph[chainName].probability
  }))

  logger.chain(chainName,
    `Cascade graph: Tier1=${tier1Count} Tier2=${tier2Count} Value=$${(totalCascadeValueUSD / 1e6).toFixed(1)}M`
  )

  return cascadeGraph[chainName]
}

// ── CALCULATE CASCADE PROBABILITY ────────────────────────────
function calculateCascadeProbability(chainName, positions) {
  const tier1 = positions.filter(p => parseFloat(p.health_factor) < 1.0).length
  const tier2 = positions.filter(p => parseFloat(p.health_factor) < 1.05).length

  if (tier1 > 10) return 95
  if (tier1 > 5) return 85
  if (tier2 > 20) return 70
  if (tier2 > 10) return 50
  if (tier2 > 5) return 30
  return 15
}

// ── OPTIMAL EXECUTION SEQUENCING ─────────────────────────────
// Sequence liquidations to maximize total captured
// Execute larger positions first to move price and trigger tier2
export function getOptimalSequence(chainName) {
  const graph = cascadeGraph[chainName]
  if (!graph) return []

  // Sort tier1 by debt size (largest first = most price impact)
  const tier1Sorted = [...(graph.tier1 || [])].sort(
    (a, b) => parseFloat(b.debt_usd || 0) - parseFloat(a.debt_usd || 0)
  )

  // Then tier2 sorted by proximity to threshold
  const tier2Sorted = [...(graph.tier2 || [])].sort(
    (a, b) => parseFloat(a.health_factor) - parseFloat(b.health_factor)
  )

  // Interleave: execute tier1, then tier2 (now liquidatable from price impact)
  return [...tier1Sorted, ...tier2Sorted]
}

// ── GET CASCADE STATUS FOR DASHBOARD ─────────────────────────
export function getCascadeStatus() {
  const result = {}
  for (const [chainName, graph] of Object.entries(cascadeGraph)) {
    result[chainName] = {
      probability: graph.probability,
      tier1: graph.tier1Count,
      tier2: graph.tier2Count,
      estimatedValueUSD: graph.totalCascadeValueUSD,
      estimatedRevenueUSD: graph.totalCascadeValueUSD * 0.05, // ~5% average
      lastUpdated: graph.updatedAt
    }
  }
  return result
}

// ── MICRO-CASCADE ENGINEERING ────────────────────────────────
// Even on quiet days: find 3+ positions in same asset
// Sequence them to create engineered micro-cascades
export function findMicroCascadeOpportunity(chainName) {
  const graph = cascadeGraph[chainName]
  if (!graph || graph.tier1.length < 2) return null

  // If we have 3+ liquidatable positions: sequence them
  if (graph.tier1.length >= 3) {
    const sequence = getOptimalSequence(chainName)
    const totalValue = sequence.slice(0, 10).reduce(
      (sum, p) => sum + parseFloat(p.debt_usd || 0), 0
    )

    return {
      type: 'micro_cascade',
      chain: chainName,
      positions: sequence.slice(0, 10),
      estimatedTotalProfit: totalValue * 0.05,
      sequenceCount: Math.min(10, sequence.length)
    }
  }

  return null
}

// Start cascade graph builder (updates every 2 minutes)
export function startCascadeEngine(chainName) {
  buildCascadeGraph(chainName)
  setInterval(() => buildCascadeGraph(chainName), 120000)
  logger.chain(chainName, 'Cascade engine started')
}
