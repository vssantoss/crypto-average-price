import Papa from 'papaparse'
import type { CryptoComRow } from '../types/transaction'
import type { PtaxMap } from '../types/ptax'
import { addExportedPtaxEntry, parseExportedCsvRow } from './exportSchema'

/**
 * Parses a previously exported CSV to recover raw transactions with embedded overrides and PTAX rates.
 * This allows round-trip: export -> re-import with all data preserved.
 * @param file - The exported CSV File object to parse
 * @returns Promise with raw transactions and PTAX map
 */
export function parseExportedCsv(file: File): Promise<{
  transactions: CryptoComRow[]
  ptaxMap: PtaxMap
}> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const transactions: CryptoComRow[] = []
        const ptaxMap: PtaxMap = new Map()

        for (const rawRow of results.data as Record<string, string>[]) {
          const parsed = parseExportedCsvRow(rawRow)
          if (!parsed.transaction) continue
          transactions.push(parsed.transaction)
          addExportedPtaxEntry(ptaxMap, parsed.ptaxEntry)
        }

        if (transactions.length === 0) {
          reject(new Error('This file is empty or not compatible with backup import.'))
          return
        }

        transactions.sort((a, b) => a.order - b.order)
        resolve({ transactions, ptaxMap })
      },
      error(err) {
        reject(new Error(`Failed to parse exported CSV: ${err.message}`))
      },
    })
  })
}
