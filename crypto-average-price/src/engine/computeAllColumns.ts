import type { CryptoComRow, ProcessedRow } from '../types/transaction'
import { JournalType, OffchainSplitType, Wallet } from '../types/transaction'
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
import { calculateOffchainBalances } from './offchainBalance'
import { lookupPtaxRate } from './ptaxLookup'
import { calculateAveragePrices, type AveragePriceContext, type AvgPriceResult } from './averagePrice'
import { calculateProfitLoss } from './profitLoss'
import {
  normalizeInstruments,
  getUniqueInstruments,
  isUsdInstrument,
  isMergedUsdInternalTrade,
} from './usdMerge'

const SPLIT_ORDER_STEP = 0.01
const QUANTITY_EPSILON = 0.00000001

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
function isWithdrawalDisposition(journalType: JournalType): boolean {
  return (
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
    row.journalType === JournalType.OFFCHAIN_SALE ||
    isWithdrawalDisposition(row.journalType)
  )
}

/**
 * Gets the wallet bucket for a row, defaulting imported rows to Trading Wallet.
 * @param row - Transaction row to inspect
 * @returns Wallet bucket used for display and balance calculations
 */
function getWallet(row: CryptoComRow): Wallet {
  return row.wallet ?? Wallet.TRADING
}

/**
 * Checks whether a derived row represents the return portion of an offchain deposit.
 * @param row - Transaction row to inspect
 * @returns True when the row returns existing external holdings
 */
function isOffchainReturnDeposit(row: CryptoComRow): boolean {
  return row.journalType === JournalType.OFFCHAIN_DEPOSIT && row.offchainSplitType === OffchainSplitType.RETURN
}

/**
 * Checks whether a deposit row can represent a new acquisition.
 * @param row - Transaction row to inspect
 * @returns True when the deposit can accept acquisition cost
 */
function isCostEditableDeposit(row: CryptoComRow): boolean {
  return isDeposit(row.journalType) && !isOffchainReturnDeposit(row)
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
    isCostEditableDeposit(row) ||
    isSaleOrWithdrawal(row) ||
    (row.journalType === JournalType.TRADING && row.side === 'BUY')
  )
}

/**
 * Determines whether USD transaction cost can be manually edited for a row.
 * @param row - Transaction row to inspect
 * @param tradeIndex - Trade match index built from original rows
 * @param rows - Normalized rows for this instrument
 * @returns True for non-stablecoin acquisitions and sale/withdrawal dispositions
 */
function canEditUsdTransactionCost(
  row: CryptoComRow,
  tradeIndex: ReturnType<typeof buildTradeMatchIndex>,
  rows: CryptoComRow[],
): boolean {
  if (isUsdInstrument(row.instrument)) return false
  if (isMergedUsdInternalTrade(row, tradeIndex, rows)) return false

  return (
    isCostEditableDeposit(row) ||
    isWithdrawalDisposition(row.journalType) ||
    (row.journalType === JournalType.TRADING && row.side === 'SELL') ||
    (row.journalType === JournalType.TRADING && row.side === 'BUY')
  )
}

/**
 * Builds a derived offchain deposit split row with adjusted quantity and source order.
 * @param row - Original offchain deposit row
 * @param quantity - Quantity assigned to this split row
 * @param splitType - Split role for the derived row
 * @param orderOffset - Fractional order offset used to keep split rows stable
 * @returns Derived transaction row for calculation and display
 */
function createOffchainDepositSplitRow(
  row: CryptoComRow,
  quantity: number,
  splitType: OffchainSplitType,
  orderOffset: number,
): CryptoComRow {
  return {
    ...row,
    order: row.order + orderOffset,
    sourceOrder: row.sourceOrder ?? row.order,
    transactionQuantity: quantity,
    transactionCost: quantity,
    offchainSplitType: splitType,
  }
}

/**
 * Derives offchain deposit split rows based on external balance available before each deposit.
 * @param rows - Normalized instrument rows sorted chronologically
 * @returns Rows with return/acquisition portions split for calculation and display
 */
