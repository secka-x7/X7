// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — NEXUS-7 CLEARING HOUSE
// DeFi settlement layer — 0.1% fee on all volume
// Target: 100% of DeFi settlement
// ═══════════════════════════════════════════════════════
import { run, query, setConfig, getConfig } from '../utils/db.js'
import { logger } from '../utils/logger.js'
import { recordRevenue } from '../treasury/x7treasury.js'

// Track settlements through NEXUS-7
export function recordSettlement(data) {
  const fee = data.volumeUSD * 0.001 // 0.1% fee
  run(
    `INSERT INTO executions 
     (chain, strategy, profit_usdc, status, created_at)
     VALUES (?, 'nexus7_settlement', ?, 'success', strftime('%s','now'))`,
    [data.chain, String(fee)]
  )
  recordRevenue(data.chain, fee, 'nexus7')
  return fee
}

// Get NEXUS-7 stats for dashboard
export function getNexus7Stats() {
  const rows = query(
    `SELECT SUM(CAST(profit_usdc AS REAL)) as fees,
     COUNT(*) as settlements
     FROM executions WHERE strategy = 'nexus7_settlement' AND status = 'success'`
  )

  const today = query(
    `SELECT SUM(CAST(profit_usdc AS REAL)) as fees
     FROM executions WHERE strategy = 'nexus7_settlement' AND status = 'success'
     AND created_at >= strftime('%s', 'now', 'start of day')`
  )

  return {
    totalFees: rows[0]?.fees || 0,
    totalSettlements: rows[0]?.settlements || 0,
    todayFees: today[0]?.fees || 0,
    protocolsConnected: query(`SELECT COUNT(*) as c FROM protocols_integrated WHERE status = 'active'`)[0]?.c || 0
  }
}
