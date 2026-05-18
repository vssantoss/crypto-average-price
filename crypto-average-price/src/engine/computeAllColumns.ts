import type { CryptoComRow, ProcessedRow } from '../types/transaction'
import { JournalType } from '../types/transaction'
import type { PtaxMap } from '../types/ptax'
import {
  buildTradeMatchIndex,
  buildTradeLinkIndex,
  findLinkedTradingPair,
  getLinkedTradeFeeQuantity,
  getNetTransactionQuantity,
  getTradeLinkMetadata,
  isFoldedTradeFeeRow,
} from './tradeMatching'
import { calculateRunningBalances } from './runningBalance'
import { lookupPtaxRate } from './ptaxLookup'
import { calculateAveragePrices } from './averagePrice'
import { calculateProfitLoss } from './profitLoss'
import {
  normalizeInstruments,
  getUniqueInstruments,
  isUsdInstrument,
  isMergedUsdInternalTrade,
} from './usdMerge'

/**
 * Determines if a row represents a deposit that should have an editable BRL cost.
 * @param journalType - The journal type of the row
 * @returns True if this row type allows BRL cost editing
 */
function isDeposit(journalType: JournalType): boolean {
  return (
    journalType === JournalType.OFFCHAIN_DEPOSIT ||
    journalType === JournalType.ONCHAIN_DEPOSIT
  )
}

/**
 * Determines if a row represents a withdrawal disposition.
 * @param journalType - The journal type of the row
 * @returns True if this row type removes holdings as a withdrawal
 */
function isWithdrawal(journalType: JournalType): boolean {
  return (
    journalType === JournalType.OFFCHAIN_WITHDRAWAL ||
    journalType === JournalType.ONCHAIN_WITHDRAWAL
  )
}

/**
 * Determines whether a row represents a sale or withdrawal disposition.
 * @param row - Transaction row to inspect
 * @returns True when the row can use BRL sale proceeds
 */
function isSaleOrWithdrawal(row: CryptoComRow): boolean {
  return (
    (row.journalType === JournalType.TRADING && row.side === 'SELL') ||
    isWithdrawal(row.journalType)
  )
}

/**
 * Determines whether BRL transaction cost can be manually edited for a row.
 * @param row - Transaction row to inspect
 * @param tradeIndex - Trade match index built from original rows
 * @param rows - Normalized rows for this instrument
 * @returns True for acquisitions and sale/withdrawal dispositions
 */
function canEditBrlTransactionCost(
  row: CryptoComRow,
  tradeIndex: ReturnType<typeof buildTradeMatchIndex>,
  rows: CryptoComRow[],
): boolean {
  if (isMergedUsdInternalTrade(row, tradeIndex, rows)) return false

  return (
    isDeposit(row.journalType) ||
    isSaleOrWithdrawal(row) ||
    (row.journalType === JournalType.TRADING && row.side === 'BUY')
  )
}

/**
 * Gets the USD quantity represented by a USD-like transaction row.
 * @param row - USD-like transaction row
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Absolute USD quantity, or null when no usable amount exists
 */
function getUsdQuantity(row: CryptoComRow, tradeLinkIndex: ReturnType<typeof buildTradeLinkIndex>): number | null {
  const quantity = Math.abs(getNetTransactionQuantity(row, tradeLinkIndex))
  if (quantity > 0) return quantity

  const cost = Math.abs(row.transactionCost)
  return cost > 0 ? cost : null
}

/**
 * Computes an automatic PTAX cost for stablecoins acquired by selling another crypto.
 * @param row - Transaction row to inspect
 * @param ptaxRate - PTAX rate for this row's date
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Net BRL acquisition cost, or null when this is not a linked stablecoin buy
 */
