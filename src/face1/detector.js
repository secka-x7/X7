// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — FACE 1: DETECTOR
// Discovers all borrowers via Aave subgraph + WebSocket
// Monitors health factors in real time
// 100% real blockchain data — zero simulation
// ═══════════════════════════════════════════════════════
import WebSocket from 'ws'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { CHAINS, ACTIVE_CHAINS, LIQUIDATION_CALL_TOPIC, BORROW_EVENT_TOPIC } from '../config/chains.js'
import { upsertBorrower, getAtRiskBorrowers, run } from '../utils/db.js'
import { logger } from '../utils/logger.js'
import { scorePosition } from '../intelligence/predictor.js'

const wsConnections = {}
const reconnectTimers = {}

// ── BORROWER DISCOVERY VIA AAVE SUBGRAPH ─────────────────────
// Confirmed method from Aave documentation:
// "You will need to gather user account data and keep an index locally"
export async function loadBorrowersFromSubgraph(chainName) {
  const chain = CHAINS[chainName]
  if (!chain.subgraph) return

  logger.chain(chainName, 'Loading borrowers from Aave subgraph...')
  let skip = 0
  let loaded = 0

  try {
    while (true) {
      const query = JSON.stringify({
        query: `{
          users(
            first: 1000,
            skip: ${skip},
            where: { borrowedReservesCount_gt: 0 },
            orderBy: healthFactor,
            orderDirection: asc
          ) {
            id
            healthFactor
            totalCollateralUSD
            totalDebtUSD
            borrowedReservesCount
          }
        }`
      })

      const resp = await fetch(chain.subgraph, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: query
      })

      const data = await resp.json()
      const users = data?.data?.users || []

      if (users.length === 0) break

      for (const user of users) {
        // healthFactor from subgraph is already in decimal format
        const hf = parseFloat(user.healthFactor) / 1e18 || 999
        upsertBorrower(
          user.id,
          chainName,
          hf,
          parseFloat(user.totalCollateralUSD || 0),
          parseFloat(user.totalDebtUSD || 0)
        )
        loaded++
      }

      logger.chain(chainName, `Loaded ${loaded} borrowers...`)
      skip += 1000

      if (users.length < 1000) break
      await new Promise(r => setTimeout(r, 500)) // Rate limit
    }

    logger.success(`${chainName}: ${loaded} borrowers indexed from subgraph`)
  } catch (e) {
    logger.error(`${chainName} subgraph error:`, e.message)
    // Fallback: detect via block scanning (last 50k blocks)
    await scanRecentBorrows(chainName)
  }
}

// ── FALLBACK: SCAN RECENT BORROW EVENTS ──────────────────────
async function scanRecentBorrows(chainName) {
  try {
    const chain = CHAINS[chainName]
    const client = createPublicClient({ transport: http(chain.rpcHttp) })

    const latestBlock = await client.getBlockNumber()
    const fromBlock = latestBlock - 50000n

    logger.chain(chainName, `Scanning blocks ${fromBlock}-${latestBlock} for Borrow events...`)

    const logs = await client.getLogs({
      address: chain.aavePool,
      event: parseAbiItem('event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)'),
      fromBlock,
      toBlock: latestBlock
    })

    const uniqueBorrowers = [...new Set(logs.map(l => l.args.onBehalfOf || l.args.user))]
    logger.chain(chainName, `Found ${uniqueBorrowers.length} recent borrowers`)

    for (const addr of uniqueBorrowers) {
      upsertBorrower(addr, chainName, 999, 0, 0)
    }
  } catch (e) {
    logger.error(`${chainName} block scan error:`, e.message)
  }
}

// ── REAL-TIME HEALTH FACTOR CHECK ────────────────────────────
// Confirmed from Aave docs: getUserAccountData returns healthFactor in 1e18
const AAVE_POOL_ABI = [
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' }
    ]
  },
  {
    name: 'getReservesList',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }]
  },
  {
    name: 'getUserConfiguration',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
]

export async function checkHealthFactor(chainName, userAddress) {
  try {
    const chain = CHAINS[chainName]
    const client = createPublicClient({ transport: http(chain.rpcHttp) })

    const result = await client.readContract({
      address: chain.aavePool,
      abi: AAVE_POOL_ABI,
      functionName: 'getUserAccountData',
      args: [userAddress]
    })

    // healthFactor is in 1e18 format (confirmed from Aave docs)
    const healthFactor = Number(result[5]) / 1e18
    const totalCollateralUSD = Number(result[0]) / 1e8 // Base currency is 8 decimals
    const totalDebtUSD = Number(result[1]) / 1e8

    // Update database
    upsertBorrower(userAddress, chainName, healthFactor, totalCollateralUSD, totalDebtUSD)

    return { healthFactor, totalCollateralUSD, totalDebtUSD, isLiquidatable: healthFactor < 1.0 }
  } catch (e) {
    return null
  }
}

