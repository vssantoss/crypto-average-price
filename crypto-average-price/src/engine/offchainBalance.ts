import type { CryptoComRow } from '../types/transaction'
import { JournalType, OffchainSplitType, OnchainWithdrawalRole, Wallet } from '../types/transaction'

/**
 * Gets the wallet bucket for a row, defaulting imported rows to Trading Wallet.
 * @param row - Transaction row to inspect
 * @returns Wallet bucket used for balance calculations
 */
function getWallet(row: CryptoComRow): Wallet {
  return row.wallet ?? Wallet.TRADING
}

/**
 * Checks whether an on-chain withdrawal should move holdings into External Balance.
 * @param row - Transaction row to inspect
 * @returns True when the row is a cold-wallet/external transfer
 */
function isOnchainWithdrawalTransfer(row: CryptoComRow): boolean {
  return (
    row.journalType === JournalType.ONCHAIN_WITHDRAWAL &&
    (row.onchainWithdrawalRole ?? OnchainWithdrawalRole.DISPOSITION) === OnchainWithdrawalRole.TRANSFER
  )
}

/**
 * Gets the external quantity received from an on-chain transfer.
 * @param row - Transaction row to inspect
 * @returns Net received quantity, or gross quantity when no net amount was entered
 */
function getOnchainReceivedQuantity(row: CryptoComRow): number {
  if (!isOnchainWithdrawalTransfer(row)) return 0
  return row.onchainReceivedQuantity ?? Math.abs(row.transactionQuantity)
}

/**
 * Gets the quantity that should affect the external balance.
 * @param row - Transaction row to inspect
 * @returns Quantity to add to the external balance
 */
function getOffchainBalanceDelta(row: CryptoComRow): number {
  if (row.journalType === JournalType.OFFCHAIN_WITHDRAWAL) {
    return Math.abs(row.transactionQuantity)
  }

  if (isOnchainWithdrawalTransfer(row)) {
    return getOnchainReceivedQuantity(row)
  }

  if (row.journalType === JournalType.OFFCHAIN_DEPOSIT && row.offchainSplitType === OffchainSplitType.RETURN) {
    return -Math.abs(row.transactionQuantity)
  }

  if (row.journalType === JournalType.OFFCHAIN_SALE) {
    return -Math.abs(row.transactionQuantity)
  }

  if (getWallet(row) === Wallet.EXTERNAL) {
    return row.transactionQuantity
  }

  return 0
}

/**
 * Calculates external balances for transactions belonging to one instrument.
 * @param rows - Transaction rows for a single instrument, sorted chronologically
 * @returns Array of external balance values, one per row
 */
export function calculateOffchainBalances(rows: CryptoComRow[]): number[] {
  let balance = 0

  return rows.map(row => {
    balance += getOffchainBalanceDelta(row)
    return balance
  })
}
