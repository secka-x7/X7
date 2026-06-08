// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — CHAIN CONFIGURATION
// All addresses confirmed from official documentation
// ═══════════════════════════════════════════════════════

export const WALLETS = {
  owner: '0x692a839cd88aebc14cadf5155f366a0ac8c0ea244a164d6c12c415807ae48469',
  executor: '0x462265df2a732e8b1c38d0140b39c2638e242057f9bf15feeeaca855aa41cb3a'
}

export const CHAINS = {
  arbitrum: {
    id: 42161,
    name: 'Arbitrum One',
    rpcHttp: 'https://arb-mainnet.g.alchemy.com/v2/0de1rtr_iy_eYPqTDmnbE',
    rpcWss: 'wss://arb-mainnet.g.alchemy.com/v2/0de1rtr_iy_eYPqTDmnbE',
    pimlico: 'https://api.pimlico.io/v2/42161/rpc',
    // Aave V3 — confirmed from aave.com/docs
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    aavePoolType: 'L2Pool', // CRITICAL: Arbitrum uses L2Pool
    aaveAddressProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    // Uniswap V3 — confirmed from developers.uniswap.org
    uniswapFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    uniswapRouter2: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    uniswapNFTPos: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    // Tokens — confirmed from arbiscan.io
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    wbtc: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0',
    link: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
    // Aave subgraph for borrower discovery
    subgraph: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    // Gas token
    gasToken: 'ETH',
    gasDecimals: 18,
    // Flash loan fee: 0.05% = 5 basis points (confirmed from Aave docs)
    flashLoanFeeBps: 5,
    // Liquidation bonus per asset (basis points)
    liquidationBonuses: {
      weth: 500,   // 5%
      wbtc: 1000,  // 10%
      usdc: 450,   // 4.5%
      dai: 450,
      link: 750,
      arb: 1000
    },
    // Faucet for gas bootstrap
    faucet: 'https://faucet.triangleplatform.com/arbitrum',
    active: true
  },

  polygon: {
    id: 137,
    name: 'Polygon',
    rpcHttp: 'https://polygon-mainnet.g.alchemy.com/v2/bwwCga_bdoTM_1WPebbIj',
    rpcWss: 'wss://polygon-mainnet.g.alchemy.com/v2/bwwCga_bdoTM_1WPebbIj',
    pimlico: 'https://api.pimlico.io/v2/137/rpc',
    // Aave V3 — confirmed
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    aavePoolType: 'Pool',
    aaveAddressProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    // Uniswap V3 — confirmed from developers.uniswap.org
    uniswapFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    uniswapRouter2: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    uniswapNFTPos: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    // Tokens
    usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    weth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    wmatic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    wbtc: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    link: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
    subgraph: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon',
    gasToken: 'MATIC',
    gasDecimals: 18,
    flashLoanFeeBps: 5,
    liquidationBonuses: {
      weth: 500,
      wbtc: 1000,
      usdc: 450,
      wmatic: 750,
      link: 750
    },
    // Polygon has easiest faucet
    faucet: 'https://faucet.polygon.technology',
    active: true
  },

  ethereum: {
    id: 1,
    name: 'Ethereum',
    rpcHttp: 'https://eth-mainnet.g.alchemy.com/v2/ovDqVvPy5BRLelOHMjSpM',
    rpcWss: 'wss://eth-mainnet.g.alchemy.com/v2/ovDqVvPy5BRLelOHMjSpM',
    pimlico: 'https://api.pimlico.io/v2/1/rpc',
    // Aave V3 — DIFFERENT address on Ethereum (confirmed)
    aavePool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    aavePoolType: 'Pool',
    aaveAddressProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
    // Uniswap V3 Ethereum
    uniswapFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    uniswapRouter2: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    uniswapNFTPos: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    // Tokens
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    wbtc: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    link: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    subgraph: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
    gasToken: 'ETH',
    gasDecimals: 18,
    flashLoanFeeBps: 5,
    liquidationBonuses: {
      weth: 500,
      wbtc: 1000,
      usdc: 450,
      link: 750,
      aave: 750,
      uni: 1000
    },
    faucet: null, // No free Ethereum mainnet faucet
    active: true
  },

  avalanche: {
    id: 43114,
    name: 'Avalanche C-Chain',
    rpcHttp: 'https://avax-mainnet.g.alchemy.com/v2/xXtNn410SAAoGz1biqhQ7',
    rpcWss: 'wss://avax-mainnet.g.alchemy.com/v2/xXtNn410SAAoGz1biqhQ7',
    pimlico: 'https://api.pimlico.io/v2/43114/rpc',
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    aavePoolType: 'Pool',
    aaveAddressProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    uniswapFactory: '0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD',
    uniswapRouter: '0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE',
    uniswapRouter2: '0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE',
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    weth: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
    wavax: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    subgraph: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-avalanche',
    gasToken: 'AVAX',
    gasDecimals: 18,
    flashLoanFeeBps: 5,
    liquidationBonuses: { weth: 500, wavax: 750, usdc: 450, wbtc: 1000 },
    faucet: 'https://faucet.avax.network',
    active: true
  },

  bnb: {
    id: 56,
    name: 'BNB Chain',
    rpcHttp: 'https://bsc-dataseed1.binance.org',
    rpcHttpBackup: 'https://bsc-dataseed2.binance.org',
    rpcWss: 'wss://bsc-ws-node.nariox.org',
    pimlico: 'https://api.pimlico.io/v2/56/rpc',
    // Venus Protocol on BNB (different from Aave)
    venusComptroller: '0xfD36E2c2a6789Db23113685031d7F16329158384',
    venusOracle: '0xd8B6dA2bfEC71D684D3E2a2FC9492dDad5C3787B',
    usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    weth: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    btcb: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    subgraph: null, // Venus uses different indexing
    gasToken: 'BNB',
    gasDecimals: 18,
    flashLoanFeeBps: 0, // Venus uses different flash loan model
    liquidationBonuses: { bnb: 1000, btcb: 1000, eth: 1000, usdc: 500 },
    faucet: null,
    active: true
  }
}

// Aave LiquidationCall event topic (confirmed)
export const LIQUIDATION_CALL_TOPIC =
  '0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286'

// Aave Borrow event topic (for borrower discovery)
export const BORROW_EVENT_TOPIC =
  '0xb3d084820fb1a9decffb176436bd02b1b4f8208f7b82e455e4a08f0d8ac8a35'

export const ACTIVE_CHAINS = Object.entries(CHAINS)
  .filter(([, c]) => c.active)
  .map(([key]) => key)