// ── WEBSOCKET LISTENER FOR NEW BORROWS ───────────────────────
export function startWebSocketListener(chainName, onLiquidationDetected) {
  const chain = CHAINS[chainName]

  function connect() {
    try {
      const ws = new WebSocket(chain.rpcWss)
      wsConnections[chainName] = ws

      ws.on('open', () => {
        logger.chain(chainName, 'WebSocket connected')

        // Subscribe to Aave LiquidationCall events
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_subscribe',
          params: [
            'logs',
            {
              address: chain.aavePool,
              topics: [LIQUIDATION_CALL_TOPIC]
            }
          ]
        }))

        // Subscribe to Borrow events (to catch new borrowers)
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_subscribe',
          params: [
            'logs',
            {
              address: chain.aavePool,
              topics: [BORROW_EVENT_TOPIC]
            }
          ]
        }))
      })

      ws.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (!msg.params?.result) return

          const log = msg.params.result

          // Liquidation event detected
          if (log.topics?.[0] === LIQUIDATION_CALL_TOPIC) {
            logger.chain(chainName, `Liquidation event detected: ${log.transactionHash}`)
          }

          // New borrow — add borrower to watch list
          if (log.topics?.[0] === BORROW_EVENT_TOPIC) {
            const borrowerHex = log.topics[2]
            if (borrowerHex) {
              const borrower = '0x' + borrowerHex.slice(26)
              upsertBorrower(borrower, chainName, 999, 0, 0)
            }
          }
        } catch {}
      })

      ws.on('error', (e) => {
        logger.warn(`${chainName} WS error:`, e.message)
      })

      ws.on('close', () => {
        logger.warn(`${chainName} WS disconnected, reconnecting in 5s...`)
        reconnectTimers[chainName] = setTimeout(() => connect(), 5000)
      })
    } catch (e) {
      logger.error(`${chainName} WS connect failed:`, e.message)
      reconnectTimers[chainName] = setTimeout(() => connect(), 10000)
    }
  }

  connect()
}

// ── HEALTH FACTOR SCAN LOOP ───────────────────────────────────
// Scans at-risk borrowers every 30 seconds
export async function startHealthFactorScanner(chainName, onLiquidatable) {
  async function scan() {
    try {
      const atRisk = getAtRiskBorrowers(chainName, 1.1) // HF < 1.1

      for (const position of atRisk) {
        const result = await checkHealthFactor(chainName, position.address)
        if (!result) continue

        if (result.isLiquidatable) {
          const score = scorePosition({ health_factor: result.healthFactor })
          logger.chain(chainName, `⚡ LIQUIDATABLE: ${position.address} HF=${result.healthFactor.toFixed(4)} Score=${score}`)

          if (onLiquidatable) {
            onLiquidatable({
              chain: chainName,
              borrower: position.address,
              healthFactor: result.healthFactor,
              collateralUSD: result.totalCollateralUSD,
              debtUSD: result.totalDebtUSD,
              score,
              detectedAt: Date.now()
            })
          }
        }

        // Throttle to avoid RPC rate limits
        await new Promise(r => setTimeout(r, 100))
      }
    } catch (e) {
      logger.error(`${chainName} scan error:`, e.message)
    }
  }

  // Initial scan
  scan()
  // Continuous scan every 30 seconds
  setInterval(scan, 30000)
  logger.chain(chainName, 'Health factor scanner started')
}

// ── GET USER RESERVES (for liquidation execution) ────────────
const USER_RESERVE_ABI = [
  {
    name: 'getUserReservesData',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'provider', type: 'address' },
      { name: 'user', type: 'address' }
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'underlyingAsset', type: 'address' },
          { name: 'scaledATokenBalance', type: 'uint256' },
          { name: 'usageAsCollateralEnabledOnUser', type: 'bool' },
          { name: 'stableBorrowRate', type: 'uint256' },
          { name: 'scaledVariableDebt', type: 'uint256' },
          { name: 'principalStableDebt', type: 'uint256' },
          { name: 'stableBorrowLastUpdateTimestamp', type: 'uint256' }
        ]
      },
      { name: 'userEmodeCategoryId', type: 'uint8' }
    ]
  }
]

// UI Pool Data Provider addresses (for getting user reserves)
const UI_POOL_DATA_PROVIDERS = {
  arbitrum: '0x145dE30c929a065582da84Cf96F88460dB9745A7',
  polygon: '0xC69728f11E9E6127733751c8410432913123acf1',
  ethereum: '0x91c0eA31b49B69Ea18607702c5d9aC360bf3dE7d',
  avalanche: '0xdBbFaFC45983B4659E368a3025b81f69Ab6E5093'
}

export async function getUserReserves(chainName, userAddress) {
  try {
    const chain = CHAINS[chainName]
    const client = createPublicClient({ transport: http(chain.rpcHttp) })
    const providerAddress = UI_POOL_DATA_PROVIDERS[chainName]
    if (!providerAddress) return null

    const result = await client.readContract({
      address: providerAddress,
      abi: USER_RESERVE_ABI,
      functionName: 'getUserReservesData',
      args: [chain.aaveAddressProvider, userAddress]
    })

    return result[0] // Array of reserve positions
  } catch (e) {
    return null
  }
}
