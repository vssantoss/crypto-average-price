import type { CryptoComRow } from '../types/transaction'
import { JournalType, OnchainWithdrawalRole } from '../types/transaction'
import type { TradeLinkIndex, TradeMatchIndex } from './tradeMatching'
import { findLinkedTradingPair, getNetTransactionQuantity } from './tradeMatching'
import { isInternalAssetTrade } from './assetGroups'
import { isUsdInstrument } from './usdMerge'

/**
 * Checks whether a row can realize BRL profit/loss from a USD PTAX sale value.
 * @param row - Transaction row to inspect
 * @returns True for SELL trades, offchain sales, and onchain withdrawal dispositions
 */
function isProfitLossDisposition(row: CryptoComRow): boolean {
  const onchainRole = row.onchainWithdrawalRole ?? OnchainWithdrawalRole.DISPOSITION
  return (
    (row.journalType === JournalType.TRADING && row.side === 'SELL') ||
    row.journalType === JournalType.OFFCHAIN_SALE ||
    (row.journalType === JournalType.ONCHAIN_WITHDRAWAL && onchainRole === OnchainWithdrawalRole.DISPOSITION)
  )
}

/**
 * Gets the absolute transaction value from a row.
 * Prefers fee-aware transaction quantity; falls back to transactionCost.
 * @param row - Transaction row to inspect
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Absolute value of the transaction cost or quantity
 */
function getAbsoluteRowValue(row: CryptoComRow, tradeLinkIndex: TradeLinkIndex): number {
  const quantity = Math.abs(getNetTransactionQuantity(row, tradeLinkIndex))
  if (quantity > 0) return quantity

  return Math.abs(row.transactionCost)
}

/**
 * Finds the USD side of a non-USD trade for sale proceeds calculation.
 * Checks the fee-aware trade link index first, then falls back to tradeMatchId.
 * @param row - The non-USD SELL row
 * @param tradeIndex - Trade match index built from original rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns The paired USD BUY row, or null if none found
 */
function findUsdTradePair(
  row: CryptoComRow,
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
): CryptoComRow | null {
  const linkedPair = findLinkedTradingPair(row, tradeLinkIndex)
  if (linkedPair && isUsdInstrument(linkedPair.instrument) && linkedPair.side === 'BUY') {
    return linkedPair
  }

  const id = row.tradeMatchId
  if (!id || id === '0') return null

  const matches = tradeIndex.get(id)
  if (!matches) return null

  const candidates = matches.filter(match => (
    match.order !== row.order &&
    isUsdInstrument(match.instrument) &&
    match.side === 'BUY'
  ))

  if (candidates.length === 0) return null

  const following = candidates
    .filter(match => match.order > row.order)
    .sort((a, b) => a.order - b.order)

  if (following.length > 0) return following[0]

  return candidates
    .slice()
    .sort((a, b) => Math.abs(a.order - row.order) - Math.abs(b.order - row.order))[0]
}

/**
 * Calculates BRL sale proceeds for a disposition row using PTAX.
 * For USD instruments, multiplies quantity by PTAX directly.
 * For non-USD SELL trades, finds the paired USD row and uses its value.
 * @param row - Transaction row to compute proceeds for
 * @param ptaxRate - PTAX rate for this row's date
 * @param tradeIndex - Trade match index built from original rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns BRL sale proceeds, or null when proceeds cannot be determined
 */
function calculateBrlSaleProceeds(
  row: CryptoComRow,
  ptaxRate: number,
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
): number | null {
  const quantity = Math.abs(getNetTransactionQuantity(row, tradeLinkIndex))
  if (quantity === 0) return null

  if (isUsdInstrument(row.instrument)) {
    return quantity * ptaxRate
  }

  if (row.journalType !== JournalType.TRADING || row.side !== 'SELL') {
    return null
  }

  const pairedUsdRow = findUsdTradePair(row, tradeIndex, tradeLinkIndex)
  if (!pairedUsdRow) return null

  return getAbsoluteRowValue(pairedUsdRow, tradeLinkIndex) * ptaxRate
}

/**
 * Gets manually entered BRL sale proceeds for disposition rows.
 * @param row - Transaction row to inspect
 * @returns The user-entered BRL cost, or null if not set
 */
function getManualSaleProceeds(row: CryptoComRow): number | null {
  return row.userBrlCost !== undefined ? row.userBrlCost : null
}

/**
 * Calculates the profit/loss for a single transaction row.
 * Uses manual BRL sale proceeds first, then PTAX-derived proceeds.
 * Profit/loss = sale proceeds − (avg price × quantity).
 * @param row - Transaction row to compute P/L for
 * @param avgPrice - Current BRL average purchase price per unit
 * @param ptaxRate - PTAX rate for this row's date, or null if unavailable
 * @param tradeIndex - Trade match index built from original rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @param rows - Rows for this asset (used for internal asset trade detection)
 * @returns BRL profit/loss, or null when the row is not a disposition or data is missing
 */
export function calculateProfitLoss(
  row: CryptoComRow,
  avgPrice: number | null,
  ptaxRate: number | null,
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
  rows: CryptoComRow[] = [],
): number | null {
  if (!isProfitLossDisposition(row) || avgPrice === null) return null
  if (isInternalAssetTrade(row, rows)) return null

  const quantity = Math.abs(getNetTransactionQuantity(row, tradeLinkIndex))
  if (quantity === 0) return null

  const manualSaleProceeds = getManualSaleProceeds(row)
  if (manualSaleProceeds !== null) {
    return manualSaleProceeds - avgPrice * quantity
  }

  if (row.journalType === JournalType.OFFCHAIN_SALE) return null

  if (ptaxRate === null) return null

  const saleProceeds = calculateBrlSaleProceeds(row, ptaxRate, tradeIndex, tradeLinkIndex)
  if (saleProceeds === null) return null

  return saleProceeds - avgPrice * quantity
}
