import type { CryptoComRow } from '../types/transaction'
import { JournalType } from '../types/transaction'
import type { PtaxMap } from '../types/ptax'
import type { TradeLinkIndex, TradeMatchIndex } from './tradeMatching'
import { findLinkedTradingPair, getLinkedTradeFeeQuantity, getNetTransactionQuantity, isFoldedTradeFeeRow } from './tradeMatching'
import { lookupPtaxRate } from './ptaxLookup'
import { isMergedUsdInternalTrade, isUsdInstrument } from './usdMerge'

export interface AvgPriceResult {
  avgPrice: number | null
  brlInvested: number | null
}

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
 * Checks whether a row increases holdings and needs a BRL cost basis.
 * @param row - Transaction row to inspect
 * @returns True if the row should add BRL invested value when cost is known
 */
function isCostedAcquisition(row: CryptoComRow): boolean {
  return (
    (row.journalType === JournalType.TRADING && row.side === 'BUY') ||
    row.journalType === JournalType.OFFCHAIN_DEPOSIT ||
    row.journalType === JournalType.ONCHAIN_DEPOSIT
  )
}

/**
 * Gets the BRL cost for a trading BUY row.
 * Stablecoin buys linked to non-USD sells use PTAX net acquisition cost.
 * @param row - Trading BUY row
 * @param ptaxMap - PTAX date-to-rate map
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Manual or linked stablecoin BRL cost, or null when no value exists
 */
function getTradingBuyBrlCost(
  row: CryptoComRow,
  ptaxMap: PtaxMap,
  tradeLinkIndex: TradeLinkIndex,
): number | null {
  if (row.userBrlCost !== undefined) return row.userBrlCost

  if (!isUsdInstrument(row.instrument)) return null

  const paired = findLinkedTradingPair(row, tradeLinkIndex)
  if (!paired || paired.side !== 'SELL' || isUsdInstrument(paired.instrument)) return null

  const ptaxRate = lookupPtaxRate(row.eventDate, ptaxMap)
  if (ptaxRate === null) return null

  return getCostBasisQuantity(row, tradeLinkIndex) * ptaxRate
}

/**
 * Gets the BRL cost for a row, reading userBrlCost from the row itself.
 * @param row - Transaction row
 * @param ptaxMap - PTAX date-to-rate map
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns BRL cost, or null when no value exists
 */
function getRowCost(
  row: CryptoComRow,
  ptaxMap: PtaxMap,
  tradeLinkIndex: TradeLinkIndex,
): number | null {
  if (row.journalType === JournalType.TRADING && row.side === 'BUY') {
    return getTradingBuyBrlCost(row, ptaxMap, tradeLinkIndex)
  }

  if (
    row.journalType === JournalType.OFFCHAIN_DEPOSIT ||
    row.journalType === JournalType.ONCHAIN_DEPOSIT
  ) {
    if (row.userBrlCost !== undefined) return row.userBrlCost
    return null
  }

  return null
}

/**
 * Forward step: compute brlInvested after row i, given brlInvested before row i.
 * @param row - Transaction row being applied
 * @param brlBefore - BRL invested before the row
 * @param balBefore - Instrument balance before the row
 * @param tradeIndex - Trade match index built from original rows
 * @param ptaxMap - PTAX date-to-rate map
 * @param tradeLinkIndex - Fee-aware trade link index
 * @param rows - Normalized rows for this instrument
 * @returns BRL invested after applying the row
 */
