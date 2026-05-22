import type { CryptoComRow } from '../types/transaction'
import { JournalType } from '../types/transaction'
import type { TradeLinkIndex, TradeMatchIndex } from './tradeMatching'
import { getLinkedTradeFeeQuantity, getNetTransactionQuantity, isFoldedTradeFeeRow } from './tradeMatching'
import { isMergedUsdInternalTrade } from './usdMerge'

export interface AvgPriceResult {
  avgPrice: number | null
  invested: number | null
  avgPriceBefore: number | null
  investedBefore: number | null
}

export interface AveragePriceContext {
  rowIndex: number
  rows: CryptoComRow[]
  runningBalances: number[]
  tradeIndex: TradeMatchIndex
  tradeLinkIndex: TradeLinkIndex
  balanceBefore: number
}

export interface AveragePriceOptions {
  seedField: 'avgPriceSeed' | 'usdAvgPriceSeed'
  getAcquisitionCost: (row: CryptoComRow, context: AveragePriceContext) => number | null
  keepInternalUsdCost?: boolean
}

/**
 * Checks whether a journal type removes holdings.
 * @param type - Journal type to inspect
 * @returns True when the row should remove proportional cost basis
 */
function isDisposition(type: JournalType): boolean {
  return (
    type === JournalType.OFFCHAIN_WITHDRAWAL ||
    type === JournalType.ONCHAIN_WITHDRAWAL ||
    type === JournalType.TRADE_FEE ||
    type === JournalType.CRYPTO_DUSTING
  )
}

/**
 * Gets the absolute quantity used for fee-aware cost-basis movement.
 * @param row - Transaction row to inspect
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Absolute net quantity after same-instrument linked trade fees
 */
function getCostBasisQuantity(row: CryptoComRow, tradeLinkIndex: TradeLinkIndex): number {
  return Math.abs(getNetTransactionQuantity(row, tradeLinkIndex))
}

/**
 * Checks whether a row increases holdings and needs a known acquisition cost.
 * @param row - Transaction row to inspect
 * @returns True if the row should add invested value when cost is known
 */
function isCostedAcquisition(row: CryptoComRow): boolean {
  return (
    (row.journalType === JournalType.TRADING && row.side === 'BUY') ||
    row.journalType === JournalType.OFFCHAIN_DEPOSIT ||
    row.journalType === JournalType.ONCHAIN_DEPOSIT
  )
}

/**
 * Gets the running balance before a row.
 * @param rows - Instrument rows being processed
 * @param runningBalances - Raw running balances after each row
 * @param index - Row index to inspect
 * @returns Balance before the indexed row
 */
function getBalanceBefore(rows: CryptoComRow[], runningBalances: number[], index: number): number {
  return index > 0 ? runningBalances[index - 1] : runningBalances[0] - rows[0].transactionQuantity
}

/**
 * Gets the balance to use when deriving an average price after a row.
 * @param row - Transaction row to inspect
 * @param runningBalance - Raw running balance after the row
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Running balance adjusted for a same-instrument fee folded into the row
 */
function getCostBasisBalanceAfter(
  row: CryptoComRow,
  runningBalance: number,
  tradeLinkIndex: TradeLinkIndex,
): number {
  if (row.journalType !== JournalType.TRADING) return runningBalance
  return runningBalance - getLinkedTradeFeeQuantity(row, tradeLinkIndex)
}

/**
 * Builds the callback context for a row cost lookup.
 * @param rowIndex - Row index being processed
 * @param rows - Instrument rows being processed
 * @param runningBalances - Raw running balances after each row
 * @param tradeIndex - Trade match index built from original rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Context object for cost provider callbacks
 */
function buildCostContext(
  rowIndex: number,
  rows: CryptoComRow[],
  runningBalances: number[],
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
): AveragePriceContext {
  return {
    rowIndex,
    rows,
    runningBalances,
    tradeIndex,
    tradeLinkIndex,
    balanceBefore: getBalanceBefore(rows, runningBalances, rowIndex),
  }
}

/**
 * Reads the configured average-price seed from a row.
 * @param row - Transaction row to inspect
 * @param options - Average price options with the seed field name
 * @returns Seed value, or undefined when no seed exists
 */
function getSeed(row: CryptoComRow, options: AveragePriceOptions): number | undefined {
  return row[options.seedField]
}

/**
 * Builds a result object from before/after cost-basis state.
 * @param invested - Invested amount after the row
 * @param investedBefore - Invested amount before the row
 * @param balanceBefore - Balance before the row
 * @param balanceAfter - Cost-basis balance after the row
 * @returns Average price result for one row
 */
function makeResult(
  invested: number | null,
  investedBefore: number | null,
  balanceBefore: number,
  balanceAfter: number,
): AvgPriceResult {
  const avgPrice = invested !== null && balanceAfter > 0 ? invested / balanceAfter : null
  const avgPriceBefore = investedBefore !== null && balanceBefore > 0 ? investedBefore / balanceBefore : null
  return {
    avgPrice,
    invested,
    avgPriceBefore,
    investedBefore,
  }
}

