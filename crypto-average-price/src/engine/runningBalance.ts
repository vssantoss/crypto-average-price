import type { CryptoComRow } from '../types/transaction'
import { JournalType, Wallet } from '../types/transaction'

/**
 * Gets the wallet bucket for a row, defaulting imported rows to Trading Wallet.
 * @param row - Transaction row to inspect
 * @returns Wallet bucket used for balance calculations
 */
function getWallet(row: CryptoComRow): Wallet {
  return row.wallet ?? Wallet.TRADING
}

/**
 * Gets the quantity that should affect the trading wallet running balance.
 * @param row - Transaction row to inspect
 * @returns Quantity to add to the trading wallet running balance
 */
function getRunningBalanceDelta(row: CryptoComRow): number {
  if (row.journalType === JournalType.OFFCHAIN_SALE) return 0
  if (row.journalType === JournalType.OFFCHAIN_WITHDRAWAL) return row.transactionQuantity
  if (getWallet(row) === Wallet.EXTERNAL) return 0
  return row.transactionQuantity
}

/**
 * Calculates running balances for a list of transactions belonging to one instrument.
 * Overrides act as anchor points that propagate both forward and backward.
 * Balance overrides are read directly from each row's balanceOverride field.
 * @param rows - Transaction rows for a single instrument, sorted chronologically
 * @returns Array of running balance values, one per row
 */
export function calculateRunningBalances(
  rows: CryptoComRow[],
): number[] {
  const n = rows.length
  if (n === 0) return []

  const balances = new Array<number>(n)

  const overrideIndices: number[] = []
  for (let i = 0; i < n; i++) {
    if (rows[i].balanceOverride !== undefined) {
      overrideIndices.push(i)
    }
  }

  if (overrideIndices.length === 0) {
    let balance = 0
    for (let i = 0; i < n; i++) {
      balance += getRunningBalanceDelta(rows[i])
      balances[i] = balance
    }
    return balances
  }

  // Back-calculate from first override to start
  const firstIdx = overrideIndices[0]
  let bal = rows[firstIdx].balanceOverride!
  balances[firstIdx] = bal
  for (let i = firstIdx - 1; i >= 0; i--) {
    bal -= getRunningBalanceDelta(rows[i + 1])
    balances[i] = bal
  }

  // Forward-calculate from each override to the next override (or end)
  for (let seg = 0; seg < overrideIndices.length; seg++) {
    const idx = overrideIndices[seg]
    let balance = rows[idx].balanceOverride!
    balances[idx] = balance

    const segEnd = seg < overrideIndices.length - 1 ? overrideIndices[seg + 1] : n
    for (let i = idx + 1; i < segEnd; i++) {
      balance += getRunningBalanceDelta(rows[i])
      balances[i] = balance
    }
  }

  return balances
}
