// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — MODEM PAY INTEGRATION
// Built from official Modem Pay documentation
// npm install modem-pay
// ═══════════════════════════════════════════════════════
import { createRequire } from 'module'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger.js'
import { recordWithdrawal, updateWithdrawal, getWithdrawals } from '../utils/db.js'

const require = createRequire(import.meta.url)

let modemClient = null

function getClient() {
  if (!modemClient) {
    const ModemPay = require('modem-pay')
    // Handle both default export and named export
    const MP = ModemPay.default || ModemPay
    modemClient = new MP(process.env.MODEM_PAY_SECRET_KEY)
  }
  return modemClient
}

// Get live USD to GMD exchange rate
async function getGMDRate() {
  try {
    const resp = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    const data = await resp.json()
    return data.rates?.GMD || 72 // Fallback: ~72 GMD per USD
  } catch {
    return 72
  }
}

// Main withdrawal function
// Only requires amount — Modem Pay handles everything else
export async function withdrawToWave(usdcAmount) {
  const waveNumber = process.env.MODEM_PAY_WAVE_NUMBER
  if (!waveNumber) {
    throw new Error('MODEM_PAY_WAVE_NUMBER not set')
  }

  const secretKey = process.env.MODEM_PAY_SECRET_KEY
  if (!secretKey) {
    throw new Error('MODEM_PAY_SECRET_KEY not set')
  }

  const idempotencyKey = uuidv4()
  const gmdRate = await getGMDRate()
  const gmdAmount = Math.floor(usdcAmount * gmdRate)

  logger.info(`Withdrawal initiated: ${usdcAmount} USDC → ${gmdAmount} GMD`)
  recordWithdrawal(idempotencyKey, usdcAmount, gmdAmount)

  try {
    const client = getClient()

    // Exact API call from Modem Pay documentation
    const transfer = await client.transfers.initiate(
      {
        amount: gmdAmount,
        currency: 'GMD',
        network: 'wave', // env var change = different network, zero code change
        account_number: waveNumber,
        beneficiary_name: process.env.MODEM_PAY_BENEFICIARY_NAME || 'X7 Protocol',
        narration: 'X7 Protocol Revenue',
        metadata: {
          system: 'x7-protocol',
          usdc_amount: usdcAmount,
          withdrawal_id: idempotencyKey
        },
        callback_url: process.env.BASE_URL
          ? `${process.env.BASE_URL}/webhooks/modem-pay`
          : undefined
      },
      idempotencyKey // Idempotency-Key header (prevents double-send)
    )

    updateWithdrawal(idempotencyKey, transfer.id, transfer.status, transfer.transfer_reference)
    logger.success(`Transfer initiated: ${transfer.id} | Status: ${transfer.status}`)
    return { success: true, transfer, idempotencyKey }
  } catch (e) {
    updateWithdrawal(idempotencyKey, null, 'failed', null, e.message)
    logger.error('Withdrawal failed:', e.message)
    throw e
  }
}

// Check withdrawal status
export async function checkWithdrawalStatus(transferId) {
  try {
    const client = getClient()
    const transfer = await client.transfers.retrieve(transferId)
    return transfer.status
  } catch (e) {
    logger.error('Status check failed:', e.message)
    return 'unknown'
  }
}

// Handle Modem Pay webhooks
export async function handleModemWebhook(event) {
  logger.info(`Modem Pay webhook: ${event.type}`)

  switch (event.type) {
    case 'transfer.succeeded':
      updateWithdrawal(event.data.id, event.data.id, 'completed')
      logger.success(`Wave transfer completed: ${event.data.id}`)
      break
    case 'transfer.failed':
      updateWithdrawal(event.data.id, event.data.id, 'failed')
      logger.error(`Transfer failed: ${event.data.id}`)
      break
    case 'transfer.flagged':
      updateWithdrawal(event.data.id, event.data.id, 'flagged')
      logger.error(`TRANSFER FLAGGED — check Modem Pay dashboard: ${event.data.id}`)
      break
    case 'transfer.reversed':
      updateWithdrawal(event.data.id, event.data.id, 'reversed')
      logger.warn(`Transfer reversed: ${event.data.id}`)
      break
  }
}

// Get withdrawal history for dashboard
export function getWithdrawalHistory() {
  return getWithdrawals(20)
}
