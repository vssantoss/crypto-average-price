import { useMemo } from 'react'
import { useAppStore } from './useAppStore'
import type { ProcessedRow } from '../types/transaction'
import type { CoinSummary } from '../types/app'
import { computeAllColumns } from '../engine/computeAllColumns'
import { isUsdInstrument } from '../engine/usdMerge'

interface AppComputedData {
  processedRows: ProcessedRow[]
  allProcessedRows: ProcessedRow[]
  coinSummaries: CoinSummary[]
  ptaxWarnings: string[]
  diagnostics: string[]
}

/**
 * Checks whether a row has positive holdings but missing BRL cost basis.
 * @param row - Processed row to inspect
 * @returns True when BRL average price cannot be calculated for a positive balance
 */
function isMissingBrlCostBasis(row: ProcessedRow): boolean {
  return row.runningBalance > 0 && row.precoMedioCompra === null
}

/**
 * Checks whether a row has positive non-stablecoin holdings but missing USD cost basis.
 * @param row - Processed row to inspect
 * @returns True when USD average price cannot be calculated for a positive non-stablecoin balance
 */
function isMissingUsdCostBasis(row: ProcessedRow): boolean {
  return !isUsdInstrument(row.instrument) && row.runningBalance > 0 && row.usdAveragePrice === null
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

  return messages
}

/**
 * Builds latest summary values for each instrument from already-computed rows.
 * @param rows - Processed rows for all instruments, sorted by transaction order
 * @returns One summary per instrument using each instrument's last processed row
 */
function buildCoinSummaries(rows: ProcessedRow[]): CoinSummary[] {
  const summaryByInstrument = new Map<string, CoinSummary>()

  for (const row of rows) {
    if (row.suppressCalculatedFields) continue

    summaryByInstrument.set(row.instrument, {
      instrument: row.instrument,
      currentBalance: row.runningBalance,
      averagePrice: row.precoMedioCompra,
      totalBrlInvested: null,
      brlBalance: row.brlRunningBalance,
    })
  }

  return Array.from(summaryByInstrument.values()).sort((a, b) => a.instrument.localeCompare(b.instrument))
}

/**
 * Hook that returns the app's main computed data using one all-rows calculation.
 * @returns Processed rows, all processed rows, coin summaries, PTAX warnings, and diagnostics
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
    const coinSummaries = buildCoinSummaries(allProcessedRows)
    const diagnostics = buildDiagnostics(rawTransactions, allProcessedRows)

    return {
      processedRows,
      allProcessedRows,
      coinSummaries,
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
