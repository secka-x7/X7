// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — GAS ORACLE
// Real-time gas price fetching per chain
// ═══════════════════════════════════════════════════════
import { createPublicClient, http } from 'viem'
import { CHAINS } from '../config/chains.js'
import { logger } from './logger.js'

const clients = {}

export function getClient(chainName) {
  if (!clients[chainName]) {
    const chain = CHAINS[chainName]
    clients[chainName] = createPublicClient({
      transport: http(chain.rpcHttp)
    })
  }
  return clients[chainName]
}

export async function getGasPrice(chainName) {
  try {
    const client = getClient(chainName)
    const gasPrice = await client.getGasPrice()
    return gasPrice
  } catch (e) {
    logger.warn(`Gas price fetch failed for ${chainName}:`, e.message)
    // Return safe defaults in wei
    const defaults = {
      arbitrum: 100000000n,   // 0.1 gwei
      polygon: 30000000000n,  // 30 gwei
      ethereum: 20000000000n, // 20 gwei
      avalanche: 25000000000n,// 25 gwei
      bnb: 3000000000n        // 3 gwei
    }
    return defaults[chainName] || 5000000000n
  }
}

// Estimate gas cost in USD for a liquidation transaction
export async function estimateGasCostUSD(chainName, gasUnits = 400000) {
  try {
    const gasPrice = await getGasPrice(chainName)
    const gasCostNative = gasPrice * BigInt(gasUnits)
    // Native token prices (approximate, updated by APEX)
    const nativePrices = { arbitrum: 3000, polygon: 0.8, ethereum: 3000, avalanche: 30, bnb: 600 }
    const price = nativePrices[chainName] || 1
    const chain = CHAINS[chainName]
    const gasCostUSD = (Number(gasCostNative) / 10 ** chain.gasDecimals) * price
    return gasCostUSD
  } catch (e) {
    return 10 // Default $10 if can't calculate
  }
}
