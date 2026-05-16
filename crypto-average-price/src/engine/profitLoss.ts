import type { CryptoComRow } from '../types/transaction'
import { JournalType } from '../types/transaction'
import type { PtaxMap } from '../types/ptax'
import type { TradeLinkIndex, TradeMatchIndex } from './tradeMatching'
import { findLinkedTradingPair } from './tradeMatching'
import { lookupPtaxRate } from './ptaxLookup'
import { isUsdInstrument, isMergedUsdInternalTrade } from './usdMerge'

/**
 * Checks whether a row can realize BRL profit/loss from a USD PTAX sale value.
 * @param row - Transaction row to inspect
 * @returns True when the row represents a sell or withdrawal disposition
 */
function isProfitLossDisposition(row: CryptoComRow): boolean {
  return (
    (row.journalType === JournalType.TRADING && row.side === 'SELL') ||
    row.journalType === JournalType.OFFCHAIN_WITHDRAWAL ||
    row.journalType === JournalType.ONCHAIN_WITHDRAWAL
  )
}

/**
 * Gets the absolute transaction value from a row.
 * @param row - Transaction row containing Crypto.com quantity and cost fields
 * @returns Absolute transaction cost, falling back to quantity when cost is zero
 */
function getAbsoluteRowValue(row: CryptoComRow): number {
  const cost = Math.abs(row.transactionCost)
  return cost > 0 ? cost : Math.abs(row.transactionQuantity)
}

/**
 * Finds the USD side of a non-USD trade for sale proceeds calculation.
 * @param row - Non-USD trading SELL row
 * @param tradeIndex - Trade match index built from all imported rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns The most likely paired USD row, or null when none exists
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
 * @param row - Transaction row being sold or withdrawn
 * @param ptaxRate - PTAX venda rate for the row date
 * @param tradeIndex - Trade match index used to find paired USD rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns BRL sale proceeds, or null when the sale value cannot be derived
 */
function calculateBrlSaleProceeds(
  row: CryptoComRow,
  ptaxRate: number,
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
): number | null {
  const quantity = Math.abs(row.transactionQuantity)
  if (quantity === 0) return null

  if (isUsdInstrument(row.instrument)) {
    return quantity * ptaxRate
  }

  if (row.journalType !== JournalType.TRADING || row.side !== 'SELL') {
    return null
  }

  const pairedUsdRow = findUsdTradePair(row, tradeIndex, tradeLinkIndex)
  if (!pairedUsdRow) return null

  return getAbsoluteRowValue(pairedUsdRow) * ptaxRate
}

/**
 * Gets manually entered BRL sale proceeds for disposition rows.
 * @param row - Transaction row that may contain a manual BRL amount
 * @returns Manual BRL proceeds, or null when the row has no override
 */
function getManualSaleProceeds(row: CryptoComRow): number | null {
  return row.userBrlCost !== undefined ? row.userBrlCost : null
}

/**
 * Calculates the profit/loss for a single transaction row.
 * Uses manual BRL proceeds first, falling back to PTAX sale proceeds.
 * @param row - The transaction row
 * @param avgPrice - The average BRL price at this row
 * @param ptaxMap - PTAX date-to-rate map
 * @param tradeIndex - Trade match index used to find paired USD sale rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @param rows - Normalized rows for this instrument
 * @returns BRL profit/loss, or null when it cannot be calculated
 */
export function calculateProfitLoss(
  row: CryptoComRow,
  avgPrice: number | null,
  ptaxMap: PtaxMap,
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
  rows: CryptoComRow[] = [],
): number | null {
  if (!isProfitLossDisposition(row) || avgPrice === null) return null
  if (isMergedUsdInternalTrade(row, tradeIndex, rows)) return null

  const quantity = Math.abs(row.transactionQuantity)
  if (quantity === 0) return null

  const manualSaleProceeds = getManualSaleProceeds(row)
  if (manualSaleProceeds !== null) {
    return manualSaleProceeds - avgPrice * quantity
  }

  const ptaxRate = lookupPtaxRate(row.eventDate, ptaxMap)
  if (ptaxRate === null) return null

  const saleProceeds = calculateBrlSaleProceeds(row, ptaxRate, tradeIndex, tradeLinkIndex)
  if (saleProceeds === null) return null

  return saleProceeds - avgPrice * quantity
}
