import { useMemo } from 'react'
import { useAppStore } from './useAppStore'
import type { ProcessedRow } from '../types/transaction'
import { JournalType } from '../types/transaction'
import { computeAllColumns } from '../engine/computeAllColumns'
import { isUsdInstrument } from '../engine/usdMerge'

interface AppComputedData {
  processedRows: ProcessedRow[]
  allProcessedRows: ProcessedRow[]
  ptaxWarnings: string[]
  diagnostics: string[]
}

const BALANCE_TOLERANCE = 0.001

/**
 * Gets total holdings represented by trading plus external balances.
 * @param row - Processed row to inspect
 * @returns Total quantity still held for cost-basis purposes
 */
function getTotalHoldings(row: ProcessedRow): number {
  return row.runningBalance + row.offchainBalance
}

/**
 * Checks whether a row has positive holdings but missing BRL cost basis.
 * @param row - Processed row to inspect
 * @returns True when BRL average price cannot be calculated for a positive balance
 */
function isMissingBrlCostBasis(row: ProcessedRow): boolean {
  return getTotalHoldings(row) > 0 && row.precoMedioCompra === null
}

/**
 * Checks whether a row has positive non-stablecoin holdings but missing USD cost basis.
 * @param row - Processed row to inspect
 * @returns True when USD average price cannot be calculated for a positive non-stablecoin balance
 */
function isMissingUsdCostBasis(row: ProcessedRow): boolean {
  return !isUsdInstrument(row.instrument) && getTotalHoldings(row) > 0 && row.usdAveragePrice === null
}

/**
 * Builds a message that tells the user where to add the missing currency basis.
 * @param row - First row where the missing basis appears
 * @param currency - Currency whose average price is missing
 * @returns User-facing action-needed message
 */
function formatMissingCostBasisMessage(row: ProcessedRow, currency: 'BRL' | 'USD'): string {
  const costColumn = currency === 'BRL' ? 'BRL Tx Cost' : 'USD Tx Cost'
  return `${row.instrument} ${currency} Avg Price is missing at ${row.timeUtc}. Set a ${currency} Avg Price seed on that row, or enter the missing ${costColumn} before that point.`
}

/**
 * Builds first-occurrence diagnostics for missing BRL and USD cost basis.
 * @param rows - Calculated rows with suppressed rows already filtered out
 * @returns User-facing diagnostics for missing cost basis by instrument and currency
 */
function buildMissingCostBasisDiagnostics(rows: ProcessedRow[]): string[] {
  const messages: string[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (isMissingBrlCostBasis(row)) {
      const key = `${row.instrument}:BRL`
      if (!seen.has(key)) {
        messages.push(formatMissingCostBasisMessage(row, 'BRL'))
        seen.add(key)
      }
    }

    if (isMissingUsdCostBasis(row)) {
      const key = `${row.instrument}:USD`
      if (!seen.has(key)) {
        messages.push(formatMissingCostBasisMessage(row, 'USD'))
        seen.add(key)
      }
    }
  }

  return messages
}

/**
 * Builds diagnostics for positive or negative external balances.
 * @param rows - Calculated rows with suppressed rows already filtered out
 * @returns User-facing diagnostics for external balance issues
 */
function buildOffchainBalanceDiagnostics(rows: ProcessedRow[]): string[] {
  const messages: string[] = []
  const latestByInstrument = new Map<string, ProcessedRow>()

  for (const row of rows) {
    latestByInstrument.set(row.instrument, row)

    if (row.offchainBalance < -BALANCE_TOLERANCE) {
      messages.push(`${row.instrument} External Balance is negative at ${row.timeUtc}. Check whether an OFFCHAIN SALE quantity is too high or an OFFCHAIN WITHDRAWAL transfer is missing.`)
      break
    }
  }

  for (const row of latestByInstrument.values()) {
    if (row.offchainBalance > BALANCE_TOLERANCE) {
      messages.push(`${row.instrument} has ${row.offchainBalance.toFixed(8)} on External Balance. Create OFFCHAIN SALE rows with BRL proceeds for coins already sold outside the Trading Wallet so profit/loss can be calculated.`)
    }
  }

  return messages
}

/**
 * Builds diagnostic messages from raw and processed transaction data.
 * @param rawTransactions - Raw transaction rows from the store
 * @param allProcessedRows - Computed rows for all instruments
 * @returns User-facing diagnostic messages
 */
