// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — FACE 3: YIELD ROUTER
// Deploys idle USDC to highest yield protocol
// Aave supply confirmed from official documentation
// ═══════════════════════════════════════════════════════
import { encodeFunctionData, parseAbi, createPublicClient, http } from 'viem'
import { CHAINS } from '../config/chains.js'
import { getWalletClient, getPublicClient } from '../utils/pimlico.js'
import { logger } from '../utils/logger.js'
import { recordRevenue } from '../treasury/x7treasury.js'
import { setConfig, getConfig } from '../utils/db.js'

const AAVE_SUPPLY_ABI = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
  'function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))'
])

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)'
])

// Get current Aave supply APY for USDC
export async function getAaveSupplyAPY(chainName) {
  try {
    const chain = CHAINS[chainName]
    if (!chain || !chain.aavePool) return 0
    const client = getPublicClient(chainName)

    const reserveData = await client.readContract({
      address: chain.aavePool,
      abi: AAVE_SUPPLY_ABI,
      functionName: 'getReserveData',
      args: [chain.usdc]
    })

    // currentLiquidityRate is in RAY units (1e27)
    // APY = (1 + rate/SECONDS_PER_YEAR) ^ SECONDS_PER_YEAR - 1
    const rayRate = Number(reserveData.currentLiquidityRate)
    const apy = (rayRate / 1e27) * 365 * 24 * 3600 * 100
    return Math.min(apy, 50) // Cap at 50% to catch anomalies
  } catch {
    return 8 // Default 8% APY estimate
  }
}

// Deploy USDC to Aave supply
export async function deployToAave(chainName, usdcAmount) {
  try {
    const chain = CHAINS[chainName]
    if (!chain?.aavePool) return null

    const wallet = getWalletClient(chainName)
    const client = getPublicClient(chainName)
    const { privateKeyToAddress } = await import('viem/accounts')
    const { WALLETS } = await import('../config/chains.js')
    const executorAddr = privateKeyToAddress(WALLETS.executor)

    const amountBN = BigInt(Math.floor(usdcAmount * 1e6)) // USDC = 6 decimals

    // Approve Aave pool
    await wallet.sendTransaction({
      to: chain.usdc,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [chain.aavePool, amountBN]
      })
    })

    // Supply to Aave
    const tx = await wallet.sendTransaction({
      to: chain.aavePool,
      data: encodeFunctionData({
        abi: AAVE_SUPPLY_ABI,
        functionName: 'supply',
        args: [chain.usdc, amountBN, executorAddr, 0]
      })
    })

    await client.waitForTransactionReceipt({ hash: tx, timeout: 60000 })

    const apy = await getAaveSupplyAPY(chainName)
    logger.success(`Yield deployed: $${usdcAmount} USDC on ${chainName} Aave @ ${apy.toFixed(1)}% APY`)
    setConfig(`yield_deployed_${chainName}`, usdcAmount)
    return { tx, apy, amount: usdcAmount }
  } catch (e) {
    logger.error(`Yield deploy failed on ${chainName}:`, e.message)
    return null
  }
}

// Find best yield across all chains
export async function findBestYield() {
  const results = []
  const chains = ['arbitrum', 'polygon', 'avalanche']

  for (const chainName of chains) {
    try {
      const apy = await getAaveSupplyAPY(chainName)
      results.push({ chain: chainName, apy, protocol: 'aave' })
    } catch {}
  }

  results.sort((a, b) => b.apy - a.apy)
  return results
}

// Auto-deploy idle capital to best yield
export async function autoDeployYield(usdcAvailable) {
  if (usdcAvailable < 100) return // Min $100 to deploy

  const best = await findBestYield()
  if (best.length === 0) return

  const bestChain = best[0]
  const deployAmount = usdcAvailable * 0.7 // Deploy 70%, keep 30% liquid

  logger.info(`Auto-deploying $${deployAmount.toFixed(0)} to ${bestChain.chain} Aave (${bestChain.apy.toFixed(1)}% APY)`)
  return await deployToAave(bestChain.chain, deployAmount)
}
