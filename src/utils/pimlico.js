// ═══════════════════════════════════════════════════════
// X7 PROTOCOL — TRANSACTION SENDER
// Direct viem signing for execution (no rate limits)
// Pimlico only used for initial contract deployment gas
// ═══════════════════════════════════════════════════════
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CHAINS, WALLETS } from '../config/chains.js'
import { logger } from './logger.js'

const executorAccount = privateKeyToAccount(WALLETS.executor)
const walletClients = {}
const publicClients = {}

export function getWalletClient(chainName) {
  if (!walletClients[chainName]) {
    const chain = CHAINS[chainName]
    walletClients[chainName] = createWalletClient({
      account: executorAccount,
      transport: http(chain.rpcHttp)
    })
  }
  return walletClients[chainName]
}

export function getPublicClient(chainName) {
  if (!publicClients[chainName]) {
    const chain = CHAINS[chainName]
    publicClients[chainName] = createPublicClient({
      transport: http(chain.rpcHttp)
    })
  }
  return publicClients[chainName]
}

export const executorAddress = executorAccount.address

// Get executor wallet balance on a chain
export async function getExecutorBalance(chainName) {
  try {
    const client = getPublicClient(chainName)
    const balance = await client.getBalance({ address: executorAccount.address })
    return balance
  } catch (e) {
    return 0n
  }
}

// Send a raw transaction directly (no ERC-4337, no rate limits)
export async function sendTransaction(chainName, txParams) {
  try {
    const wallet = getWalletClient(chainName)
    const hash = await wallet.sendTransaction(txParams)
    logger.chain(chainName, `TX sent: ${hash}`)
    return hash
  } catch (e) {
    logger.error(`TX failed on ${chainName}:`, e.message)
    throw e
  }
}

// Deploy a contract using raw bytecode
export async function deployContract(chainName, abi, bytecode, args = []) {
  try {
    const wallet = getWalletClient(chainName)
    const public_ = getPublicClient(chainName)

    const hash = await wallet.deployContract({
      abi,
      bytecode,
      args
    })

    logger.chain(chainName, `Deploy TX: ${hash}`)

    const receipt = await public_.waitForTransactionReceipt({ hash, timeout: 120000 })
    logger.success(`Contract deployed on ${chainName}: ${receipt.contractAddress}`)
    return receipt.contractAddress
  } catch (e) {
    logger.error(`Deploy failed on ${chainName}:`, e.message)
    throw e
  }
}

// Check if Pimlico can sponsor gas (for deployment only)
export async function requestPimlicoGas(chainName) {
  try {
    const apiKey = process.env.PIMLICO_API_KEY
    if (!apiKey) return false

    const chain = CHAINS[chainName]
    const resp = await fetch(`${chain.pimlico}?apikey=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'pimlico_getUserOperationGasPrice',
        params: []
      })
    })
    const data = await resp.json()
    return !data.error
  } catch {
    return false
  }
}