function computeLinkedUsdBuyCost(
  row: CryptoComRow,
  ptaxRate: number | null,
  tradeLinkIndex: ReturnType<typeof buildTradeLinkIndex>,
): number | null {
  if (
    ptaxRate === null ||
    row.journalType !== JournalType.TRADING ||
    row.side !== 'BUY' ||
    !isUsdInstrument(row.instrument)
  ) {
    return null
  }

  const paired = findLinkedTradingPair(row, tradeLinkIndex)
  if (!paired || isUsdInstrument(paired.instrument) || paired.side !== 'SELL') return null

  const usdQuantity = getUsdQuantity(row, tradeLinkIndex)
  return usdQuantity !== null ? usdQuantity * ptaxRate : null
}

/**
 * Computes the PTAX-derived BRL sale value for a sale or withdrawal row.
 * @param row - Transaction row to inspect
 * @param ptaxRate - PTAX rate for this row's date
 * @param tradeLinkIndex - Fee-aware trade link index used to find linked trade pairs
 * @returns BRL sale value, or null when the row cannot be valued from PTAX
 */
function computePtaxSaleValue(
  row: CryptoComRow,
  ptaxRate: number | null,
  tradeLinkIndex: ReturnType<typeof buildTradeLinkIndex>,
): number | null {
  if (!isSaleOrWithdrawal(row) || ptaxRate === null) return null

  if (isUsdInstrument(row.instrument)) {
    const usdQuantity = getUsdQuantity(row, tradeLinkIndex)
    return usdQuantity !== null ? usdQuantity * ptaxRate : null
  }

  if (row.journalType !== JournalType.TRADING || row.side !== 'SELL') {
    return null
  }

  const paired = findLinkedTradingPair(row, tradeLinkIndex)
  if (!paired || !isUsdInstrument(paired.instrument)) return null

  const pairedUsdQuantity = getUsdQuantity(paired, tradeLinkIndex)
  return pairedUsdQuantity !== null ? pairedUsdQuantity * ptaxRate : null
}

/**
 * Computes the BRL transaction cost for a single row.
 * Uses manual BRL transaction amounts first, then PTAX-derived sale values where available.
 * @param row - The transaction row
 * @param ptaxRate - PTAX rate for this row's date
 * @param tradeIndex - Trade match index used to find paired USD rows
 * @param tradeLinkIndex - Fee-aware trade link index used to find linked trade pairs
 * @param rows - Normalized rows for this instrument
 * @param canEditBrl - Pre-computed editability flag (avoids redundant recomputation)
 * @returns BRL transaction cost, or null when required data is missing
 */
function computeBrlTransactionCost(
  row: CryptoComRow,
  ptaxRate: number | null,
  tradeIndex: ReturnType<typeof buildTradeMatchIndex>,
  tradeLinkIndex: ReturnType<typeof buildTradeLinkIndex>,
  rows: CryptoComRow[],
  canEditBrl?: boolean,
): number | null {
  if (isMergedUsdInternalTrade(row, tradeIndex, rows)) {
    return null
  }

  const canEdit = canEditBrl ?? canEditBrlTransactionCost(row, tradeIndex, rows)
  if (canEdit && row.userBrlCost !== undefined) {
    return row.userBrlCost
  }

  const linkedUsdBuyCost = computeLinkedUsdBuyCost(row, ptaxRate, tradeLinkIndex)
  if (linkedUsdBuyCost !== null) return linkedUsdBuyCost

  return computePtaxSaleValue(row, ptaxRate, tradeLinkIndex)
}

/**
 * Main computation orchestrator.
 * Takes raw transactions and PTAX data, reads overrides from the rows themselves,
 * and produces fully processed rows with all computed columns.
 *
 * @param allRows - All raw Crypto.com transaction rows (all instruments)
 * @param ptaxMap - PTAX date-to-rate map
 * @param usdMergeEnabled - Whether to merge USD stablecoin variants
 * @param instrument - The instrument to compute rows for, or null for all
 * @returns Array of ProcessedRow objects ready for display
 */
