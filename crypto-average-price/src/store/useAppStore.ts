import { create } from 'zustand'
import type { CryptoComRow } from '../types/transaction'
import type { PtaxMap } from '../types/ptax'
import { getVisibleStickyColumns, type AppSettings, type TableLayoutSettings } from '../types/app'
import { parseCryptoComCsv } from '../parsers/cryptoCom'
import { parsePtaxCsv, mergePtaxMaps } from '../parsers/ptax'
import { parseExportedCsv } from '../parsers/outputCsv'
import { saveSession } from '../utils/localStorage'

interface TransactionFileImport {
  file: File
  exchangeName: string
}

interface ImportTransactionsResult {
  importedCount: number
  duplicateCount: number
  cancelled: boolean
}

export type DuplicateImportDecision = 'cancel' | 'skip' | 'include'

export interface DuplicateImportSummary {
  totalCount: number
  importedCount: number
  duplicateCount: number
  fileCount: number
}

interface ImportTransactionsOptions {
  confirmDuplicates?: (summary: DuplicateImportSummary) => DuplicateImportDecision | Promise<DuplicateImportDecision>
}

export interface ActiveTableFilter {
  column: string
  value: string
}

/**
 * Core application state.
 */
interface AppState {
  rawTransactions: CryptoComRow[]
  ptaxMap: PtaxMap
  settings: AppSettings
  tableLayoutPreview: TableLayoutSettings | null
  activeTableFilters: ActiveTableFilter[]
  isLoading: boolean
  error: string | null

  importTransactions: (imports: TransactionFileImport[], options?: ImportTransactionsOptions) => Promise<ImportTransactionsResult>
  importPtax: (files: FileList) => Promise<void>
  importExported: (file: File) => Promise<void>
  setUserBrlCost: (order: number, value: number | null) => void
  setBalanceOverride: (order: number, value: number | null) => void
  setAvgPriceSeed: (order: number, value: number | null) => void
  addManualRow: (row: CryptoComRow) => void
  updateRow: (order: number, updates: Partial<CryptoComRow>) => void
  deleteRow: (order: number) => void
  setInfoEdit: (order: number, value: string) => void
  setPanelExpanded: (expanded: boolean) => void
  toggleRoundBalance: () => void
  toggleUsdMerge: () => void
  setSelectedInstrument: (instrument: string | null) => void
  setTimezoneOffset: (offset: number) => void
  setColumnVisibility: (column: string, visible: boolean) => void
  setTableLayoutPreview: (layout: TableLayoutSettings | null) => void
  commitColumnLayout: (layout: TableLayoutSettings) => void
  resetColumnLayout: () => void
  setActiveTableFilters: (filters: ActiveTableFilter[]) => void
  restoreSession: (state: {
    rawTransactions: CryptoComRow[]
    ptaxMap: PtaxMap
    settings: AppSettings
  }) => void
  clearAll: () => void
}

/**
 * Default datatable column layout.
 */
export const defaultColumnLayout: TableLayoutSettings = {
  columnVisibility: {
    order: false,
    eventDate: false,
    takerSide: false,
    transactionCost: false,
    exchangeName: false,
    sourceFileName: false,
  },
  stickyColumns: [],
}

/**
 * Default settings.
 */
const defaultSettings: AppSettings = {
  usdMergeEnabled: true,
  selectedInstrument: null,
  ...defaultColumnLayout,
  timezoneOffset: 0,
  roundBalance: false,
  panelExpanded: false,
}

/**
 * Parses a timeUtc string into milliseconds for efficient sorting.
 * @param timeUtc - Time string in MM/DD/YYYY HH:MM:SS format
 * @returns Milliseconds since epoch, or 0 if parsing fails
 */
function parseTimeMs(timeUtc: string): number {
  const m = timeUtc.match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)/)
  if (!m) return 0
  return new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]).getTime()
}

/**
 * Sorts rows by eventDate then timeUtc, then reassigns sequential order numbers starting at 1.
 * @param rows - Array of transaction rows to sort and renumber
 * @returns New array with updated order numbers
 */
function sortAndRenumber(rows: CryptoComRow[]): CryptoComRow[] {
  const keyed = rows.map(r => ({ r, ms: parseTimeMs(r.timeUtc) }))
  keyed.sort((a, b) => {
    if (a.r.eventDate !== b.r.eventDate) return a.r.eventDate.localeCompare(b.r.eventDate)
    if (a.ms !== b.ms) return a.ms - b.ms
    return a.r.order - b.r.order
  })
  return keyed.map(({ r }, i) => ({ ...r, order: i + 1 }))
}

/**
 * Normalizes a value for duplicate detection by trimming and lowercasing.
 * @param value - Any value to normalize
 * @returns Normalized string representation
 */
function normalizeDuplicateValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * Builds a deduplication key for a transaction row.
 * Ignores order, source filename, and exchange name because those can differ between imports.
 * @param row - Transaction row to generate a key for
 * @returns Pipe-delimited key string
 */
function getTransactionDuplicateKey(row: CryptoComRow): string {
  return [
    row.timeUtc,
    row.journalType,
    row.instrument,
    row.transactionQuantity,
    row.side,
    row.transactionCost,
  ].map(normalizeDuplicateValue).join('|')
}

/**
 * Updates a single row field by order number.
 */
function updateRowField<K extends keyof CryptoComRow>(
  rows: CryptoComRow[],
  order: number,
  field: K,
  value: CryptoComRow[K] | undefined,
): CryptoComRow[] {
  return rows.map(r => {
    if (r.order !== order) return r
    if (value === undefined) {
      const nextRow = { ...r }
      delete nextRow[field]
      return nextRow
    }
    return { ...r, [field]: value }
  })
}

/**
 * Debounced persistence to localStorage.
 * Coalesces rapid mutations (e.g., inline edits) into a single write.
 * Flushes immediately on page unload to prevent data loss.
 */
let persistTimer: ReturnType<typeof setTimeout> | null = null
let pendingState: AppState | null = null

function persist(state: AppState): void {
  pendingState = state
  if (persistTimer !== null) return
  persistTimer = setTimeout(flushPersist, 300)
}

function flushPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (pendingState) {
    saveSession(pendingState.rawTransactions, pendingState.ptaxMap, pendingState.settings)
    pendingState = null
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPersist)
}

/**
 * Zustand store for the application.
 * Contains raw data and settings. Overrides live on the rows themselves.
 * Computed columns (ProcessedRow[]) are derived in selectors, not stored here.
 */
