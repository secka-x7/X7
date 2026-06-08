// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — DASHBOARD SERVER
// Fixed all imports — health endpoint first
// ═══════════════════════════════════════════════════════
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { logger } from '../utils/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(express.json())
app.use(express.static(join(__dirname, 'public')))

const clients = new Set()
wss.on('connection', (ws) => {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
})

export function broadcastUpdate(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() })
  for (const client of clients) {
    if (client.readyState === 1) {
      try { client.send(msg) } catch {}
    }
  }
}

// ── HEALTH ENDPOINT — must be first ──────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'operational',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    protocol: 'X7'
  })
})

// Lazy-load heavy modules only after server is up
let modules = {}
async function loadModules() {
  if (modules.loaded) return modules
  try {
    const [db, treasury, treasury7, modemPay, cascade,
           nexus7, gateway, x7usd, vault, health,
           apex, guardian, singularity] = await Promise.all([
      import('../utils/db.js'),
      import('../treasury/x7treasury.js'),
      import('../treasury/treasury7.js'),
      import('../treasury/modemPay.js'),
      import('../face1/cascade.js'),
      import('../face2/nexus7.js'),
      import('../face2/gateway.js'),
      import('../face3/x7usd.js'),
      import('../face3/convergenceVault.js'),
      import('../face4/healthIndex.js'),
      import('../apex/coordinator.js'),
      import('../apex/guardian.js'),
      import('../apex/singularity.js')
    ])
    modules = { loaded: true, db, treasury, treasury7, modemPay, cascade,
                nexus7, gateway, x7usd, vault, health, apex, guardian, singularity }
    logger.success('Dashboard modules loaded')
  } catch (e) {
    logger.error('Module load error:', e.message)
    modules.loaded = false
  }
  return modules
}

// ── API ROUTES ────────────────────────────────────────────────
app.get('/api/overview', async (req, res) => {
  try {
    const m = await loadModules()
    if (!m.loaded) return res.json({ totalRevenue: 0, todayRevenue: 0, recentExecutions: [], cascade: {}, nexus7: {}, apex: {}, guardian: {}, singularity: {}, volatility: 'moderate', prices: {}, intelligence: {} })
    res.json({
      totalRevenue: m.db.getTotalRevenue(),
      todayRevenue: m.db.getTodayRevenue(),
      recentExecutions: m.db.getRecentExecutions(10),
      cascade: m.cascade.getCascadeStatus(),
      nexus7: m.nexus7.getNexus7Stats(),
      apex: m.apex.getApexStatus(),
      guardian: m.guardian.getGuardianStatus(),
      singularity: m.singularity.getSingularityStatus(),
      volatility: m.db.getConfig('market_volatility') || 'moderate',
      prices: JSON.parse(m.db.getConfig('prices') || '{}'),
      intelligence: m.health.getIntelligenceReport()
    })
  } catch (e) {
    res.status(500).json({ error: e.message, totalRevenue: 0 })
  }
})

app.get('/api/liquidations', async (req, res) => {
  try {
    const m = await loadModules()
    if (!m.loaded) return res.json({ executions: [], stats: { total: 0, success: 0, totalProfit: 0 } })
    const limit = parseInt(req.query.limit) || 50
    const chain = req.query.chain || null
    const sql = `SELECT * FROM executions WHERE strategy IN ('liquidation','cascade')${chain ? ` AND chain='${chain}'` : ''} ORDER BY created_at DESC LIMIT ?`
    const executions = m.db.query(sql, [limit])
    const total = m.db.query("SELECT COUNT(*) as c FROM executions WHERE strategy='liquidation'")[0]?.c || 0
    const success = m.db.query("SELECT COUNT(*) as c FROM executions WHERE strategy='liquidation' AND status='success'")[0]?.c || 0
    const totalProfit = m.db.query("SELECT SUM(CAST(profit_usdc AS REAL)) as t FROM executions WHERE status='success'"  )[0]?.t || 0
    res.json({ executions, stats: { total, success, totalProfit } })
  } catch (e) {
    res.status(500).json({ error: e.message, executions: [], stats: {} })
  }
})

