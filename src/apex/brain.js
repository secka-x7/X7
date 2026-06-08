// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — APEX BRAIN (Claude AI)
// Strategic decisions every 60 seconds
// Falls back to rules if Claude unavailable
// ═══════════════════════════════════════════════════════
import Anthropic from '@anthropic-ai/sdk'
import { query, getConfig, setConfig, logApex } from '../utils/db.js'
import { logger } from '../utils/logger.js'

let anthropic = null

function getClient() {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropic
}

// Last known good config (fallback when Claude is unavailable)
let lastGoodConfig = {
  priorityChain: 'arbitrum',
  minProfitMultiplier: 1.0,
  aggressiveMode: false,
  focusStrategy: 'liquidation'
}

export async function getStrategicDirection() {
  const client = getClient()
  if (!client) {
    logger.warn('APEX: Claude unavailable, using rule engine')
    return lastGoodConfig
  }

  try {
    // Gather system metrics
    const totalRevenue = query(
      "SELECT SUM(CAST(profit_usdc AS REAL)) as t FROM executions WHERE status = 'success'"
    )[0]?.t || 0

    const todayRevenue = query(
      `SELECT SUM(CAST(profit_usdc AS REAL)) as t FROM executions 
       WHERE status = 'success' AND created_at >= strftime('%s', 'now', 'start of day')`
    )[0]?.t || 0

    const recentExecutions = query(
      'SELECT chain, status, profit_usdc FROM executions ORDER BY created_at DESC LIMIT 20'
    )

    const winRates = {}
    const chains = ['arbitrum', 'polygon', 'ethereum', 'avalanche', 'bnb']
    for (const chain of chains) {
      winRates[chain] = getConfig(`win_rate_${chain}`) || '0.4'
    }

    const volatility = getConfig('market_volatility') || 'moderate'
    const prices = getConfig('prices') || '{}'

    const prompt = `You are APEX, the AI brain of X7 Protocol — a DeFi liquidation and infrastructure system.

Current metrics:
- Total revenue all time: $${totalRevenue.toFixed(0)}
- Today's revenue: $${todayRevenue.toFixed(0)}
- Market volatility: ${volatility}
- Win rates by chain: ${JSON.stringify(winRates)}
- Recent executions (last 20): ${JSON.stringify(recentExecutions)}

Respond with JSON only:
{
  "priorityChain": "arbitrum|polygon|ethereum|avalanche|bnb",
  "minProfitMultiplier": 0.7-2.0,
  "aggressiveMode": true|false,
  "focusStrategy": "liquidation|arbitrage|yield|cascade",
  "insight": "one sentence observation",
  "action": "one specific action to take now"
}`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const config = JSON.parse(jsonMatch[0])
      lastGoodConfig = config

      // Apply config
      setConfig('apex_priority_chain', config.priorityChain)
      setConfig('apex_aggressive_mode', String(config.aggressiveMode))
      setConfig('apex_focus_strategy', config.focusStrategy)
      setConfig('apex_insight', config.insight)
      setConfig('apex_last_action', config.action)

      logApex('brain', 'strategic_direction', config)
      logger.apex(`Strategy: ${config.priorityChain} | ${config.focusStrategy} | ${config.insight}`)
      return config
    }
  } catch (e) {
    logger.warn('APEX Brain error:', e.message?.slice(0, 100))
  }

  return lastGoodConfig
}

export function getLastConfig() {
  return lastGoodConfig
}
