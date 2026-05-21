import { useMemo } from 'react'
import { useAppStore } from './useAppStore'
import type { ProcessedRow } from '../types/transaction'
import type { CoinSummary } from '../types/app'
import { computeAllColumns } from '../engine/computeAllColumns'

interface AppComputedData {
  processedRows: ProcessedRow[]
  allProcessedRows: ProcessedRow[]
  coinSummaries: CoinSummary[]
  ptaxWarnings: string[]
  diagnostics: string[]
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

  const instruments = Array.from(new Set(calculatedRows.map(row => row.instrument))).sort()
  const instrumentsWithoutAvgPrice = instruments.filter(inst => {
    const rows = calculatedRows.filter(r => r.instrument === inst)
    return rows.length > 0 && rows.every(r => r.precoMedioCompra === null)
  })

  if (instruments.length > 0 && instrumentsWithoutAvgPrice.length === instruments.length) {
    messages.push('No BRL Avg Price can be calculated yet. Edit BRL Tx Cost on deposit rows, import PTAX rates for trade costs, or set a BRL Avg Price seed on a row.')
  } else if (instrumentsWithoutAvgPrice.length > 0) {
    messages.push(`The following coins have no BRL Avg Price calculation yet: ${instrumentsWithoutAvgPrice.join(', ')}. Add deposit BRL costs, import PTAX rates, or set an avg price seed for those coins.`)
  }

  const hasAnyBalanceOverride = rawTransactions.some(r => r.balanceOverride !== undefined)
  if (!hasAnyBalanceOverride) {
    const negativeInstruments = instruments.filter(inst => {
      const rows = calculatedRows.filter(r => r.instrument === inst)
      return rows.some(r => r.runningBalance < -0.001)
    })
    if (negativeInstruments.length > 0) {
      messages.push(`Negative running balance detected for: ${negativeInstruments.join(', ')}. This usually means the imported data doesn't include all transactions. Set a Running Balance override on the first row to correct it.`)
    }
  }

  const depositsWithoutCost = rawTransactions.filter(
    r => (r.journalType === 'OFFCHAIN_DEPOSIT' || r.journalType === 'ONCHAIN_DEPOSIT') && r.userBrlCost === undefined
  )
  if (depositsWithoutCost.length > 0) {
    messages.push(`${depositsWithoutCost.length} deposit${depositsWithoutCost.length > 1 ? 's' : ''} without BRL cost. Edit the BRL Tx Cost column on deposit rows to include the actual BRL amount paid.`)
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
