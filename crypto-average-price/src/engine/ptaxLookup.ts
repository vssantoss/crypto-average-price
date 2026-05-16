import type { PtaxMap } from '../types/ptax'
import { getPreviousDay } from '../utils/date'

/**
 * Maximum number of days to walk backwards looking for a PTAX rate.
 * Covers long holiday periods (e.g., carnival + weekend).
 */
const MAX_LOOKBACK_DAYS = 10

/**
 * Looks up the PTAX venda (sell) rate for a given date.
 * If the exact date is not found (weekend/holiday), walks backwards
 * to the most recent previous business day.
 * @param date - ISO date string (YYYY-MM-DD)
 * @param ptaxMap - Map of dates to sell rates
 * @returns The sell rate, or null if no rate found within lookback window
 */
export function lookupPtaxRate(date: string, ptaxMap: PtaxMap): number | null {
  if (ptaxMap.size === 0 || !date) return null

  let currentDate = date
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const rate = ptaxMap.get(currentDate)
    if (rate !== undefined) return rate
    currentDate = getPreviousDay(currentDate)
  }

  return null
}

/**
 * Finds all dates in a list that have no PTAX data (even after fallback).
 * Used to generate warnings for the user.
 * @param dates - Array of ISO date strings to check
 * @param ptaxMap - Map of dates to sell rates
 * @returns Array of dates with missing PTAX data
 */
export function findMissingPtaxDates(dates: string[], ptaxMap: PtaxMap): string[] {
  if (ptaxMap.size === 0) return [...new Set(dates)]

  const missing: Set<string> = new Set()

  for (const date of dates) {
    if (lookupPtaxRate(date, ptaxMap) === null) {
      missing.add(date)
    }
  }

  return Array.from(missing).sort()
}
