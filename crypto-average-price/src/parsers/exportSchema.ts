import type { CryptoComRow, JournalType, ProcessedRow, TradeSide } from '../types/transaction'
import type { PtaxMap } from '../types/ptax'
import { parseCryptoComDate } from '../utils/date'
import { cleanCsvNumber } from '../utils/number'

/**
 * Column names used by the app's export CSV format.
 */
export const EXPORT_CSV_COLUMNS = {
  ORDER: 'Order',
  JOURNAL_ID: 'Journal ID',
  TIME_UTC: 'Time (UTC)',
  EVENT_DATE: 'Event Date',
  JOURNAL_TYPE: 'Journal Type',
  EXCHANGE: 'Exchange',
  SOURCE_FILE: 'Source File',
  INSTRUMENT: 'Instrument',
  ORIGINAL_INSTRUMENT: 'Original Instrument',
  TAKER_SIDE: 'Taker Side',
  SIDE: 'Side',
  TRANSACTION_QUANTITY: 'Transaction Quantity',
  TRANSACTION_COST: 'Transaction Cost',
  ORDER_ID: 'Order ID',
  TRADE_ID: 'Trade ID',
  TRADE_MATCH_ID: 'Trade Match ID',
  CLIENT_ORDER_ID: 'Client Order Id',
  RUNNING_BALANCE: 'Running Balance',
  PTAX_RATE: 'PTAX Rate',
  BRL_RUNNING_BALANCE: 'BRL Running Balance',
  BRL_TRANSACTION_COST: 'BRL Transaction Cost',
  BRL_AVG_PRICE: 'BRL Avg Price',
  BRL_PROFIT_LOSS: 'BRL Profit/Loss',
  INFO: 'Info',
  AVG_PRICE_SEED: '_AvgPriceSeed',
  USER_BRL_COST: '_UserBrlCost',
  BALANCE_OVERRIDE: '_BalanceOverride',
} as const

type ExportCsvRow = Record<string, string | number>

/**
 * Builds one CSV export row from processed and raw transaction data.
 * @param row - Processed table row being exported
 * @param raw - Matching raw transaction with user override fields
 * @returns Plain object keyed by export CSV column name
 */
export function buildExportCsvRow(row: ProcessedRow, raw?: CryptoComRow): ExportCsvRow {
  const C = EXPORT_CSV_COLUMNS

  return {
    [C.ORDER]: row.order,
    [C.JOURNAL_ID]: raw?.journalId ?? '',
    [C.TIME_UTC]: row.timeUtc,
    [C.EVENT_DATE]: row.eventDate,
    [C.JOURNAL_TYPE]: row.journalType,
    [C.INSTRUMENT]: row.instrument,
    [C.ORIGINAL_INSTRUMENT]: row.originalInstrument,
    [C.TAKER_SIDE]: row.takerSide,
    [C.SIDE]: row.side || '',
    [C.TRANSACTION_QUANTITY]: row.transactionQuantity,
    [C.TRANSACTION_COST]: row.transactionCost,
    [C.ORDER_ID]: raw?.orderId ?? '',
    [C.TRADE_ID]: raw?.tradeId ?? '',
    [C.TRADE_MATCH_ID]: raw?.tradeMatchId ?? '',
    [C.CLIENT_ORDER_ID]: raw?.clientOrderId ?? '',
    [C.RUNNING_BALANCE]: row.runningBalance,
    [C.PTAX_RATE]: row.cambioBC ?? '',
    [C.BRL_RUNNING_BALANCE]: row.brlRunningBalance ?? '',
    [C.BRL_TRANSACTION_COST]: row.brlTransactionCost ?? '',
    [C.BRL_AVG_PRICE]: row.precoMedioCompra ?? '',
    [C.BRL_PROFIT_LOSS]: row.totalLucroPrejuizo ?? '',
    [C.INFO]: row.info,
    [C.AVG_PRICE_SEED]: raw?.avgPriceSeed !== undefined ? 'true' : '',
    [C.USER_BRL_COST]: raw?.userBrlCost ?? '',
    [C.BALANCE_OVERRIDE]: raw?.balanceOverride ?? '',
    [C.EXCHANGE]: row.exchangeName,
    [C.SOURCE_FILE]: row.sourceFileName,
  }
}

