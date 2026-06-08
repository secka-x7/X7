// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — POSITION PREDICTOR
// Scores positions 0-100 for liquidation probability
// Detects oracle gaps for pre-execution advantage
// ═══════════════════════════════════════════════════════
import { getPrice } from './signals.js'
import { logger } from '../utils/logger.js'

// Score a position for liquidation probability (0-100)
// Higher = more likely to be liquidatable soon
export function scorePosition(position) {
  const hf = parseFloat(position.health_factor || '999')
  if (isNaN(hf) || hf <= 0) return 0
  if (hf < 1.0) return 100 // Already liquidatable

  // Score based on proximity to 1.0
  if (hf < 1.05) return 90
  if (hf < 1.10) return 70
  if (hf < 1.15) return 50
  if (hf < 1.20) return 30
  if (hf < 1.30) return 15
  return 5
}

// Detect oracle gap: CEX price vs expected on-chain price
// Returns potential profit from oracle lag
export function detectOracleGap(asset, onChainPriceUSD) {
  const cexPrice = getPrice(asset)
  if (!cexPrice || !onChainPriceUSD) return null

  const gap = Math.abs(cexPrice - onChainPriceUSD) / onChainPriceUSD
  if (gap > 0.005) { // > 0.5% gap
    return {
      asset,
      cexPrice,
      onChainPrice: onChainPriceUSD,
      gapPercent: (gap * 100).toFixed(2),
      direction: cexPrice < onChainPriceUSD ? 'down' : 'up'
    }
  }
  return null
}

// Estimate profit from a liquidation
// Returns profit in USD
export function estimateProfit(
  debtAmountUSD,
  collateralAsset,
  liquidationBonusBps,
  flashLoanFeeBps = 5,
  gasCostUSD = 10
) {
  const grossBonus = debtAmountUSD * (liquidationBonusBps / 10000)
  const flashLoanFee = debtAmountUSD * (flashLoanFeeBps / 10000)
  const slippage = debtAmountUSD * 0.003 // 0.3% estimated swap slippage
  const net = grossBonus - flashLoanFee - slippage - gasCostUSD

  return {
    grossBonus,
    flashLoanFee,
    slippage,
    gasCostUSD,
    netProfitUSD: net,
    isProfitable: net > 0
  }
}

// Dynamic fee calculation (4-layer system)
// Applied to our profit to determine what portion goes to treasury vs reinvest
export function calculateDynamicFee(params) {
  const {
    liquidationsLastHour = 0,
    priceSwingPercent = 0,
    positionSizeUSD = 0,
    collateralType = 'major'
  } = params

  let fee = 3.0 // base 3%

  // Layer 1: Volume
  if (liquidationsLastHour >= 100) fee += 1.0
  else if (liquidationsLastHour >= 50) fee += 0.6
  else if (liquidationsLastHour >= 20) fee += 0.3

  // Layer 2: Volatility
  if (priceSwingPercent > 10) fee += 0.7
  else if (priceSwingPercent > 5) fee += 0.4
  else if (priceSwingPercent > 2) fee += 0.2

  // Layer 3: Position size
  if (positionSizeUSD > 2_000_000) fee += 1.0
  else if (positionSizeUSD > 500_000) fee += 0.6
  else if (positionSizeUSD > 50_000) fee += 0.3

  // Layer 4: Collateral type
  if (collateralType === 'stable') fee += 0
  else if (collateralType === 'major') fee += 0.2
  else if (collateralType === 'altcoin') fee += 0.4
  else fee += 0.7 // LP/exotic

  // Cap between 2.5% and 5%
  return Math.min(5.0, Math.max(2.5, fee))
}
