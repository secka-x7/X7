// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — WHITELISTED ASSETS
// Only liquidate positions backed by these assets
// (ensures we can swap collateral back to USDC)
// ═══════════════════════════════════════════════════════

export const WHITELIST = {
  arbitrum: [
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0', // WBTC
    '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', // LINK
    '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'  // DAI
  ],
  polygon: [
    '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
    '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH
    '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', // WBTC
    '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39'  // LINK
  ],
  ethereum: [
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    '0x514910771AF9Ca656af840dff83E8264EcF986CA', // LINK
    '0x6B175474E89094C44Da98b954EedeAC495271d0F'  // DAI
  ],
  avalanche: [
    '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // USDC
    '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', // WETH
    '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
    '0x50b7545627a5162F82A992c33b87aDc75187B218'  // WBTC
  ],
  bnb: [
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', // BTCB
    '0x2170Ed0880ac9A755fd29B2688956BD959F933F8'  // WETH
  ]
}

// Uniswap fee tiers to try (in order of preference)
export const FEE_TIERS = [500, 3000, 10000] // 0.05%, 0.3%, 1%