function createOffchainSplitRows(rows: CryptoComRow[]): CryptoComRow[] {
  const result: CryptoComRow[] = []
  let externalBalance = 0

  for (const row of rows) {
    const quantity = row.transactionQuantity

    if (row.journalType === JournalType.OFFCHAIN_DEPOSIT && quantity > QUANTITY_EPSILON) {
      const returnQuantity = Math.min(quantity, Math.max(externalBalance, 0))
      const acquisitionQuantity = quantity - returnQuantity

      if (returnQuantity > QUANTITY_EPSILON && acquisitionQuantity > QUANTITY_EPSILON) {
        result.push(createOffchainDepositSplitRow(row, returnQuantity, OffchainSplitType.RETURN, SPLIT_ORDER_STEP))
        result.push(createOffchainDepositSplitRow(row, acquisitionQuantity, OffchainSplitType.ACQUISITION, SPLIT_ORDER_STEP * 2))
      } else if (returnQuantity > QUANTITY_EPSILON) {
        result.push(createOffchainDepositSplitRow(row, quantity, OffchainSplitType.RETURN, 0))
      } else {
        result.push({ ...row, sourceOrder: row.sourceOrder ?? row.order })
      }

      externalBalance -= returnQuantity
      continue
    }

    result.push({ ...row, sourceOrder: row.sourceOrder ?? row.order })

    if (row.journalType === JournalType.OFFCHAIN_WITHDRAWAL) {
      externalBalance += Math.abs(row.transactionQuantity)
    } else if (row.journalType === JournalType.OFFCHAIN_SALE) {
      externalBalance -= Math.abs(row.transactionQuantity)
    } else if (getWallet(row) === Wallet.EXTERNAL) {
      externalBalance += row.transactionQuantity
    }
  }

  return result
}

/**
 * Creates rows whose quantities represent total holdings for cost-basis math.
 * @param rows - Normalized instrument rows
 * @returns Rows with offchain transfer quantities adjusted for cost-basis calculations
 */
function createCostBasisRows(rows: CryptoComRow[]): CryptoComRow[] {
  return rows.map(row => {
    if (row.journalType === JournalType.OFFCHAIN_WITHDRAWAL || isOffchainReturnDeposit(row)) {
      return { ...row, transactionQuantity: 0 }
    }

    if (row.journalType === JournalType.OFFCHAIN_SALE) {
      return { ...row, transactionQuantity: -Math.abs(row.transactionQuantity) }
    }

    return row
  })
}

/**
 * Adds trading and external balances to get total holdings for cost basis.
 * @param runningBalances - Exchange running balances
 * @param offchainBalances - Offchain balances
 * @returns Total holdings after each row
 */
