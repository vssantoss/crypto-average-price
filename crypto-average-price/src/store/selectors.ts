import { useMemo } from 'react'
import { useAppStore } from './useAppStore'
import type { ProcessedRow } from '../types/transaction'
import type { CoinSummary } from '../types/app'
import { computeAllColumns } from '../engine/computeAllColumns'
import { normalizeInstruments, getUniqueInstruments } from '../engine/usdMerge'

interface AppComputedData {
  processedRows: ProcessedRow[]
  allProcessedRows: ProcessedRow[]
  ptaxWarnings: string[]
  diagnostics: string[]
}

/**
 * Builds diagnostic messages from raw and processed transaction data.
 * @param rawTransactions - Raw transaction rows from the store
 * @param allProcessedRows - Computed rows for all instruments
 * @param _ptaxMap - Imported PTAX rate map, currently ignored while PTAX math is disabled
 * @param _usdMergeEnabled - Whether USD instruments are merged, currently ignored for diagnostics
 * @returns User-facing diagnostic messages
 */
function buildDiagnostics(
  rawTransactions: ReturnType<typeof useAppStore.getState>['rawTransactions'],
  allProcessedRows: ProcessedRow[],
  _ptaxMap: ReturnType<typeof useAppStore.getState>['ptaxMap'],
  _usdMergeEnabled: boolean,
): string[] {
  void _ptaxMap
  void _usdMergeEnabled

  if (rawTransactions.length === 0) return []

  const messages: string[] = []

  const instruments = Array.from(new Set(allProcessedRows.map(row => row.instrument))).sort()
  const instrumentsWithoutAvgPrice = instruments.filter(inst => {
    const rows = allProcessedRows.filter(r => r.instrument === inst)
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
      const rows = allProcessedRows.filter(r => r.instrument === inst)
      return rows.some(r => r.runningBalance < -0.001)
    })
    if (negativeInstruments.length > 0) {
      messages.push(`Negative running balance detected for: ${negativeInstruments.join(', ')}. This usually means the imported data doesn't include all transactions. Set a Running Balance override on the first row to correct it.`)
    }
  }

  const depositRows = rawTransactions.filter(
    r => r.journalType === 'OFFCHAIN_DEPOSIT' || r.journalType === 'ONCHAIN_DEPOSIT'
  )
  if (depositRows.length > 0) {
    const depositsWithoutCost = depositRows.filter(r => r.userBrlCost === undefined)
    if (depositsWithoutCost.length > 0) {
      messages.push(`${depositsWithoutCost.length} deposit${depositsWithoutCost.length > 1 ? 's' : ''} without BRL cost. Edit the BRL Tx Cost column on deposit rows to include the actual BRL amount paid.`)
    }
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
  const selectedInstrument = useAppStore(s => s.settings.selectedInstrument)

  return useMemo(() => {
    const allProcessedRows = rawTransactions.length === 0
      ? []
      : computeAllColumns(rawTransactions, ptaxMap, usdMergeEnabled, null)
    const processedRows = selectedInstrument
      ? allProcessedRows.filter(row => row.instrument === selectedInstrument)
      : allProcessedRows
    const ptaxWarnings: string[] = []
    const diagnostics = buildDiagnostics(rawTransactions, allProcessedRows, ptaxMap, usdMergeEnabled)

    return {
      processedRows,
      allProcessedRows,
      ptaxWarnings,
      diagnostics,
    }
  }, [rawTransactions, ptaxMap, usdMergeEnabled, selectedInstrument])
}

/**
 * Hook that returns computed/processed rows for the currently selected instrument.
 * Memoized to avoid recomputation on every render.
 * @returns Array of ProcessedRow objects ready for display
 */
