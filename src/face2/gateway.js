// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — FACE 2: GATEWAY
// Protocol integration API
// Protocols connect here to use X7 liquidation infrastructure
// ═══════════════════════════════════════════════════════
import { run, query, setConfig } from '../utils/db.js'
import { logger } from '../utils/logger.js'

// Register a protocol for integration
export function registerProtocol(protocolData) {
  const { name, address, chain, tvlUsd, revenueShare = 0.5 } = protocolData

  run(
    `INSERT OR REPLACE INTO protocols_integrated 
     (name, address, chain, tvl_usd, revenue_share, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [name, address, chain, String(tvlUsd), revenueShare]
  )

  logger.success(`Protocol integrated: ${name} on ${chain} TVL: $${tvlUsd}`)
  return { success: true, message: `${name} integrated. X7 now monitors your positions.` }
}

// Get all integrated protocols
export function getIntegratedProtocols() {
  return query(`SELECT * FROM protocols_integrated WHERE status = 'active'`)
}

// Calculate total TVL under X7 management
export function getTotalManagedTVL() {
  const rows = query(
    `SELECT SUM(CAST(tvl_usd AS REAL)) as total FROM protocols_integrated WHERE status = 'active'`
  )
  return rows[0]?.total || 0
}

// Send automated outreach to protocols
// APEX calls this to onboard new protocols
export async function sendProtocolOutreach(protocolName, protocolAddress, estimatedRevenue) {
  logger.apex(`Protocol outreach: ${protocolName} est. revenue: $${estimatedRevenue}/day`)

  // Log outreach attempt
  run(
    `INSERT OR IGNORE INTO protocols_integrated 
     (name, address, chain, tvl_usd, revenue_share, status)
     VALUES (?, ?, 'unknown', '0', 0.5, 'outreach')`,
    [protocolName, protocolAddress || '0x0']
  )

  return true
}