app.get('/api/treasury', async (req, res) => {
  try {
    const m = await loadModules()
    if (!m.loaded) return res.json({ x7Treasury: {}, treasury7: {}, withdrawals: [] })
    res.json({
      x7Treasury: m.treasury.getTreasurySummary(),
      treasury7: m.treasury7.getTreasury7Summary(),
      withdrawals: m.db.getWithdrawals(20),
      yieldPositions: {
        deployed: parseFloat(m.db.getConfig('yield_deployed_arbitrum') || '0') +
                  parseFloat(m.db.getConfig('yield_deployed_polygon') || '0'),
        bestAPY: parseFloat(m.db.getConfig('best_apy') || '8')
      }
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/withdraw', async (req, res) => {
  try {
    const m = await loadModules()
    const { amount } = req.body
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Valid USDC amount required' })
    }
    const usdcAmount = parseFloat(amount)
    const result = await m.modemPay.withdrawToWave(usdcAmount)
    broadcastUpdate('withdrawal_initiated', { amount: usdcAmount, id: result.idempotencyKey })
    res.json({ success: true, transfer: result.transfer, id: result.idempotencyKey })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/nexus7', async (req, res) => {
  try {
    const m = await loadModules()
    if (!m.loaded) return res.json({ stats: {}, protocols: [], managedTVL: 0 })
    res.json({
      stats: m.nexus7.getNexus7Stats(),
      protocols: m.gateway.getIntegratedProtocols(),
      managedTVL: m.gateway.getTotalManagedTVL()
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/x7usd', async (req, res) => {
  try {
    const m = await loadModules()
    if (!m.loaded) return res.json({ stats: {}, vault: {} })
    res.json({ stats: m.x7usd.getX7USDStats(), vault: m.vault.getVaultStats() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/apex', async (req, res) => {
  try {
    const m = await loadModules()
    if (!m.loaded) return res.json({ status: {}, guardian: {}, singularity: {}, logs: [] })
    const logs = m.db.query('SELECT * FROM apex_log ORDER BY created_at DESC LIMIT 50')
    res.json({
      status: m.apex.getApexStatus(),
      guardian: m.guardian.getGuardianStatus(),
      singularity: m.singularity.getSingularityStatus(),
      logs
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/analytics', async (req, res) => {
  try {
    const m = await loadModules()
    if (!m.loaded) return res.json({ hourly: [], byChain: [], byStrategy: [], winRates: {} })
    const hourly = m.db.query(`SELECT strftime('%H', datetime(created_at,'unixepoch')) as hour, SUM(CAST(profit_usdc AS REAL)) as revenue, COUNT(*) as count FROM executions WHERE status='success' GROUP BY hour ORDER BY hour`)
    const byChain = m.db.query(`SELECT chain, SUM(CAST(profit_usdc AS REAL)) as revenue, COUNT(*) as count, AVG(CAST(profit_usdc AS REAL)) as avg_profit FROM executions WHERE status='success' GROUP BY chain ORDER BY revenue DESC`)
    const byStrategy = m.db.query(`SELECT strategy, SUM(CAST(profit_usdc AS REAL)) as revenue, COUNT(*) as count FROM executions WHERE status='success' GROUP BY strategy`)
    const winRates = {}
    for (const chain of ['arbitrum','polygon','ethereum','avalanche','bnb']) {
      winRates[chain] = parseFloat(m.db.getConfig(`win_rate_${chain}`) || '0.4')
    }
    res.json({ hourly, byChain, byStrategy, winRates, intelligence: m.health.getIntelligenceReport() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/singularity', async (req, res) => {
  try {
    const m = await loadModules()
    if (!m.loaded) return res.json({ phase: 1, progress: 0 })
    res.json(m.singularity.getSingularityStatus())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/webhooks/modem-pay', async (req, res) => {
  try {
    const m = await loadModules()
    await m.modemPay.handleModemWebhook(req.body)
    broadcastUpdate('withdrawal_update', req.body)
    res.json({ received: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'))
})

export function startDashboard() {
  const PORT = process.env.PORT || 3000
  server.listen(PORT, '0.0.0.0', () => {
    logger.success(`X7 BLACK live on port ${PORT}`)
  })
  setInterval(async () => {
    try {
      const m = await loadModules()
      if (m.loaded) {
        broadcastUpdate('tick', {
          revenue: m.db.getTotalRevenue(),
          today: m.db.getTodayRevenue(),
          time: Date.now()
        })
      }
    } catch {}
  }, 5000)
  return server
}