function forwardStep(
  row: CryptoComRow,
  brlBefore: number,
  balBefore: number,
  tradeIndex: TradeMatchIndex,
  ptaxMap: PtaxMap,
  tradeLinkIndex: TradeLinkIndex,
  rows: CryptoComRow[],
): number {
  if (isFoldedTradeFeeRow(row, tradeLinkIndex)) return brlBefore

  const absQty = getCostBasisQuantity(row, tradeLinkIndex)
  const avgBefore = balBefore > 0 ? brlBefore / balBefore : null

  if (row.journalType === JournalType.TRADING) {
    if (row.side === 'BUY') {
      if (isMergedUsdInternalTrade(row, tradeIndex, rows)) {
        return avgBefore !== null ? brlBefore + avgBefore * absQty : brlBefore
      }

      const cost = getRowCost(row, ptaxMap, tradeLinkIndex)
      return cost !== null ? brlBefore + cost : brlBefore
    } else if (row.side === 'SELL') {
      return avgBefore !== null ? brlBefore - avgBefore * absQty : brlBefore
    }
  } else if (
    row.journalType === JournalType.OFFCHAIN_DEPOSIT ||
    row.journalType === JournalType.ONCHAIN_DEPOSIT
  ) {
    const cost = getRowCost(row, ptaxMap, tradeLinkIndex)
    return cost !== null ? brlBefore + cost : brlBefore
  } else if (row.journalType === JournalType.SOFT_STAKE_REWARD) {
    return brlBefore
  } else if (isDisposition(row.journalType)) {
    return avgBefore !== null ? brlBefore - avgBefore * absQty : brlBefore
  }

  return brlBefore
}

/**
 * Reverse step: compute brlInvested before a row, given brlInvested after it.
 * @param row - Transaction row being reversed
 * @param brlAfter - BRL invested after the row
 * @param balBefore - Instrument balance before the row
 * @param balAfter - Instrument balance after the row
 * @param tradeIndex - Trade match index built from original rows
 * @param ptaxMap - PTAX date-to-rate map
 * @param tradeLinkIndex - Fee-aware trade link index
 * @param rows - Normalized rows for this instrument
 * @returns BRL invested before the row, or null when it cannot be derived
 */
function reverseStep(
  row: CryptoComRow,
  brlAfter: number,
  balBefore: number,
  balAfter: number,
  tradeIndex: TradeMatchIndex,
  ptaxMap: PtaxMap,
  tradeLinkIndex: TradeLinkIndex,
  rows: CryptoComRow[],
): number | null {
  if (isFoldedTradeFeeRow(row, tradeLinkIndex)) return brlAfter

  const feeQuantity = getLinkedTradeFeeQuantity(row, tradeLinkIndex)
  const absQty = getCostBasisQuantity(row, tradeLinkIndex)

  if (row.journalType === JournalType.TRADING) {
    if (row.side === 'BUY') {
      if (isMergedUsdInternalTrade(row, tradeIndex, rows)) {
        if (balAfter === 0) return null
        return brlAfter * balBefore / balAfter
      }

      const cost = getRowCost(row, ptaxMap, tradeLinkIndex)
      return cost !== null ? brlAfter - cost : brlAfter
    } else if (row.side === 'SELL') {
      if (feeQuantity > 0) {
        const balanceAfterNetDisposition = balBefore - absQty
        if (balanceAfterNetDisposition === 0) return null
        return brlAfter * balBefore / balanceAfterNetDisposition
      }
      if (balAfter === 0) return null
      return brlAfter * balBefore / balAfter
    }
  } else if (
    row.journalType === JournalType.OFFCHAIN_DEPOSIT ||
    row.journalType === JournalType.ONCHAIN_DEPOSIT
  ) {
    const cost = getRowCost(row, ptaxMap, tradeLinkIndex)
    return cost !== null ? brlAfter - cost : brlAfter
  } else if (row.journalType === JournalType.SOFT_STAKE_REWARD) {
    return brlAfter
  } else if (isDisposition(row.journalType)) {
    if (balAfter === 0) return null
    return brlAfter * balBefore / balAfter
  }

  return brlAfter
}

/**
 * Calculates average prices forward from available transaction costs.
 * @param rows - Transaction rows for one instrument
 * @param runningBalances - Running balance after each row
 * @param ptaxMap - PTAX date-to-rate map
 * @param tradeIndex - Trade match index built from original rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Average price results derived from known acquisition costs
 */
