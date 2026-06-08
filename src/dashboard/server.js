import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { logger } from '../utils/logger.js'
import { getTreasurySummary } from '../treasury/x7treasury.js'
import { getTreasury7Summary } from '../treasury/treasury7.js'
import { withdrawToWave, handleModemWebhook, getWithdrawalHistory } from '../treasury/modemPay.js'
import {
  getRecentExecutions, getTotalRevenue, getTodayRevenue,
  getConfig, query, getWithdrawals
} from '../utils/db.js'
import { getCascadeStatus } from '../face1/cascade.js'
import { getNexus7Stats } from '../face2/nexus7.js'
import { getIntegratedProtocols, getTotalManagedTVL } from '../face2/gateway.js'
import { getX7USDStats } from '../face3/x7usd.js'
import { getVaultStats } from '../face3/convergenceVault.js'
import { getIntelligenceReport } from '../face4/healthIndex.js'
import { getApexStatus } from '../apex/coordinator.js'
import { getGuardianStatus } from '../apex/guardian.js'
import { getSingularityStatus } from '../apex/singularity.js'
import { findBestYield } from '../face3/yieldRouter.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(express.json())
app.use(express.static(join(__dirname, 'public')))

// Connected dashboard clients
const clients = new Set()

wss.on('connection', (ws) => {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
})

// Push real-time updates to all connected dashboards
export function broadcastUpdate(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() })
  for (const client of clients) {
    if (client.readyState === 1) {
      try { client.send(msg) } catch {}
    }
  }
}

// ── HEALTH (Railway requires this first) ──────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'operational',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    protocol: 'X7'
  })
})

// ── API: OVERVIEW ─────────────────────────────────────────────
app.get('/api/overview', (req, res) => {
  try {
    res.json({
      totalRevenue: getTotalRevenue(),
      todayRevenue: getTodayRevenue(),
      recentExecutions: getRecentExecutions(10),
      cascade: getCascadeStatus(),
      nexus7: getNexus7Stats(),
      apex: getApexStatus(),
      guardian: getGuardianStatus(),
      singularity: getSingularityStatus(),
      volatility: getConfig('market_volatility') || 'moderate',
      prices: JSON.parse(getConfig('prices') || '{}'),
      intelligence: getIntelligenceReport()
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── API: LIQUIDATIONS ─────────────────────────────────────────
app.get('/api/liquidations', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50
    const chain = req.query.chain || null
    let sql = `SELECT * FROM executions WHERE strategy IN ('liquidation','cascade')
               ${chain ? `AND chain = '${chain}'` : ''}
               ORDER BY created_at DESC LIMIT ?`
    const executions = query(sql, [limit])
    const stats = {
      total: query("SELECT COUNT(*) as c FROM executions WHERE strategy='liquidation'")[0]?.c || 0,
      success: query("SELECT COUNT(*) as c FROM executions WHERE strategy='liquidation' AND status='success'")[0]?.c || 0,
      totalProfit: query("SELECT SUM(CAST(profit_usdc AS REAL)) as t FROM executions WHERE status='success'"  )[0]?.t || 0
    }
    res.json({ executions, stats })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── API: TREASURY (Page 8) ────────────────────────────────────
app.get('/api/treasury', (req, res) => {
  try {
    res.json({
      x7Treasury: getTreasurySummary(),
      treasury7: getTreasury7Summary(),
      withdrawals: getWithdrawals(20),
      yieldPositions: {
        deployed: parseFloat(getConfig('yield_deployed_arbitrum') || '0') +
                  parseFloat(getConfig('yield_deployed_polygon') || '0'),
        bestAPY: parseFloat(getConfig('best_apy') || '8')
      }
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── API: WITHDRAW — amount only required ─────────────────────
app.post('/api/withdraw', async (req, res) => {
  try {
    const { amount } = req.body
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Valid USDC amount required' })
    }
    const usdcAmount = parseFloat(amount)
    const result = await withdrawToWave(usdcAmount)
    broadcastUpdate('withdrawal_initiated', { amount: usdcAmount, id: result.idempotencyKey })
    res.json({ success: true, transfer: result.transfer, id: result.idempotencyKey })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── API: NEXUS-7 ──────────────────────────────────────────────
app.get('/api/nexus7', (req, res) => {
  try {
    res.json({
      stats: getNexus7Stats(),
      protocols: getIntegratedProtocols(),
      managedTVL: getTotalManagedTVL()
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── API: X7USD ────────────────────────────────────────────────
app.get('/api/x7usd', (req, res) => {
  try {
    res.json({
      stats: getX7USDStats(),
      vault: getVaultStats()
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── API: APEX ─────────────────────────────────────────────────
app.get('/api/apex', (req, res) => {
  try {
    const logs = query('SELECT * FROM apex_log ORDER BY created_at DESC LIMIT 50')
    res.json({
      status: getApexStatus(),
      guardian: getGuardianStatus(),
      singularity: getSingularityStatus(),
      logs
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── API: ANALYTICS ────────────────────────────────────────────
app.get('/api/analytics', (req, res) => {
  try {
    const hourly = query(
      `SELECT strftime('%H', datetime(created_at, 'unixepoch')) as hour,
       SUM(CAST(profit_usdc AS REAL)) as revenue,
       COUNT(*) as count
       FROM executions WHERE status='success'
       GROUP BY hour ORDER BY hour`
    )
    const byChain = query(
      `SELECT chain,
       SUM(CAST(profit_usdc AS REAL)) as revenue,
       COUNT(*) as count,
       AVG(CAST(profit_usdc AS REAL)) as avg_profit
       FROM executions WHERE status='success'
       GROUP BY chain ORDER BY revenue DESC`
    )
    const byStrategy = query(
      `SELECT strategy,
       SUM(CAST(profit_usdc AS REAL)) as revenue,
       COUNT(*) as count
       FROM executions WHERE status='success'
       GROUP BY strategy`
    )
    const winRates = {}
    for (const chain of ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']) {
      winRates[chain] = parseFloat(getConfig(`win_rate_${chain}`) || '0.4')
    }
    res.json({ hourly, byChain, byStrategy, winRates, intelligence: getIntelligenceReport() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── API: SINGULARITY ──────────────────────────────────────────
app.get('/api/singularity', (req, res) => {
  try {
    res.json(getSingularityStatus())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── MODEM PAY WEBHOOK ─────────────────────────────────────────
app.post('/webhooks/modem-pay', async (req, res) => {
  try {
    await handleModemWebhook(req.body)
    broadcastUpdate('withdrawal_update', req.body)
    res.json({ received: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Serve dashboard for all routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'))
})

export function startDashboard() {
  const PORT = process.env.PORT || 3000
  server.listen(PORT, '0.0.0.0', () => {
    logger.success(`X7 BLACK dashboard live on port ${PORT}`)
  })

  // Push live updates every 5 seconds
  setInterval(() => {
    broadcastUpdate('tick', {
      revenue: getTotalRevenue(),
      today: getTodayRevenue(),
      time: Date.now()
    })
  }, 5000)

  return server
}
