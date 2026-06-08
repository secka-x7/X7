// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — APEX SELF-EXPANSION
// Autonomously discovers and adds new protocols + chains
// ═══════════════════════════════════════════════════════
import { discoverNewProtocols, autoRegisterProtocols } from '../face2/network.js'
import { setConfig, getConfig, logApex } from '../utils/db.js'
import { logger } from '../utils/logger.js'

export async function runExpansion() {
  logger.apex('Self-expansion cycle starting...')

  try {
    // 1. Discover new protocols
    const newCount = await autoRegisterProtocols()
    if (newCount > 0) {
      logApex('expansion', 'protocols_discovered', { count: newCount })
    }

    // 2. Check for new Aave deployments on existing chains
    await checkNewAaveDeployments()

    // 3. Update market intelligence
    setConfig('last_expansion', Date.now())
    logger.apex(`Self-expansion complete: ${newCount} new protocols`)
  } catch (e) {
    logger.error('Expansion error:', e.message)
  }
}

async function checkNewAaveDeployments() {
  try {
    // Query Aave official deployments list
    const resp = await fetch('https://api.llama.fi/protocol/aave-v3')
    const data = await resp.json()

    if (data.chains) {
      const knownChains = ['Arbitrum', 'Polygon', 'Ethereum', 'Avalanche', 'BSC']
      const newChains = data.chains.filter(c => !knownChains.includes(c))
      if (newChains.length > 0) {
        logger.apex(`New Aave chains detected: ${newChains.join(', ')}`)
        setConfig('pending_chains', newChains.join(','))
      }
    }
  } catch {}
}
