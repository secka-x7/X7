// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — STRUCTURED LOGGER
// Prefixed logs for easy Railway dashboard filtering
// ═══════════════════════════════════════════════════════

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
}

function timestamp() {
  return new Date().toISOString()
}

export const logger = {
  info: (msg, data = '') => {
    console.log(`${COLORS.cyan}[INFO]${COLORS.reset} ${timestamp()} ${msg}`, data || '')
  },
  success: (msg, data = '') => {
    console.log(`${COLORS.green}[SUCCESS]${COLORS.reset} ${timestamp()} ${msg}`, data || '')
  },
  warn: (msg, data = '') => {
    console.log(`${COLORS.yellow}[WARN]${COLORS.reset} ${timestamp()} ${msg}`, data || '')
  },
  error: (msg, data = '') => {
    console.error(`${COLORS.red}[ERROR]${COLORS.reset} ${timestamp()} ${msg}`, data || '')
  },
  chain: (chain, msg, data = '') => {
    console.log(`${COLORS.blue}[${chain.toUpperCase()}]${COLORS.reset} ${timestamp()} ${msg}`, data || '')
  },
  apex: (msg, data = '') => {
    console.log(`${COLORS.white}[APEX]${COLORS.reset} ${timestamp()} ${msg}`, data || '')
  },
  profit: (msg, data = '') => {
    console.log(`${COLORS.green}[PROFIT]${COLORS.reset} ${timestamp()} 💰 ${msg}`, data || '')
  }
}
