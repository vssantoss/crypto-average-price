import type { PtaxMap } from '../types/ptax'
import { parsePtaxDate } from '../utils/date'
import { parseBrlNumber } from '../utils/number'

/**
 * The column index (0-based) for the venda (sell) rate in the PTAX CSV.
 * Format: ddmmyyyy;220;A;USD;compra;venda;1,0000;1,0000
 */
const SELL_RATE_INDEX = 5

/**
 * Parses a single BCB PTAX exchange rate CSV file into a PtaxMap.
 * The file is semicolon-delimited with comma decimal separators.
 * @param file - The PTAX CSV File object to parse
 * @returns Promise resolving to a PtaxMap (date -> sell rate)
 */
export function parsePtaxCsv(file: File): Promise<PtaxMap> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      try {
        const text = reader.result as string
        const map: PtaxMap = new Map()
        const lines = text.split(/\r?\n/)

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          const parts = trimmed.split(';')
          if (parts.length < 6) continue

          // Skip header rows or non-date rows
          const dateStr = parts[0]
          if (!/^\d{8}$/.test(dateStr)) continue

          const currency = parts[3]
          if (currency !== 'USD') continue

          const isoDate = parsePtaxDate(dateStr)
          const sellRate = parseBrlNumber(parts[SELL_RATE_INDEX])

          if (!isNaN(sellRate) && sellRate > 0) {
            map.set(isoDate, sellRate)
          }
        }

        resolve(map)
      } catch (err) {
        reject(new Error(`Failed to parse PTAX CSV: ${(err as Error).message}`))
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read PTAX CSV file'))
    }

    reader.readAsText(file, 'utf-8')
  })
}

/**
 * Merges multiple PtaxMap instances into a single map.
 * Later entries overwrite earlier ones for the same date.
 * @param maps - Array of PtaxMap instances to merge
 * @returns A single merged PtaxMap
 */
export function mergePtaxMaps(...maps: PtaxMap[]): PtaxMap {
  const merged: PtaxMap = new Map()
  for (const map of maps) {
    for (const [date, rate] of map) {
      merged.set(date, rate)
    }
  }
  return merged
}