export function computeAllColumns(
  allRows: CryptoComRow[],
  ptaxMap: PtaxMap,
  usdMergeEnabled: boolean,
  instrument: string | null,
): ProcessedRow[] {
  // Build trade match index from ALL rows (before filtering)
  const tradeIndex = buildTradeMatchIndex(allRows)
  const tradeLinkIndex = buildTradeLinkIndex(allRows)

  // Normalize instruments if merging USD
  const normalizedRows = normalizeInstruments(allRows, usdMergeEnabled)

  // Get unique instruments for grouping
  const instruments = instrument
    ? [instrument]
    : getUniqueInstruments(normalizedRows)

  const rawByOrder = new Map(allRows.map(r => [r.order, r]))
  const allProcessedRows: ProcessedRow[] = []

  for (const inst of instruments) {
    const instrumentRows = normalizedRows.filter(r => r.instrument === inst)
    if (instrumentRows.length === 0) continue

    const runningBalances = calculateRunningBalances(instrumentRows)

    const avgPriceResults = calculateAveragePrices(
      instrumentRows,
      runningBalances,
      ptaxMap,
      tradeIndex,
      tradeLinkIndex,
    )

    for (let i = 0; i < instrumentRows.length; i++) {
      const row = instrumentRows[i]
      const balance = runningBalances[i]
      const avgResult = avgPriceResults[i]
      const ptaxRate = lookupPtaxRate(row.eventDate, ptaxMap)

      const canEditBrl = canEditBrlTransactionCost(row, tradeIndex, instrumentRows)
      const brlTransactionCost = computeBrlTransactionCost(row, ptaxRate, tradeIndex, tradeLinkIndex, instrumentRows, canEditBrl)
      const brlRunningBalance = avgResult.brlInvested

      const profitLoss = calculateProfitLoss(
        row,
        avgResult.avgPrice,
        ptaxRate,
        tradeIndex,
        tradeLinkIndex,
        instrumentRows,
      )

      const originalRow = rawByOrder.get(row.order)
      const originalInstrument = originalRow?.instrument || row.instrument
      const tradeLink = getTradeLinkMetadata(originalRow || row, tradeLinkIndex)
      const tradeFeeQuantity = getLinkedTradeFeeQuantity(originalRow || row, tradeLinkIndex)
      const netTransactionQuantity = getNetTransactionQuantity(row, tradeLinkIndex)
      const suppressCalculatedFields = isFoldedTradeFeeRow(originalRow || row, tradeLinkIndex)

      const processed: ProcessedRow = {
        id: `${row.order}-${row.instrument}`,
        order: row.order,
        timeUtc: row.timeUtc,
        eventDate: row.eventDate,
        journalType: row.journalType,
        instrument: row.instrument,
        originalInstrument,
        exchangeName: row.exchangeName || '',
        sourceFileName: row.sourceFileName || '',
        takerSide: row.takerSide,
        side: row.side,
        transactionQuantity: row.transactionQuantity,
        tradeFeeQuantity,
        netTransactionQuantity,
        transactionCost: row.transactionCost,
        runningBalance: balance,
        cambioBC: ptaxRate,
        brlRunningBalance,
        brlTransactionCost,
        precoMedioCompra: avgResult.avgPrice,
        totalLucroPrejuizo: profitLoss,
        info: row.info || '',
        suppressCalculatedFields,
        isTradeLinked: tradeLink.isLinked,
        isLinkedTradeFee: tradeLink.isFee,
        tradeGroupId: tradeLink.groupId,
        tradeGroupSource: tradeLink.groupSource,
        tradeLinkSummary: tradeLink.summary,
        linkedFeeAmount: tradeLink.feeAmount,
        linkedFeeInstrument: tradeLink.feeInstrument,
        hasPtaxWarning: false,
        hasBalanceOverride: row.balanceOverride !== undefined,
        isEditable: {
          brlCost: canEditBrl,
          avgPrice: true,
          info: true,
        },
      }

      allProcessedRows.push(processed)
    }
  }

  // Sort all processed rows by order (already chronologically numbered)
  allProcessedRows.sort((a, b) => a.order - b.order)

  return allProcessedRows
}
