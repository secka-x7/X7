// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — FACE 2: PROTOCOL NETWORK
// Automated protocol discovery and outreach
// APEX uses this for Operation Singularity
// ═══════════════════════════════════════════════════════
import { getIntegratedProtocols, sendProtocolOutreach, registerProtocol } from './gateway.js'
import { logger } from '../utils/logger.js'

// Discover new protocols via DeFiLlama API
export async function discoverNewProtocols() {
  try {
    const resp = await fetch('https://api.llama.fi/protocols')
    const protocols = await resp.json()

    // Filter: DeFi lending protocols with TVL > $5M
    const lendingProtocols = protocols
      .filter(p =>
        p.category === 'Lending' &&
        p.tvl > 5_000_000 &&
        p.chains?.some(c => ['Arbitrum', 'Polygon', 'Ethereum', 'Avalanche', 'BSC'].includes(c))
      )
      .slice(0, 50)

    logger.apex(`Discovered ${lendingProtocols.length} lending protocols via DeFiLlama`)
    return lendingProtocols
  } catch (e) {
    logger.warn('DeFiLlama discovery failed:', e.message)
    return []
  }
}

// Auto-register discovered protocols
export async function autoRegisterProtocols() {
  const protocols = await discoverNewProtocols()
  const integrated = getIntegratedProtocols()
  const integratedNames = integrated.map(p => p.name.toLowerCase())

  let newCount = 0
  for (const protocol of protocols) {
    if (!integratedNames.includes(protocol.name.toLowerCase())) {
      await sendProtocolOutreach(protocol.name, protocol.address, protocol.tvl * 0.0001)
      newCount++
    }
  }

  if (newCount > 0) logger.apex(`Outreach sent to ${newCount} new protocols`)
  return newCount
}

export function getNetworkStats() {
  return {
    integrated: getIntegratedProtocols().length,
    pipeline: 0
  }
}