/**
 * Computes the invested value after applying one row.
 * @param row - Transaction row being applied
 * @param rowIndex - Index of the row being applied
 * @param investedBefore - Invested value before the row
 * @param rows - Instrument rows being processed
 * @param runningBalances - Raw running balances after each row
 * @param tradeIndex - Trade match index built from original rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @param options - Currency-specific average price options
 * @returns Invested value after applying the row
 */
function forwardStep(
  row: CryptoComRow,
  rowIndex: number,
  investedBefore: number,
  rows: CryptoComRow[],
  runningBalances: number[],
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
  options: AveragePriceOptions,
): number {
  if (isFoldedTradeFeeRow(row, tradeLinkIndex)) return investedBefore

  const balanceBefore = getBalanceBefore(rows, runningBalances, rowIndex)
  const absQty = getCostBasisQuantity(row, tradeLinkIndex)
  const avgBefore = balanceBefore > 0 ? investedBefore / balanceBefore : null

  if (row.journalType === JournalType.TRADING) {
    if (row.side === 'BUY') {
      if (!options.keepInternalUsdCost && isMergedUsdInternalTrade(row, tradeIndex, rows)) {
        return avgBefore !== null ? investedBefore + avgBefore * absQty : investedBefore
      }

      const cost = options.getAcquisitionCost(row, buildCostContext(rowIndex, rows, runningBalances, tradeIndex, tradeLinkIndex))
      return cost !== null ? investedBefore + cost : investedBefore
    } else if (row.side === 'SELL') {
      return avgBefore !== null ? investedBefore - avgBefore * absQty : investedBefore
    }
  } else if (
    row.journalType === JournalType.OFFCHAIN_DEPOSIT ||
    row.journalType === JournalType.ONCHAIN_DEPOSIT
  ) {
    const cost = options.getAcquisitionCost(row, buildCostContext(rowIndex, rows, runningBalances, tradeIndex, tradeLinkIndex))
    return cost !== null ? investedBefore + cost : investedBefore
  } else if (row.journalType === JournalType.SOFT_STAKE_REWARD) {
    return investedBefore
  } else if (isDisposition(row.journalType)) {
    return avgBefore !== null ? investedBefore - avgBefore * absQty : investedBefore
  }

  return investedBefore
}

/**
 * Computes the invested value before a row when walking backward from an anchor.
 * @param row - Transaction row being reversed
 * @param rowIndex - Index of the row being reversed
 * @param investedAfter - Invested value after the row
 * @param rows - Instrument rows being processed
 * @param runningBalances - Raw running balances after each row
 * @param tradeIndex - Trade match index built from original rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @param options - Currency-specific average price options
 * @returns Invested value before the row, or null when it cannot be derived
 */
function reverseStep(
  row: CryptoComRow,
  rowIndex: number,
  investedAfter: number,
  rows: CryptoComRow[],
  runningBalances: number[],
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
  options: AveragePriceOptions,
): number | null {
  if (isFoldedTradeFeeRow(row, tradeLinkIndex)) return investedAfter

  const balanceBefore = getBalanceBefore(rows, runningBalances, rowIndex)
  const balanceAfter = getCostBasisBalanceAfter(row, runningBalances[rowIndex], tradeLinkIndex)
  const feeQuantity = getLinkedTradeFeeQuantity(row, tradeLinkIndex)
  const absQty = getCostBasisQuantity(row, tradeLinkIndex)

  if (row.journalType === JournalType.TRADING) {
    if (row.side === 'BUY') {
      if (!options.keepInternalUsdCost && isMergedUsdInternalTrade(row, tradeIndex, rows)) {
        if (balanceAfter === 0) return null
        return investedAfter * balanceBefore / balanceAfter
      }

      const cost = options.getAcquisitionCost(row, buildCostContext(rowIndex, rows, runningBalances, tradeIndex, tradeLinkIndex))
      return cost !== null ? investedAfter - cost : investedAfter
    } else if (row.side === 'SELL') {
      if (feeQuantity > 0) {
        const balanceAfterNetDisposition = balanceBefore - absQty
        if (balanceAfterNetDisposition === 0) return null
        return investedAfter * balanceBefore / balanceAfterNetDisposition
      }
      if (balanceAfter === 0) return null
      return investedAfter * balanceBefore / balanceAfter
    }
  } else if (
    row.journalType === JournalType.OFFCHAIN_DEPOSIT ||
    row.journalType === JournalType.ONCHAIN_DEPOSIT
  ) {
    const cost = options.getAcquisitionCost(row, buildCostContext(rowIndex, rows, runningBalances, tradeIndex, tradeLinkIndex))
    return cost !== null ? investedAfter - cost : investedAfter
  } else if (row.journalType === JournalType.SOFT_STAKE_REWARD) {
    return investedAfter
  } else if (isDisposition(row.journalType)) {
    if (balanceAfter === 0) return null
    return investedAfter * balanceBefore / balanceAfter
  }

  return investedAfter
}