/**
 * Parses one exported CSV row back into a raw transaction and optional PTAX entry.
 * @param rawRow - PapaParse row keyed by export CSV column name
 * @returns Parsed transaction and PTAX map entry, or null transaction for invalid rows
 */
export function parseExportedCsvRow(rawRow: Record<string, string>): {
  transaction: CryptoComRow | null
  ptaxEntry: [string, number] | null
} {
  const C = EXPORT_CSV_COLUMNS
  const order = parseInt(rawRow[C.ORDER] || '0', 10)
  if (!order) return { transaction: null, ptaxEntry: null }

  const side = rawRow[C.SIDE]?.trim()
  const parsedSide: TradeSide = side === 'BUY' ? 'BUY' : side === 'SELL' ? 'SELL' : null
  const eventDateRaw = rawRow[C.EVENT_DATE]?.trim() || ''
  const eventDate = eventDateRaw.includes('-') ? eventDateRaw : parseCryptoComDate(eventDateRaw)

  const transaction: CryptoComRow = {
    order,
    journalId: rawRow[C.JOURNAL_ID]?.trim() || '',
    timeUtc: rawRow[C.TIME_UTC]?.trim() || '',
    eventDate,
    journalType: rawRow[C.JOURNAL_TYPE]?.trim() as JournalType,
    exchangeName: rawRow[C.EXCHANGE]?.trim() || undefined,
    sourceFileName: rawRow[C.SOURCE_FILE]?.trim() || undefined,
    instrument: rawRow[C.ORIGINAL_INSTRUMENT]?.trim() || rawRow[C.INSTRUMENT]?.trim() || '',
    takerSide: rawRow[C.TAKER_SIDE]?.trim() || '',
    side: parsedSide,
    transactionQuantity: parseFloat(rawRow[C.TRANSACTION_QUANTITY] || '0') || 0,
    transactionCost: parseFloat(rawRow[C.TRANSACTION_COST] || '0') || 0,
    usdBalance: 0,
    realizedPnl: 0,
    orderId: rawRow[C.ORDER_ID]?.trim() || '',
    tradeId: rawRow[C.TRADE_ID]?.trim() || '',
    tradeMatchId: rawRow[C.TRADE_MATCH_ID]?.trim() || '',
    clientOrderId: rawRow[C.CLIENT_ORDER_ID]?.trim() || '',
  }

  const info = rawRow[C.INFO]?.trim() || ''
  if (info) transaction.info = info

  const avgPriceVal = cleanCsvNumber(rawRow[C.BRL_AVG_PRICE] || '')
  if (avgPriceVal > 0 && rawRow[C.AVG_PRICE_SEED] === 'true') {
    transaction.avgPriceSeed = avgPriceVal
  }

  const brlCostVal = cleanCsvNumber(rawRow[C.USER_BRL_COST] || '')
  if (brlCostVal !== 0) {
    transaction.userBrlCost = brlCostVal
  }

  const balOverride = rawRow[C.BALANCE_OVERRIDE] || ''
  const balOverrideVal = parseFloat(balOverride)
  if (!isNaN(balOverrideVal) && balOverride.trim() !== '') {
    transaction.balanceOverride = balOverrideVal
  }

  const cambio = rawRow[C.PTAX_RATE] || ''
  const cambioVal = parseFloat(cambio)
  const ptaxEntry: [string, number] | null = !isNaN(cambioVal) && cambio.trim() !== '' && eventDate
    ? [eventDate, cambioVal]
    : null

  return { transaction, ptaxEntry }
}

/**
 * Creates a PTAX map entry from parsed export data.
 * @param ptaxMap - PTAX map to update
 * @param entry - Optional event date and PTAX rate pair
 */
export function addExportedPtaxEntry(ptaxMap: PtaxMap, entry: [string, number] | null): void {
  if (entry) ptaxMap.set(entry[0], entry[1])
}