export function useProcessedRows(): ProcessedRow[] {
  const rawTransactions = useAppStore(s => s.rawTransactions)
  const ptaxMap = useAppStore(s => s.ptaxMap)
  const usdMergeEnabled = useAppStore(s => s.settings.usdMergeEnabled)
  const selectedInstrument = useAppStore(s => s.settings.selectedInstrument)

  return useMemo(() => {
    if (rawTransactions.length === 0) return []
    return computeAllColumns(rawTransactions, ptaxMap, usdMergeEnabled, selectedInstrument)
  }, [rawTransactions, ptaxMap, usdMergeEnabled, selectedInstrument])
}

/**
 * Hook that returns computed/processed rows for ALL instruments (ignoring coin filter).
 * Used for exporting all data regardless of current filter.
 */
export function useAllProcessedRows(): ProcessedRow[] {
  const rawTransactions = useAppStore(s => s.rawTransactions)
  const ptaxMap = useAppStore(s => s.ptaxMap)
  const usdMergeEnabled = useAppStore(s => s.settings.usdMergeEnabled)

  return useMemo(() => {
    if (rawTransactions.length === 0) return []
    return computeAllColumns(rawTransactions, ptaxMap, usdMergeEnabled, null)
  }, [rawTransactions, ptaxMap, usdMergeEnabled])
}

/**
 * Hook that returns the list of unique instrument names available for selection.
 * Respects the USD merge toggle.
 * @returns Sorted array of instrument names
 */
export function useInstrumentList(): string[] {
  const rawTransactions = useAppStore(s => s.rawTransactions)
  const usdMergeEnabled = useAppStore(s => s.settings.usdMergeEnabled)

  return useMemo(() => {
    const normalized = normalizeInstruments(rawTransactions, usdMergeEnabled)
    return getUniqueInstruments(normalized)
  }, [rawTransactions, usdMergeEnabled])
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
 * Hook that returns summary statistics for each instrument.
 * @returns Array of CoinSummary objects
 */
export function useCoinSummaries(): CoinSummary[] {
  const rawTransactions = useAppStore(s => s.rawTransactions)
  const ptaxMap = useAppStore(s => s.ptaxMap)
  const usdMergeEnabled = useAppStore(s => s.settings.usdMergeEnabled)

  return useMemo(() => {
    if (rawTransactions.length === 0) return []

    const instruments = getUniqueInstruments(
      normalizeInstruments(rawTransactions, usdMergeEnabled),
    )

    return instruments.map(inst => {
      const rows = computeAllColumns(rawTransactions, ptaxMap, usdMergeEnabled, inst)

      if (rows.length === 0) {
        return {
          instrument: inst,
          currentBalance: 0,
          averagePrice: null,
          totalBrlInvested: null,
          brlBalance: null,
        }
      }

      const lastRow = rows[rows.length - 1]
      return {
        instrument: inst,
        currentBalance: lastRow.runningBalance,
        averagePrice: lastRow.precoMedioCompra,
        totalBrlInvested: null,
        brlBalance: lastRow.brlRunningBalance,
      }
    })
  }, [rawTransactions, ptaxMap, usdMergeEnabled])
}

/**
 * Hook that returns diagnostic messages about missing data needed for full calculation.
 */
export function useDiagnostics(): string[] {
  const rawTransactions = useAppStore(s => s.rawTransactions)
  const ptaxMap = useAppStore(s => s.ptaxMap)
  const usdMergeEnabled = useAppStore(s => s.settings.usdMergeEnabled)

  return useMemo(() => {
    const allProcessedRows = rawTransactions.length === 0
      ? []
      : computeAllColumns(rawTransactions, ptaxMap, usdMergeEnabled, null)
    return buildDiagnostics(rawTransactions, allProcessedRows, ptaxMap, usdMergeEnabled)
  }, [rawTransactions, ptaxMap, usdMergeEnabled])
}

/**
 * Hook that returns dates with missing PTAX data for the current transactions.
 * @returns Array of ISO date strings that have no PTAX rate
 */
export function usePtaxWarnings(): string[] {
  return []
}
