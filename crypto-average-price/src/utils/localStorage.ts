import type { CryptoComRow } from '../types/transaction'
import type { PtaxMap } from '../types/ptax'
import type { AppSettings, TableFilterState } from '../types/app'
import { normalizeTableFilters } from './tableFilters'

const STORAGE_KEY = 'crypto-avg-price-session'
const SCHEMA_VERSION = 2
const RECOVERY_SESSION_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Shape of the data persisted to localStorage.
 */
interface PersistedState {
  version: number
  timestamp: number
  rawTransactions: CryptoComRow[]
  ptaxEntries: [string, number][]
  settings: AppSettings
  tableFilters?: TableFilterState[]
}

/**
 * Saves the current app state to localStorage.
 * @param rawTransactions - All raw transaction rows (with overrides embedded)
 * @param ptaxMap - PTAX rate map
 * @param settings - App settings
 * @param tableFilters - Applied table filters kept as session-only UI state
 */
export function saveSession(
  rawTransactions: CryptoComRow[],
  ptaxMap: PtaxMap,
  settings: AppSettings,
  tableFilters: TableFilterState[] = [],
): void {
  try {
    const state: PersistedState = {
      version: SCHEMA_VERSION,
      timestamp: Date.now(),
      rawTransactions,
      ptaxEntries: Array.from(ptaxMap.entries()),
      settings,
      tableFilters,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage may be full or unavailable
  }
}

/**
 * Loads a previously saved session from localStorage.
 * @returns The persisted state if valid, or null if no session exists or schema mismatch
 */
export function loadSession(): {
  rawTransactions: CryptoComRow[]
  ptaxMap: PtaxMap
  settings: AppSettings
  tableFilters: TableFilterState[]
  timestamp: number
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const state: PersistedState = JSON.parse(raw)
    if (state.version !== SCHEMA_VERSION) return null
    if (!state.rawTransactions || state.rawTransactions.length === 0) return null
    if (import.meta.env.PROD && Date.now() - state.timestamp > RECOVERY_SESSION_MAX_AGE_MS) {
      clearSession()
      return null
    }

    return {
      rawTransactions: state.rawTransactions,
      ptaxMap: new Map(state.ptaxEntries),
      settings: state.settings,
      tableFilters: normalizeTableFilters(state.tableFilters),
      timestamp: state.timestamp,
    }
  } catch {
    return null
  }
}

/**
 * Removes the saved session from localStorage.
 */
export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}
