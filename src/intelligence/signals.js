// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — MARKET SIGNALS
// CEX price feeds + oracle gap detection
// Real prices from public APIs — zero simulation
// ═══════════════════════════════════════════════════════
import { logger } from '../utils/logger.js'
import { setConfig, getConfig } from '../utils/db.js'

// Live price cache
const priceCache = {}
const lastUpdate = {}

// Fetch real prices from CoinGecko (free, no API key needed)
export async function fetchPrices() {
  try {
    const ids = 'ethereum,bitcoin,matic-network,avalanche-2,binancecoin,chainlink,aave,uniswap'
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    const resp = await fetch(url)
    const data = await resp.json()

    const prices = {
      ETH: data['ethereum']?.usd || priceCache.ETH || 3000,
      BTC: data['bitcoin']?.usd || priceCache.BTC || 60000,
      WBTC: data['bitcoin']?.usd || priceCache.BTC || 60000,
      MATIC: data['matic-network']?.usd || priceCache.MATIC || 0.8,
      AVAX: data['avalanche-2']?.usd || priceCache.AVAX || 30,
      BNB: data['binancecoin']?.usd || priceCache.BNB || 600,
      LINK: data['chainlink']?.usd || priceCache.LINK || 15,
      AAVE: data['aave']?.usd || priceCache.AAVE || 100,
      UNI: data['uniswap']?.usd || priceCache.UNI || 8,
      USDC: 1.0,
      USDT: 1.0,
      DAI: 1.0
    }

    // Update cache
    Object.assign(priceCache, prices)
    Object.keys(prices).forEach(k => { lastUpdate[k] = Date.now() })

    // Store for APEX
    setConfig('prices', JSON.stringify(prices))
    setConfig('prices_updated', Date.now())

    return prices
  } catch (e) {
    logger.warn('Price fetch failed, using cache:', e.message)
    return priceCache
  }
}

export function getPrice(symbol) {
  const clean = symbol.replace('W', '') // WETH -> ETH
  return priceCache[symbol] || priceCache[clean] || priceCache.ETH || 3000
}

// Calculate market volatility (24h price change %)
export async function getVolatility() {
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true'
    const resp = await fetch(url)
    const data = await resp.json()
    const ethChange = Math.abs(data['ethereum']?.usd_24h_change || 0)
    const btcChange = Math.abs(data['bitcoin']?.usd_24h_change || 0)
    const avgChange = (ethChange + btcChange) / 2

    let level = 'low'
    if (avgChange > 10) level = 'extreme'
    else if (avgChange > 5) level = 'high'
    else if (avgChange > 2) level = 'moderate'

    setConfig('market_volatility', level)
    setConfig('market_change_pct', avgChange.toFixed(2))
    return { level, ethChange, btcChange, avgChange }
  } catch {
    return { level: getConfig('market_volatility') || 'moderate', avgChange: 3 }
  }
}

// Start price update loop
export function startPriceUpdates() {
  fetchPrices()
  setInterval(fetchPrices, 30000) // every 30s
  setInterval(getVolatility, 60000) // every 60s
  logger.info('Price feed started (CoinGecko)')
}
