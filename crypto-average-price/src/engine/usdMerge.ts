import type { CryptoComRow } from '../types/transaction'
import { USD_INSTRUMENTS, MERGED_USD_NAME } from '../types/app'
import type { TradeMatchIndex } from './tradeMatching'

const USD_INSTRUMENT_KEYS = new Set(
  [...USD_INSTRUMENTS, MERGED_USD_NAME].map(instrumentToLookupKey),
)

/**
 * Converts an instrument name into a stable lookup key.
 * @param instrument - Instrument name to normalize
 * @returns Case-insensitive lookup key
 */
function instrumentToLookupKey(instrument: string): string {
  return instrument.trim().toUpperCase()
}

/**
 * Checks if an instrument name is a USD stablecoin variant or the merged USD label.
 * @param instrument - Instrument name to check
 * @returns True if the instrument is USD-like
 */
export function isUsdInstrument(instrument: string): boolean {
  return USD_INSTRUMENT_KEYS.has(instrumentToLookupKey(instrument))
}

/**
 * Checks whether a normalized row is one leg of a USD-to-USD trade inside the merged USD bucket.
 * @param row - Normalized transaction row to inspect
 * @param tradeIndex - Trade match index built from the original rows
 * @param rows - Optional normalized rows used as a fallback when trade match IDs are unavailable
 * @returns True when both original trade legs are USD-like instruments
 */
export function isMergedUsdInternalTrade(
  row: CryptoComRow,
  tradeIndex: TradeMatchIndex,
  rows: CryptoComRow[] = [],
): boolean {
  if (row.instrument !== MERGED_USD_NAME) {
    return false
  }

  if (row.tradeMatchId && row.tradeMatchId !== '0') {
    const matches = tradeIndex.get(row.tradeMatchId)
    if (!matches) return false

    const current = matches.find(match => match.order === row.order)
    const paired = matches.find(match => (
      match.order !== row.order &&
      match.journalType === row.journalType &&
      match.side !== null &&
      row.side !== null &&
      match.side !== row.side
    ))

    return Boolean(
      current &&
      paired &&
      isUsdInstrument(current.instrument) &&
      isUsdInstrument(paired.instrument),
    )
  }

  const rowQuantity = Math.abs(row.transactionQuantity)

  return rows.some(match => {
    const matchQuantity = Math.abs(match.transactionQuantity)
    const maxQuantity = Math.max(rowQuantity, matchQuantity)
    // Exported backups do not keep trade IDs, so same-time fallback only accepts near-equal USD legs.
    const quantitiesMatch = Math.abs(rowQuantity - matchQuantity) <= Math.max(maxQuantity * 0.005, 0.01)

    return (
      quantitiesMatch &&
      match.order !== row.order &&
      match.timeUtc === row.timeUtc &&
      match.journalType === row.journalType &&
      match.instrument === MERGED_USD_NAME &&
      match.side !== null &&
      row.side !== null &&
      match.side !== row.side
    )
  })
}

/**
 * Normalizes instrument names in transaction rows when USD merge is enabled.
 * Replaces all USD variants (USD, USDC, USDT, USD_Stable_Coin) with a merged name.
 * Returns new row objects; does not mutate originals.
 * @param rows - Transaction rows to normalize
 * @param mergeEnabled - Whether USD merge is active
 * @returns New array of rows with normalized instrument names
 */
export function normalizeInstruments(
  rows: CryptoComRow[],
  mergeEnabled: boolean
): CryptoComRow[] {
  if (!mergeEnabled) return rows

  return rows.map(row => {
    if (isUsdInstrument(row.instrument)) {
      return { ...row, instrument: MERGED_USD_NAME }
    }
    return row
  })
}

/**
 * Extracts the unique instrument names from a list of transactions.
 * @param rows - Transaction rows
 * @returns Sorted array of unique instrument names
 */
export function getUniqueInstruments(rows: CryptoComRow[]): string[] {
  const instruments = new Set<string>()
  for (const row of rows) {
    instruments.add(row.instrument)
  }
  return Array.from(instruments).sort()
}