function calculateAveragePricesFromCosts(
  rows: CryptoComRow[],
  runningBalances: number[],
  ptaxMap: PtaxMap,
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
): AvgPriceResult[] {
  let brlInv: number | null = 0

  function balBefore(i: number): number {
    return i > 0 ? runningBalances[i - 1] : runningBalances[0] - rows[0].transactionQuantity
  }

  function makeResult(brl: number | null, i: number): AvgPriceResult {
    const avg = brl !== null && runningBalances[i] > 0 ? brl / runningBalances[i] : null
    return { avgPrice: avg, brlInvested: brl }
  }

  return rows.map((row, i) => {
    const cost = getRowCost(row, ptaxMap, tradeLinkIndex)
    const beforeBalance = balBefore(i)

    if (brlInv === null) {
      if (beforeBalance <= 0 && isCostedAcquisition(row) && cost !== null) {
        brlInv = forwardStep(row, 0, beforeBalance, tradeIndex, ptaxMap, tradeLinkIndex, rows)
      }
      return makeResult(brlInv, i)
    }

    if (
      isCostedAcquisition(row) &&
      cost === null &&
      !isMergedUsdInternalTrade(row, tradeIndex, rows)
    ) {
      brlInv = null
      return makeResult(brlInv, i)
    }

    brlInv = forwardStep(row, brlInv, beforeBalance, tradeIndex, ptaxMap, tradeLinkIndex, rows)
    return makeResult(brlInv, i)
  })
}

/**
 * Calculates average prices using anchor-point seeds that propagate both directions.
 * Seeds are read directly from each row's avgPriceSeed field.
 * If no seed exists, known transaction costs are used as the cost basis.
 * @param rows - Transaction rows for one instrument
 * @param runningBalances - Running balance after each row
 * @param ptaxMap - PTAX date-to-rate map
 * @param tradeIndex - Trade match index built from original rows
 * @param tradeLinkIndex - Fee-aware trade link index
 * @returns Average price and BRL invested after each row
 */
export function calculateAveragePrices(
  rows: CryptoComRow[],
  runningBalances: number[],
  ptaxMap: PtaxMap,
  tradeIndex: TradeMatchIndex,
  tradeLinkIndex: TradeLinkIndex,
): AvgPriceResult[] {
  const n = rows.length
  if (n === 0) return []

  const results = new Array<AvgPriceResult>(n)

  const seedIndices: number[] = []
  for (let i = 0; i < n; i++) {
    if (rows[i].avgPriceSeed !== undefined) {
      seedIndices.push(i)
    }
  }

  if (seedIndices.length === 0) {
    return calculateAveragePricesFromCosts(rows, runningBalances, ptaxMap, tradeIndex, tradeLinkIndex)
  }

  function balBefore(i: number): number {
    return i > 0 ? runningBalances[i - 1] : runningBalances[0] - rows[0].transactionQuantity
  }

  function makeResult(brl: number | null, i: number): AvgPriceResult {
    const avg = brl !== null && runningBalances[i] > 0 ? brl / runningBalances[i] : null
    return { avgPrice: avg, brlInvested: brl }
  }

  // Back-calculate from first seed to start
  const firstIdx = seedIndices[0]
  const firstSeed = rows[firstIdx].avgPriceSeed!
  let brl: number | null = firstSeed * runningBalances[firstIdx]
  results[firstIdx] = makeResult(brl, firstIdx)

  for (let i = firstIdx - 1; i >= 0; i--) {
    if (brl !== null) {
      brl = reverseStep(
        rows[i + 1],
        brl,
        balBefore(i + 1),
        runningBalances[i + 1],
        tradeIndex,
        ptaxMap,
        tradeLinkIndex,
        rows,
      )
    }
    results[i] = makeResult(brl, i)
  }

  // Forward-calculate from each seed to next seed (or end)
  for (let seg = 0; seg < seedIndices.length; seg++) {
    const idx = seedIndices[seg]
    const seed = rows[idx].avgPriceSeed!
    let brlInv: number = seed * runningBalances[idx]
    results[idx] = makeResult(brlInv, idx)

    const segEnd = seg < seedIndices.length - 1 ? seedIndices[seg + 1] : n
    for (let i = idx + 1; i < segEnd; i++) {
      brlInv = forwardStep(rows[i], brlInv, balBefore(i), tradeIndex, ptaxMap, tradeLinkIndex, rows)
      results[i] = makeResult(brlInv, i)
    }
  }

  return results
}
