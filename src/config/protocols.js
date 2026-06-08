// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — SUPPORTED PROTOCOLS PER CHAIN
// ═══════════════════════════════════════════════════════

export const PROTOCOLS = {
  aave_arbitrum: {
    name: 'Aave V3 Arbitrum',
    chain: 'arbitrum',
    type: 'aave',
    active: true
  },
  aave_polygon: {
    name: 'Aave V3 Polygon',
    chain: 'polygon',
    type: 'aave',
    active: true
  },
  aave_ethereum: {
    name: 'Aave V3 Ethereum',
    chain: 'ethereum',
    type: 'aave',
    active: true
  },
  aave_avalanche: {
    name: 'Aave V3 Avalanche',
    chain: 'avalanche',
    type: 'aave',
    active: true
  },
  venus_bnb: {
    name: 'Venus Protocol BNB',
    chain: 'bnb',
    type: 'venus',
    active: true
  }
}

// Minimum profit in USD to execute (covers gas + flash loan fee)
export const MIN_PROFIT_USD = {
  arbitrum: 30,
  polygon: 5,
  ethereum: 100,
  avalanche: 20,
  bnb: 15
}

// Maximum position size to attempt (risk management)
export const MAX_LIQUIDATION_USD = {
  arbitrum: 5_000_000,
  polygon: 2_000_000,
  ethereum: 50_000_000,
  avalanche: 1_000_000,
  bnb: 2_000_000
}