export const useAppStore = create<AppState>()((set, get) => ({
  rawTransactions: [],
  ptaxMap: new Map(),
  settings: { ...defaultSettings },
  tableLayoutPreview: null,
  activeTableFilters: [],
  isLoading: false,
  error: null,

  async importTransactions(imports: TransactionFileImport[], options?: ImportTransactionsOptions) {
    set({ isLoading: true, error: null })
    try {
      const existingRows = get().rawTransactions
      const seenKeys = new Set(existingRows.map(getTransactionDuplicateKey))
      const importedRows: CryptoComRow[] = []
      const duplicateRows: CryptoComRow[] = []
      let totalCount = 0
      let duplicateCount = 0

      for (const item of imports) {
        const rows = (await parseCryptoComCsv(item.file)).map(row => ({
          ...row,
          exchangeName: item.exchangeName,
          sourceFileName: item.file.name,
        }))
        totalCount += rows.length

        for (const row of rows) {
          const key = getTransactionDuplicateKey(row)
          if (seenKeys.has(key)) {
            duplicateCount += 1
            duplicateRows.push(row)
            continue
          }
          seenKeys.add(key)
          importedRows.push(row)
        }
      }

      const duplicateDecision = duplicateCount > 0
        ? await options?.confirmDuplicates?.({
          totalCount,
          importedCount: importedRows.length,
          duplicateCount,
          fileCount: imports.length,
        }) ?? 'skip'
        : 'skip'

      if (duplicateDecision === 'cancel') {
        set({ isLoading: false })
        return { importedCount: 0, duplicateCount, cancelled: true }
      }

      const rowsToImport = duplicateDecision === 'include'
        ? [...importedRows, ...duplicateRows]
        : importedRows

      set({
        rawTransactions: sortAndRenumber([...existingRows, ...rowsToImport]),
        isLoading: false,
      })
      persist(get())
      return { importedCount: rowsToImport.length, duplicateCount, cancelled: false }
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
      return { importedCount: 0, duplicateCount: 0, cancelled: false }
    }
  },

  async importPtax(files: FileList) {
    set({ isLoading: true, error: null })
    try {
      const maps = await Promise.all(
        Array.from(files).map(file => parsePtaxCsv(file))
      )
      const currentMap = get().ptaxMap
      const merged = mergePtaxMaps(currentMap, ...maps)
      set({ ptaxMap: merged, isLoading: false })
      persist(get())
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
    }
  },

  async importExported(file: File) {
    set({ isLoading: true, error: null })
    try {
      const { transactions, ptaxMap } = await parseExportedCsv(file)
      set(state => {
        const mergedPtax = new Map(state.ptaxMap)
        for (const [date, rate] of ptaxMap) {
          mergedPtax.set(date, rate)
        }
        return {
          rawTransactions: transactions,
          ptaxMap: mergedPtax,
          isLoading: false,
        }
      })
      persist(get())
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
    }
  },

  setUserBrlCost(order: number, value: number | null) {
    set(state => ({
      rawTransactions: updateRowField(state.rawTransactions, order, 'userBrlCost', value === null ? undefined : value),
    }))
    persist(get())
  },

  setBalanceOverride(order: number, value: number | null) {
    set(state => ({
      rawTransactions: updateRowField(state.rawTransactions, order, 'balanceOverride', value === null ? undefined : value),
    }))
    persist(get())
  },

  setAvgPriceSeed(order: number, value: number | null) {
    set(state => ({
      rawTransactions: updateRowField(state.rawTransactions, order, 'avgPriceSeed', value === null ? undefined : value),
    }))
    persist(get())
  },

  addManualRow(row: CryptoComRow) {
    set(state => ({
      rawTransactions: sortAndRenumber([...state.rawTransactions, row]),
    }))
    persist(get())
  },

  updateRow(order: number, updates: Partial<CryptoComRow>) {
    set(state => {
      const updated = state.rawTransactions.map(r =>
        r.order === order ? { ...r, ...updates } : r
      )
      return { rawTransactions: sortAndRenumber(updated) }
    })
    persist(get())
  },

  deleteRow(order: number) {
    set(state => ({
      rawTransactions: sortAndRenumber(
        state.rawTransactions.filter(r => r.order !== order)
      ),
    }))
    persist(get())
  },

  setInfoEdit(order: number, value: string) {
    set(state => ({
      rawTransactions: updateRowField(state.rawTransactions, order, 'info', value || undefined),
    }))
    persist(get())
  },

  setPanelExpanded(expanded: boolean) {
    set(state => ({
      settings: { ...state.settings, panelExpanded: expanded },
    }))
    persist(get())
  },

  toggleRoundBalance() {
    set(state => ({
      settings: { ...state.settings, roundBalance: !state.settings.roundBalance },
    }))
    persist(get())
  },

  toggleUsdMerge() {
    set(state => ({
      settings: {
        ...state.settings,
        usdMergeEnabled: !state.settings.usdMergeEnabled,
        selectedInstrument: null,
      },
    }))
    persist(get())
  },

  setSelectedInstrument(instrument: string | null) {
    set(state => ({
      settings: { ...state.settings, selectedInstrument: instrument },
    }))
    persist(get())
  },

  setTimezoneOffset(offset: number) {
    set(state => ({
      settings: { ...state.settings, timezoneOffset: offset },
    }))
    persist(get())
  },

  setColumnVisibility(column: string, visible: boolean) {
    set(state => ({
      settings: {
        ...state.settings,
        columnVisibility: { ...state.settings.columnVisibility, [column]: visible },
        stickyColumns: visible
          ? state.settings.stickyColumns ?? []
          : (state.settings.stickyColumns ?? []).filter(stickyColumn => stickyColumn !== column),
      },
    }))
    persist(get())
  },

  setTableLayoutPreview(layout: TableLayoutSettings | null) {
    set({ tableLayoutPreview: layout })
  },

  commitColumnLayout(layout: TableLayoutSettings) {
    const stickyColumns = getVisibleStickyColumns(layout.stickyColumns, layout.columnVisibility)
    set(state => ({
      settings: {
        ...state.settings,
        columnVisibility: { ...layout.columnVisibility },
        stickyColumns,
      },
      tableLayoutPreview: null,
    }))
    persist(get())
  },

  resetColumnLayout() {
    set(state => ({
      settings: {
        ...state.settings,
        columnVisibility: { ...defaultSettings.columnVisibility },
        stickyColumns: [],
      },
      tableLayoutPreview: null,
    }))
    persist(get())
  },

  setActiveTableFilters(filters: ActiveTableFilter[]) {
    set({ activeTableFilters: filters })
  },

  restoreSession(restored) {
    set({
      rawTransactions: restored.rawTransactions,
      ptaxMap: restored.ptaxMap,
      tableLayoutPreview: null,
      settings: {
        ...defaultSettings,
        ...restored.settings,
        columnVisibility: {
          ...defaultSettings.columnVisibility,
          ...restored.settings.columnVisibility,
        },
        stickyColumns: getVisibleStickyColumns(
          restored.settings.stickyColumns ?? defaultSettings.stickyColumns,
          {
            ...defaultSettings.columnVisibility,
            ...restored.settings.columnVisibility,
          },
        ),
      },
    })
  },

  clearAll() {
    set({
      rawTransactions: [],
      ptaxMap: new Map(),
      settings: { ...defaultSettings },
      tableLayoutPreview: null,
      activeTableFilters: [],
      error: null,
    })
    pendingState = get()
    flushPersist()
  },
}))