function buildDiagnostics(
  rawTransactions: ReturnType<typeof useAppStore.getState>['rawTransactions'],
  allProcessedRows: ProcessedRow[],
): string[] {
  if (rawTransactions.length === 0) return []

  const messages: string[] = []
  const calculatedRows = allProcessedRows.filter(row => !row.suppressCalculatedFields)

  messages.push(...buildMissingCostBasisDiagnostics(calculatedRows))
  messages.push(...buildOffchainBalanceDiagnostics(calculatedRows))

  const hasAnyBalanceOverride = rawTransactions.some(r => r.balanceOverride !== undefined)
  if (!hasAnyBalanceOverride) {
    const firstNegativeRow = calculatedRows.find(row => row.runningBalance < -0.001)
    if (firstNegativeRow) {
      messages.push(`Negative running balance detected for ${firstNegativeRow.instrument} at ${firstNegativeRow.timeUtc}. This usually means the imported data doesn't include all transactions. Set a Running Balance override on that row or import the missing earlier transactions.`)
    }
  }

  const depositsWithoutCost = rawTransactions.filter(
    r => (r.journalType === 'OFFCHAIN_DEPOSIT' || r.journalType === 'ONCHAIN_DEPOSIT') && r.userBrlCost === undefined
  )
  if (depositsWithoutCost.length > 0) {
    const firstDeposit = depositsWithoutCost[0]
    messages.push(`${depositsWithoutCost.length} deposit${depositsWithoutCost.length > 1 ? 's' : ''} without BRL cost. First missing row: ${firstDeposit.instrument} at ${firstDeposit.timeUtc}. Edit the BRL Tx Cost column on deposit rows to include the actual BRL amount paid.`)
  }

  const offchainSalesWithoutProceeds = rawTransactions.filter(
    r => r.journalType === JournalType.OFFCHAIN_SALE && r.userBrlCost === undefined
  )
  if (offchainSalesWithoutProceeds.length > 0) {
    const firstSale = offchainSalesWithoutProceeds[0]
    messages.push(`${offchainSalesWithoutProceeds.length} OFFCHAIN SALE row${offchainSalesWithoutProceeds.length > 1 ? 's are' : ' is'} missing BRL proceeds. First missing row: ${firstSale.instrument} at ${firstSale.timeUtc}. Edit the BRL Tx Cost column with the BRL amount received outside the Trading Wallet.`)
  }

  return messages
}

/**
 * Hook that returns the app's main computed data using one all-rows calculation.
 * @returns Processed rows, all processed rows, PTAX warnings, and diagnostics
 */
export function useAppComputedData(): AppComputedData {
  const rawTransactions = useAppStore(s => s.rawTransactions)
  const ptaxMap = useAppStore(s => s.ptaxMap)
  const usdMergeEnabled = useAppStore(s => s.settings.usdMergeEnabled)

  return useMemo(() => {
    const allProcessedRows = rawTransactions.length === 0
      ? []
      : computeAllColumns(rawTransactions, ptaxMap, usdMergeEnabled, null)
    const processedRows = allProcessedRows
    const diagnostics = buildDiagnostics(rawTransactions, allProcessedRows)

    return {
      processedRows,
      allProcessedRows,
      ptaxWarnings: [],
      diagnostics,
    }
  }, [rawTransactions, ptaxMap, usdMergeEnabled])
}

/**
 * Hook that returns the list of exchange names already present in the dataset.
 * @returns Sorted array of unique exchange names
 */
export function useExchangeList(): string[] {
  const rawTransactions = useAppStore(s => s.rawTransactions)

  return useMemo(() => {
    const exchanges = rawTransactions
      .map(row => row.exchangeName?.trim())
      .filter((exchange): exchange is string => !!exchange)
    return Array.from(new Set(exchanges)).sort()
  }, [rawTransactions])
}

/**
 * Hook that returns the list of instrument names already present in the dataset.
 * @returns Sorted array of unique instrument names
 */
export function useInstrumentList(): string[] {
  const rawTransactions = useAppStore(s => s.rawTransactions)

  return useMemo(() => {
    const instruments = rawTransactions
      .map(row => row.instrument.trim())
      .filter(Boolean)
    return Array.from(new Set(instruments)).sort()
  }, [rawTransactions])
}
