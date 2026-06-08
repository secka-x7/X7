// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — FACE 5: CREDIT PROTOCOL
// On-chain credit scoring + undercollateralized loans
// ═══════════════════════════════════════════════════════
import { query } from '../utils/db.js'

export function calculateCreditScore(walletAddress) {
  // Score based on on-chain history
  const executions = query(
    `SELECT COUNT(*) as c FROM borrowers WHERE address = ? AND CAST(health_factor AS REAL) > 1.2`,
    [walletAddress]
  )

  // Base score: 650 (no history)
  // Good history: up to 850
  const baseScore = 650
  const goodHistory = executions[0]?.c || 0
  return Math.min(850, baseScore + goodHistory * 10)
}

export function getCreditStats() {
  return {
    totalScored: query('SELECT COUNT(DISTINCT address) as c FROM borrowers')[0]?.c || 0,
    avgScore: 650,
    status: 'active'
  }
}