function calculateTotalBalances(runningBalances: number[], offchainBalances: number[]): number[] {
  return runningBalances.map((balance, index) => balance + offchainBalances[index])
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
 * Finds the linked USD/stablecoin leg for a non-stablecoin trade row.
 * @param row - Non-stablecoin trading row to inspect
 * @param expectedSide - Side expected on the linked USD/stablecoin leg
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Linked USD/stablecoin row, or null when no valid row exists
 */
function findLinkedUsdLeg(
  row: CryptoComRow,
  expectedSide: 'BUY' | 'SELL',
  tradeLinkIndex: ReturnType<typeof buildTradeLinkIndex>,
): CryptoComRow | null {
  if (row.journalType !== JournalType.TRADING || isUsdInstrument(row.instrument)) return null

  const paired = findLinkedTradingPair(row, tradeLinkIndex)
  if (!paired || paired.side !== expectedSide || !isUsdInstrument(paired.instrument)) return null

  return paired
}

/**
 * Gets the linked USD/stablecoin amount attached to a non-stablecoin trade.
 * @param row - Non-stablecoin trading row to inspect
 * @param expectedSide - Side expected on the linked USD/stablecoin leg
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Absolute linked USD/stablecoin value, or null when unavailable
 */
function getLinkedUsdAmount(
  row: CryptoComRow,
  expectedSide: 'BUY' | 'SELL',
  tradeLinkIndex: ReturnType<typeof buildTradeLinkIndex>,
): number | null {
  const linkedUsd = findLinkedUsdLeg(row, expectedSide, tradeLinkIndex)
  return linkedUsd ? getUsdQuantity(linkedUsd, tradeLinkIndex) : null
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
 * Gets automatic BRL cost details for a non-stablecoin buy funded by stablecoin.
 * @param row - Non-stablecoin BUY row
 * @param stablecoinAvgBeforeByOrder - BRL average price before each stablecoin row
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns BRL cost details, or null when the linked stablecoin cost basis is unavailable
 */
function getStablecoinFundedBrlCost(
  row: CryptoComRow,
  stablecoinAvgBeforeByOrder: Map<number, number>,
  tradeLinkIndex: ReturnType<typeof buildTradeLinkIndex>,
): { cost: number; rate: number; usdAmount: number } | null {
  if (row.journalType !== JournalType.TRADING || row.side !== 'BUY' || isUsdInstrument(row.instrument)) {
    return null
  }

  const linkedUsd = findLinkedUsdLeg(row, 'SELL', tradeLinkIndex)
  if (!linkedUsd) return null

  const usdAmount = getUsdQuantity(linkedUsd, tradeLinkIndex)
  const rate = stablecoinAvgBeforeByOrder.get(linkedUsd.order)
  if (usdAmount === null || rate === undefined || rate <= 0) return null

  return {
    cost: usdAmount * rate,
    rate,
    usdAmount,
  }
}

/**
 * Gets the acquisition BRL cost used by average-price calculation.
 * @param row - Transaction row being priced
 * @param context - Average price calculation context
 * @param ptaxMap - PTAX date-to-rate map
 * @param stablecoinAvgBeforeByOrder - BRL average price before each stablecoin row
 * @returns BRL acquisition cost, or null when no reliable cost exists
 */
function getBrlAcquisitionCost(
  row: CryptoComRow,
  context: AveragePriceContext,
  ptaxMap: PtaxMap,
  stablecoinAvgBeforeByOrder: Map<number, number>,
): number | null {
  if (isOffchainReturnDeposit(row)) return null

  if (row.journalType === JournalType.TRADING && row.side === 'BUY') {
    if (row.userBrlCost !== undefined) return row.userBrlCost

    const stablecoinCost = getStablecoinFundedBrlCost(row, stablecoinAvgBeforeByOrder, context.tradeLinkIndex)
    if (stablecoinCost !== null) return stablecoinCost.cost

    if (!isUsdInstrument(row.instrument)) return null

    const ptaxRate = lookupPtaxRate(row.eventDate, ptaxMap)
    return computeLinkedUsdBuyCost(row, ptaxRate, context.tradeLinkIndex)
  }

  if (isDeposit(row.journalType)) {
    if (row.userBrlCost !== undefined) return row.userBrlCost
    return null
  }

  return null
}

/**
 * Gets the acquisition USD cost used by average-price calculation.
 * @param row - Transaction row being priced
 * @param context - Average price calculation context
 * @returns USD acquisition cost, or null when no reliable cost exists
 */
function getUsdAcquisitionCost(row: CryptoComRow, context: AveragePriceContext): number | null {
  if (isUsdInstrument(row.instrument)) return null
  if (isOffchainReturnDeposit(row)) return null

  if (row.journalType === JournalType.TRADING && row.side === 'BUY') {
    if (row.userUsdCost !== undefined) return row.userUsdCost
    return getLinkedUsdAmount(row, 'SELL', context.tradeLinkIndex)
  }

  if (isDeposit(row.journalType)) {
    if (row.userUsdCost !== undefined) return row.userUsdCost
    return null
  }

  return null
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
  if (row.journalType === JournalType.OFFCHAIN_SALE) return null

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
 * @param stablecoinAvgBeforeByOrder - BRL average price before each stablecoin row
 * @param canEditBrl - Pre-computed editability flag (avoids redundant recomputation)
 * @returns BRL transaction cost, or null when required data is missing
 */
function computeBrlTransactionCost(
  row: CryptoComRow,
  ptaxRate: number | null,
  tradeIndex: ReturnType<typeof buildTradeMatchIndex>,
  tradeLinkIndex: ReturnType<typeof buildTradeLinkIndex>,
  rows: CryptoComRow[],
  stablecoinAvgBeforeByOrder: Map<number, number>,
  canEditBrl?: boolean,
): number | null {
  if (isMergedUsdInternalTrade(row, tradeIndex, rows)) {
    return null
  }

  const canEdit = canEditBrl ?? canEditBrlTransactionCost(row, tradeIndex, rows)
  if (canEdit && row.userBrlCost !== undefined) {
    return row.userBrlCost
  }

  const stablecoinCost = getStablecoinFundedBrlCost(row, stablecoinAvgBeforeByOrder, tradeLinkIndex)
  if (stablecoinCost !== null) return stablecoinCost.cost

  const linkedUsdBuyCost = computeLinkedUsdBuyCost(row, ptaxRate, tradeLinkIndex)
  if (linkedUsdBuyCost !== null) return linkedUsdBuyCost

  return computePtaxSaleValue(row, ptaxRate, tradeLinkIndex)
}

/**
 * Computes the USD transaction cost for a single row.
 * @param row - Transaction row to inspect
 * @param tradeIndex - Trade match index used to detect internal USD movement
 * @param tradeLinkIndex - Fee-aware trade link index used to find linked trade pairs
 * @param rows - Normalized rows for this instrument
 * @param canEditUsd - Pre-computed editability flag
 * @returns USD transaction cost/proceeds, or null when unavailable or not applicable
 */
function computeUsdTransactionCost(
  row: CryptoComRow,
  tradeIndex: ReturnType<typeof buildTradeMatchIndex>,
  tradeLinkIndex: ReturnType<typeof buildTradeLinkIndex>,
  rows: CryptoComRow[],
  canEditUsd?: boolean,
): number | null {
  if (isUsdInstrument(row.instrument) || isMergedUsdInternalTrade(row, tradeIndex, rows)) {
    return null
  }

  const canEdit = canEditUsd ?? canEditUsdTransactionCost(row, tradeIndex, rows)
  if (canEdit && row.userUsdCost !== undefined) {
    return row.userUsdCost
  }

  if (row.journalType === JournalType.TRADING && row.side === 'BUY') {
    return getLinkedUsdAmount(row, 'SELL', tradeLinkIndex)
  }

  if (row.journalType === JournalType.TRADING && row.side === 'SELL') {
    return getLinkedUsdAmount(row, 'BUY', tradeLinkIndex)
  }

  return null
}

/**
 * Computes the stablecoin average-cost rate used to derive BRL cost.
 * @param row - Transaction row to inspect
 * @param stablecoinAvgBeforeByOrder - BRL average price before each stablecoin row
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns BRL-per-stablecoin rate, or null when no automatic rate was used
 */
function computeBrlCostRate(
  row: CryptoComRow,
  stablecoinAvgBeforeByOrder: Map<number, number>,
  tradeLinkIndex: ReturnType<typeof buildTradeLinkIndex>,
): number | null {
  if (row.userBrlCost !== undefined) return null

  return getStablecoinFundedBrlCost(row, stablecoinAvgBeforeByOrder, tradeLinkIndex)?.rate ?? null
}

interface InstrumentComputation {
  rows: CryptoComRow[]
  costBasisRows: CryptoComRow[]
  runningBalances: number[]
  offchainBalances: number[]
  totalBalances: number[]
  brlResults: AvgPriceResult[]
  usdResults: AvgPriceResult[]
}

/**
 * Builds display text for a processed row, adding split labels for derived offchain deposits.
 * @param row - Derived transaction row being processed
 * @returns User-facing info text for the row
 */
function getProcessedInfo(row: CryptoComRow): string {
  const info = row.info || ''
  if (row.offchainSplitType === OffchainSplitType.RETURN) {
    return info ? `Return from External - ${info}` : 'Return from External'
  }
  if (row.offchainSplitType === OffchainSplitType.ACQUISITION) {
    return info ? `Offline Acquisition - ${info}` : 'Offline Acquisition'
  }
  return info
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
  const computations = new Map<string, InstrumentComputation>()
  const emptyStablecoinRates = new Map<number, number>()
  const stablecoinAvgBeforeByOrder = new Map<number, number>()

  for (const inst of instruments) {
    const instrumentRows = createOffchainSplitRows(normalizedRows.filter(r => r.instrument === inst))
    if (instrumentRows.length === 0) continue

    const runningBalances = calculateRunningBalances(instrumentRows)
    const offchainBalances = calculateOffchainBalances(instrumentRows)
    const totalBalances = calculateTotalBalances(runningBalances, offchainBalances)
    const costBasisRows = createCostBasisRows(instrumentRows)

    const initialBrlResults = calculateAveragePrices(
      costBasisRows,
      totalBalances,
      tradeIndex,
      tradeLinkIndex,
      {
        seedField: 'avgPriceSeed',
        getAcquisitionCost: (row, context) => getBrlAcquisitionCost(row, context, ptaxMap, emptyStablecoinRates),
      },
    )

    if (isUsdInstrument(inst)) {
      for (let i = 0; i < instrumentRows.length; i++) {
        const avgBefore = initialBrlResults[i].avgPriceBefore
        if (avgBefore !== null && avgBefore > 0) {
          stablecoinAvgBeforeByOrder.set(instrumentRows[i].sourceOrder ?? instrumentRows[i].order, avgBefore)
        }
      }
    }

    computations.set(inst, {
      rows: instrumentRows,
      costBasisRows,
      runningBalances,
      offchainBalances,
      totalBalances,
      brlResults: initialBrlResults,
      usdResults: [],
    })
  }

  for (const computation of computations.values()) {
    const brlResults = calculateAveragePrices(
      computation.costBasisRows,
      computation.totalBalances,
      tradeIndex,
      tradeLinkIndex,
      {
        seedField: 'avgPriceSeed',
        getAcquisitionCost: (row, context) => getBrlAcquisitionCost(row, context, ptaxMap, stablecoinAvgBeforeByOrder),
      },
    )
    const usdResults = calculateAveragePrices(
      computation.costBasisRows,
      computation.totalBalances,
      tradeIndex,
      tradeLinkIndex,
      {
        seedField: 'usdAvgPriceSeed',
        getAcquisitionCost: getUsdAcquisitionCost,
        keepInternalUsdCost: true,
      },
    )

    computation.brlResults = brlResults
    computation.usdResults = usdResults
  }

  for (const computation of computations.values()) {
    const instrumentRows = computation.rows

    for (let i = 0; i < instrumentRows.length; i++) {
      const row = instrumentRows[i]
      const sourceOrder = row.sourceOrder ?? row.order
      const balance = computation.runningBalances[i]
      const offchainBalance = computation.offchainBalances[i]
      const avgResult = computation.brlResults[i]
      const usdResult = computation.usdResults[i]
      const ptaxRate = lookupPtaxRate(row.eventDate, ptaxMap)
      const isStablecoinRow = isUsdInstrument(row.instrument)

      const canEditBrl = canEditBrlTransactionCost(row, tradeIndex, instrumentRows)
      const canEditUsd = canEditUsdTransactionCost(row, tradeIndex, instrumentRows)
      const brlTransactionCost = computeBrlTransactionCost(
        row,
        ptaxRate,
        tradeIndex,
        tradeLinkIndex,
        instrumentRows,
        stablecoinAvgBeforeByOrder,
        canEditBrl,
      )
      const usdTransactionCost = computeUsdTransactionCost(row, tradeIndex, tradeLinkIndex, instrumentRows, canEditUsd)
      const brlRunningBalance = avgResult.invested
      const usdRunningBalance = isStablecoinRow ? null : usdResult.invested
      const usdAveragePrice = isStablecoinRow ? null : usdResult.avgPrice
      const brlCostRate = computeBrlCostRate(row, stablecoinAvgBeforeByOrder, tradeLinkIndex)
      const profitLossAvgPrice = avgResult.avgPriceBefore ?? avgResult.avgPrice

      const profitLoss = calculateProfitLoss(
        row,
        profitLossAvgPrice,
        ptaxRate,
        tradeIndex,
        tradeLinkIndex,
        instrumentRows,
      )

      const originalRow = rawByOrder.get(sourceOrder)
      const originalInstrument = originalRow?.instrument || row.instrument
      const tradeLink = getTradeLinkMetadata(originalRow || row, tradeLinkIndex)
      const tradeFeeQuantity = getLinkedTradeFeeQuantity(originalRow || row, tradeLinkIndex)
      const netTransactionQuantity = getNetTransactionQuantity(row, tradeLinkIndex)
      const suppressCalculatedFields = isFoldedTradeFeeRow(originalRow || row, tradeLinkIndex)

      const processed: ProcessedRow = {
        id: `${row.order}-${row.instrument}-${row.offchainSplitType ?? 'base'}`,
        order: row.order,
        sourceOrder,
        timeUtc: row.timeUtc,
        eventDate: row.eventDate,
        journalType: row.journalType,
        instrument: row.instrument,
        originalInstrument,
        exchangeName: row.exchangeName || '',
        sourceFileName: row.sourceFileName || '',
        wallet: getWallet(originalRow || row),
        takerSide: row.takerSide,
        side: row.side,
        transactionQuantity: row.transactionQuantity,
        tradeFeeQuantity,
        netTransactionQuantity,
        transactionCost: row.transactionCost,
        runningBalance: balance,
        offchainBalance,
        cambioBC: ptaxRate,
        brlRunningBalance,
        brlTransactionCost,
        usdRunningBalance,
        usdTransactionCost: isStablecoinRow ? null : usdTransactionCost,
        usdAveragePrice,
        brlCostRate,
        precoMedioCompra: avgResult.avgPrice,
        totalLucroPrejuizo: profitLoss,
        info: getProcessedInfo(row),
        suppressCalculatedFields,
        isTradeLinked: tradeLink.isLinked,
        isLinkedTradeFee: tradeLink.isFee,
        tradeGroupId: tradeLink.groupId,
        tradeGroupSource: tradeLink.groupSource,
        tradeLinkSummary: tradeLink.summary,
        linkedFeeAmount: tradeLink.feeAmount,
        linkedFeeInstrument: tradeLink.feeInstrument,
        offchainSplitType: row.offchainSplitType ?? null,
        hasPtaxWarning: false,
        hasBalanceOverride: row.balanceOverride !== undefined,
        isEditable: {
          brlCost: canEditBrl,
          usdCost: canEditUsd,
          avgPrice: true,
          usdAvgPrice: !isStablecoinRow,
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
