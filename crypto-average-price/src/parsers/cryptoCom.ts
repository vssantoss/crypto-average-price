import Papa from 'papaparse'
import { type CryptoComRow, JournalType, type TradeSide } from '../types/transaction'
import { parseCryptoComDate } from '../utils/date'
import { EXPORT_CSV_COLUMNS } from './exportSchema'

/**
 * Known column names from the Crypto.com transaction report CSV header.
 */
const COLUMN_MAP: Record<string, keyof CryptoComRow> = {
  'Order': 'order',
  'Journal ID': 'journalId',
  'Time (UTC)': 'timeUtc',
  'Event Date': 'eventDate',
  'Journal Type': 'journalType',
  'Instrument': 'instrument',
  'Taker Side': 'takerSide',
  'Side': 'side',
  'Transaction Quantity': 'transactionQuantity',
  'Transaction Cost': 'transactionCost',
  'USD Balance': 'usdBalance',
  'Realized PNL': 'realizedPnl',
  'Order ID': 'orderId',
  'Trade ID': 'tradeId',
  'Trade Match ID': 'tradeMatchId',
  'Client Order Id': 'clientOrderId',
}

/**
 * Checks whether CSV headers belong to an app backup export instead of a Crypto.com report.
 * @param fields - Header names parsed from the selected CSV
 * @returns True when backup-only headers are present
 */
export function hasBackupCsvHeaders(fields: string[]): boolean {
  const headerSet = new Set(fields.map(field => field.trim()))
  return headerSet.has(EXPORT_CSV_COLUMNS.ASSET) ||
    headerSet.has(EXPORT_CSV_COLUMNS.AVG_PRICE_SEED) ||
    headerSet.has(EXPORT_CSV_COLUMNS.USER_BRL_COST) ||
    headerSet.has(EXPORT_CSV_COLUMNS.BALANCE_OVERRIDE)
}

/**
 * Parses a Side column value into a typed TradeSide.
 * @param value - Raw side string from the CSV
 * @returns Typed TradeSide or null for non-trade rows
 */
function parseSide(value: string): TradeSide {
  const v = value?.trim()
  if (v === 'BUY') return 'BUY'
  if (v === 'SELL') return 'SELL'
  return null
}

/**
 * Parses a Journal Type string into the JournalType enum.
 * @param value - Raw journal type string from the CSV
 * @returns JournalType enum value
 */
function parseJournalType(value: string): JournalType {
  const v = value?.trim() as JournalType
  if (Object.values(JournalType).includes(v)) return v
  return v as JournalType
}

/**
 * Parses a Crypto.com transaction report CSV file into structured rows.
 * Handles trailing commas in header, NULL_VAL side values, and number parsing.
 * @param file - The CSV File object to parse
 * @returns Promise resolving to an array of CryptoComRow objects sorted by time
 */
export function parseCryptoComCsv(file: File): Promise<CryptoComRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header, index) => header.trim() || `_empty_${index}`,
      complete(results) {
        const rows: CryptoComRow[] = []

        for (const rawRow of results.data as Record<string, string>[]) {
          const mapped: Partial<CryptoComRow> = {}

          for (const [csvCol, fieldName] of Object.entries(COLUMN_MAP)) {
            const rawValue = rawRow[csvCol]
            if (rawValue === undefined) continue

            switch (fieldName) {
              case 'order':
                mapped.order = parseInt(rawValue, 10)
                break
              case 'transactionQuantity':
              case 'transactionCost':
              case 'usdBalance':
              case 'realizedPnl':
                mapped[fieldName] = parseFloat(rawValue) || 0
                break
              case 'journalType':
                mapped.journalType = parseJournalType(rawValue)
                break
              case 'side':
                mapped.side = parseSide(rawValue)
                break
              case 'eventDate':
                mapped.eventDate = parseCryptoComDate(rawValue)
                mapped.timeUtc = rawRow['Time (UTC)']?.trim() || ''
                break
              default:
                (mapped as Record<string, unknown>)[fieldName] = rawValue?.trim() || ''
            }
          }

          if (mapped.order && mapped.journalType && mapped.instrument) {
            rows.push(mapped as CryptoComRow)
          }
        }

        if (rows.length === 0) {
          reject(new Error('This file is empty or not compatible with transaction import.'))
          return
        }

        rows.sort((a, b) => {
          const timeA = new Date(a.timeUtc).getTime()
          const timeB = new Date(b.timeUtc).getTime()
          if (timeA !== timeB) return timeA - timeB
          return a.order - b.order
        })

        resolve(rows)
      },
      error(err) {
        reject(new Error(`Failed to parse Crypto.com CSV: ${err.message}`))
      },
    })
  })
}
