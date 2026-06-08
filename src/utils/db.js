// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — DATABASE (sql.js — pure JS, zero build issues)
// ═══════════════════════════════════════════════════════
import { createRequire } from 'module'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { logger } from './logger.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')

const DB_PATH = './x7.db'
let db = null
let SQL = null

export async function initDB() {
  SQL = await initSqlJs()

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
    logger.info('Database loaded from disk')
  } else {
    db = new SQL.Database()
    logger.info('New database created')
  }

  // Load schema
  const schema = readFileSync('./database/schema.sql', 'utf8')
  db.run(schema)
  saveDB()
  logger.success('Database initialized')
  return db
}

export function saveDB() {
  if (!db) return
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    writeFileSync(DB_PATH, buffer)
  } catch (e) {
    logger.error('DB save error:', e.message)
  }
}

// Auto-save every 30 seconds
setInterval(saveDB, 30000)

export function query(sql, params = []) {
  if (!db) return []
  try {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows
  } catch (e) {
    logger.error('DB query error:', e.message)
    return []
  }
}

export function run(sql, params = []) {
  if (!db) return
  try {
    db.run(sql, params)
  } catch (e) {
    logger.error('DB run error:', e.message)
  }
}

export function getConfig(key) {
  const rows = query('SELECT value FROM system_config WHERE key = ?', [key])
  return rows.length > 0 ? rows[0].value : null
}

export function setConfig(key, value) {
  run(
    'INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, strftime(\'%s\',\'now\'))',
    [key, String(value)]
  )
}

export function recordExecution(data) {
  run(
    `INSERT INTO executions 
     (tx_hash, chain, protocol, strategy, borrower, collateral_asset, debt_asset, profit_usdc, gas_used, status, error_msg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.txHash || null,
      data.chain,
      data.protocol || 'aave',
      data.strategy || 'liquidation',
      data.borrower || null,
      data.collateralAsset || null,
      data.debtAsset || null,
      String(data.profitUsdc || 0),
      String(data.gasUsed || 0),
      data.status || 'pending',
      data.errorMsg || null
    ]
  )
  saveDB()
}

export function getTotalRevenue() {
  const rows = query(
    "SELECT SUM(CAST(profit_usdc AS REAL)) as total FROM executions WHERE status = 'success'"
  )
  return rows[0]?.total || 0
}

export function getTodayRevenue() {
  const rows = query(
    `SELECT SUM(CAST(profit_usdc AS REAL)) as total FROM executions 
     WHERE status = 'success' AND created_at >= strftime('%s', 'now', 'start of day')`
  )
  return rows[0]?.total || 0
}

export function getRecentExecutions(limit = 20) {
  return query(
    `SELECT * FROM executions ORDER BY created_at DESC LIMIT ?`,
    [limit]
  )
}

export function upsertBorrower(address, chain, healthFactor, collateralUsd, debtUsd, protocol = 'aave') {
  run(
    `INSERT OR REPLACE INTO borrowers 
     (address, chain, protocol, health_factor, collateral_usd, debt_usd, last_checked)
     VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
    [address, chain, protocol, String(healthFactor), String(collateralUsd), String(debtUsd)]
  )
}

export function getAtRiskBorrowers(chain, maxHF = 1.1) {
  return query(
    `SELECT * FROM borrowers 
     WHERE chain = ? AND CAST(health_factor AS REAL) < ? AND CAST(health_factor AS REAL) > 0
     ORDER BY CAST(health_factor AS REAL) ASC LIMIT 200`,
    [chain, maxHF]
  )
}

export function recordWithdrawal(idempotencyKey, usdcAmount, gmdAmount) {
  run(
    `INSERT OR IGNORE INTO withdrawals (idempotency_key, usdc_amount, gmd_amount)
     VALUES (?, ?, ?)`,
    [idempotencyKey, String(usdcAmount), String(gmdAmount)]
  )
  saveDB()
}

export function updateWithdrawal(idempotencyKey, transferId, status, reference = null, error = null) {
  run(
    `UPDATE withdrawals SET transfer_id = ?, status = ?, reference = ?, error = ?
     WHERE idempotency_key = ?`,
    [transferId, status, reference, error, idempotencyKey]
  )
  saveDB()
}

export function getWithdrawals(limit = 20) {
  return query(
    `SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT ?`,
    [limit]
  )
}

export function logApex(subsystem, action, result) {
  run(
    `INSERT INTO apex_log (subsystem, action, result) VALUES (?, ?, ?)`,
    [subsystem, action, JSON.stringify(result)]
  )
}