/**
 * Calculates average prices forward from available transaction costs.
 * @param rows - Transaction rows for one instrument
 * @param runningBalances - Raw running balances after each row
 * @param tradeIndex - Trade match index built from original rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @param options - Currency-specific average price options
 * @returns Average price results derived from known acquisition costs
 */
function calculateAveragePricesFromCosts(
  rows: CryptoComRow[],
  runningBalances: number[],
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
  options: AveragePriceOptions,
): AvgPriceResult[] {
  let invested: number | null = 0

  return rows.map((row, i) => {
    const balanceBefore = getBalanceBefore(rows, runningBalances, i)
    const balanceAfter = getCostBasisBalanceAfter(row, runningBalances[i], tradeLinkIndex)
    const investedBefore = invested
    const cost = options.getAcquisitionCost(row, buildCostContext(i, rows, runningBalances, tradeIndex, tradeLinkIndex))

    if (invested === null) {
      if (balanceBefore <= 0 && isCostedAcquisition(row) && cost !== null) {
        invested = forwardStep(row, i, 0, rows, runningBalances, tradeIndex, tradeLinkIndex, options)
      }
      return makeResult(invested, investedBefore, balanceBefore, balanceAfter)
    }

    if (
      isCostedAcquisition(row) &&
      cost === null &&
      !isMergedUsdInternalTrade(row, tradeIndex, rows)
    ) {
      invested = null
      return makeResult(invested, investedBefore, balanceBefore, balanceAfter)
    }

    invested = forwardStep(row, i, invested, rows, runningBalances, tradeIndex, tradeLinkIndex, options)
    return makeResult(invested, investedBefore, balanceBefore, balanceAfter)
  })
}

/**
 * Calculates average prices using anchor-point seeds that propagate both directions.
 * If no seed exists, known transaction costs are used as the cost basis.
 * @param rows - Transaction rows for one instrument
 * @param runningBalances - Raw running balances after each row
 * @param tradeIndex - Trade match index built from original rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @param options - Currency-specific average price options
 * @returns Average price and invested value after each row
 */
export function calculateAveragePrices(
  rows: CryptoComRow[],
  runningBalances: number[],
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
  options: AveragePriceOptions,
): AvgPriceResult[] {
  const n = rows.length
  if (n === 0) return []

  const results = new Array<AvgPriceResult>(n)

  const seedIndices: number[] = []
  for (let i = 0; i < n; i++) {
    if (getSeed(rows[i], options) !== undefined) {
      seedIndices.push(i)
    }
  }

  if (seedIndices.length === 0) {
    return calculateAveragePricesFromCosts(rows, runningBalances, tradeIndex, tradeLinkIndex, options)
  }

  const firstIdx = seedIndices[0]
  const firstSeed = getSeed(rows[firstIdx], options)!
  const firstBalanceAfter = getCostBasisBalanceAfter(rows[firstIdx], runningBalances[firstIdx], tradeLinkIndex)
  let invested: number | null = firstSeed * firstBalanceAfter
  results[firstIdx] = makeResult(
    invested,
    null,
    getBalanceBefore(rows, runningBalances, firstIdx),
    firstBalanceAfter,
  )

  for (let i = firstIdx - 1; i >= 0; i--) {
    if (invested !== null) {
      invested = reverseStep(rows[i + 1], i + 1, invested, rows, runningBalances, tradeIndex, tradeLinkIndex, options)
    }
    results[i] = makeResult(
      invested,
      null,
      getBalanceBefore(rows, runningBalances, i),
      getCostBasisBalanceAfter(rows[i], runningBalances[i], tradeLinkIndex),
    )
  }

  for (let seg = 0; seg < seedIndices.length; seg++) {
    const idx = seedIndices[seg]
    const seed = getSeed(rows[idx], options)!
    const balanceAfter = getCostBasisBalanceAfter(rows[idx], runningBalances[idx], tradeLinkIndex)
    let investedAfterSeed: number = seed * balanceAfter
    results[idx] = makeResult(
      investedAfterSeed,
      null,
      getBalanceBefore(rows, runningBalances, idx),
      balanceAfter,
    )

    const segEnd = seg < seedIndices.length - 1 ? seedIndices[seg + 1] : n
    for (let i = idx + 1; i < segEnd; i++) {
      const investedBefore = investedAfterSeed
      investedAfterSeed = forwardStep(rows[i], i, investedAfterSeed, rows, runningBalances, tradeIndex, tradeLinkIndex, options)
      results[i] = makeResult(
        investedAfterSeed,
        investedBefore,
        getBalanceBefore(rows, runningBalances, i),
        getCostBasisBalanceAfter(rows[i], runningBalances[i], tradeLinkIndex),
      )
    }
  }

  return results
}
