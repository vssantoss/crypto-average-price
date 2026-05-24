import { OffchainSplitType, Wallet } from '../types/transaction'
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
  WALLET: 'Wallet',
  EXCHANGE: 'Exchange',
  SOURCE_FILE: 'Source File',
  ASSET: 'Asset',
  INSTRUMENT: 'Instrument',
  TAKER_SIDE: 'Taker Side',
  SIDE: 'Side',
  TRANSACTION_QUANTITY: 'Transaction Quantity',
  TRADE_FEE: 'Trade Fee',
  NET_TRANSACTION_QUANTITY: 'Net Tx Quantity',
  TRANSACTION_COST: 'Transaction Cost',
  ORDER_ID: 'Order ID',
  TRADE_ID: 'Trade ID',
  TRADE_MATCH_ID: 'Trade Match ID',
  CLIENT_ORDER_ID: 'Client Order Id',
  RUNNING_BALANCE: 'Running Balance',
  OFFCHAIN_BALANCE: 'External Balance',
  PTAX_RATE: 'PTAX Rate',
  BRL_RUNNING_BALANCE: 'BRL Running Balance',
  USD_RUNNING_BALANCE: 'USD Balance',
  USD_TRANSACTION_COST: 'USD Tx Cost',
  USD_AVG_PRICE: 'USD Avg Price',
  BRL_COST_RATE: 'BRL Cost Rate',
  BRL_TRANSACTION_COST: 'BRL Transaction Cost',
  BRL_AVG_PRICE: 'BRL Avg Price',
  BRL_PROFIT_LOSS: 'BRL Profit/Loss',
  INFO: 'Info',
  AVG_PRICE_SEED: '_AvgPriceSeed',
  USD_AVG_PRICE_SEED: '_UsdAvgPriceSeed',
  USER_BRL_COST: '_UserBrlCost',
  USER_USD_COST: '_UserUsdCost',
  BALANCE_OVERRIDE: '_BalanceOverride',
} as const

type ExportCsvRow = Record<string, string | number>

export interface ExportCsvOptions {
  includeCalculated?: boolean
}

/**
 * Returns a calculated export value unless the row suppresses calculated fields.
 * @param row - Processed row being exported
 * @param value - Calculated value to export
 * @returns Blank for suppressed rows, otherwise the provided calculated value
 */
function getCalculatedExportValue(row: ProcessedRow, value: string | number | null): string | number {
  if (row.suppressCalculatedFields) return ''
  return value ?? ''
}

/**
 * Builds one CSV export row from processed and raw transaction data.
 * @param row - Processed table row being exported
 * @param raw - Matching raw transaction with user override fields
 * @param options - Export options (e.g. whether to include calculated columns)
 * @returns Plain object keyed by export CSV column name
 */
export function buildExportCsvRow(row: ProcessedRow, raw?: CryptoComRow, options?: ExportCsvOptions): ExportCsvRow {
  const C = EXPORT_CSV_COLUMNS

  const calc = options?.includeCalculated
  const includeUserCosts = row.offchainSplitType !== OffchainSplitType.RETURN

  const result: ExportCsvRow = {
    [C.ORDER]: row.order,
    [C.TIME_UTC]: row.timeUtc,
    [C.EVENT_DATE]: row.eventDate,
    [C.JOURNAL_TYPE]: row.journalType,
    [C.WALLET]: row.wallet,
    [C.ASSET]: row.asset,
    [C.INSTRUMENT]: row.instrument,
    [C.TAKER_SIDE]: row.takerSide,
    [C.SIDE]: row.side || '',
    [C.TRANSACTION_QUANTITY]: row.transactionQuantity,
    ...(calc && { [C.TRADE_FEE]: getCalculatedExportValue(row, row.tradeFeeQuantity) }),
    ...(calc && { [C.NET_TRANSACTION_QUANTITY]: getCalculatedExportValue(row, row.netTransactionQuantity) }),
    [C.TRANSACTION_COST]: row.transactionCost,
    ...(calc && { [C.RUNNING_BALANCE]: getCalculatedExportValue(row, row.runningBalance) }),
    ...(calc && { [C.OFFCHAIN_BALANCE]: getCalculatedExportValue(row, row.offchainBalance) }),
    [C.PTAX_RATE]: getCalculatedExportValue(row, row.cambioBC),
    ...(calc && { [C.BRL_RUNNING_BALANCE]: getCalculatedExportValue(row, row.brlRunningBalance) }),
    ...(calc && { [C.USD_RUNNING_BALANCE]: getCalculatedExportValue(row, row.usdRunningBalance) }),
    ...(calc && { [C.USD_TRANSACTION_COST]: getCalculatedExportValue(row, row.usdTransactionCost) }),
    ...(calc && { [C.USD_AVG_PRICE]: getCalculatedExportValue(row, row.usdAveragePrice) }),
    ...(calc && { [C.BRL_COST_RATE]: getCalculatedExportValue(row, row.brlCostRate) }),
    ...(calc && { [C.BRL_TRANSACTION_COST]: getCalculatedExportValue(row, row.brlTransactionCost) }),
    ...(calc && { [C.BRL_AVG_PRICE]: getCalculatedExportValue(row, row.precoMedioCompra) }),
    ...(calc && { [C.BRL_PROFIT_LOSS]: getCalculatedExportValue(row, row.totalLucroPrejuizo) }),
    [C.INFO]: row.info,
    [C.AVG_PRICE_SEED]: raw?.avgPriceSeed ?? '',
    [C.USD_AVG_PRICE_SEED]: raw?.usdAvgPriceSeed ?? '',
    [C.USER_BRL_COST]: includeUserCosts ? raw?.userBrlCost ?? '' : '',
    [C.USER_USD_COST]: includeUserCosts ? raw?.userUsdCost ?? '' : '',
    [C.BALANCE_OVERRIDE]: raw?.balanceOverride ?? '',
    [C.JOURNAL_ID]: raw?.journalId ?? '',
    [C.ORDER_ID]: raw?.orderId ?? '',
    [C.TRADE_ID]: raw?.tradeId ?? '',
    [C.TRADE_MATCH_ID]: raw?.tradeMatchId ?? '',
    [C.CLIENT_ORDER_ID]: raw?.clientOrderId ?? '',
    [C.EXCHANGE]: row.exchangeName,
    [C.SOURCE_FILE]: row.sourceFileName,
  }

  return result
}

/**
 * Builds one backup CSV row directly from the original raw transaction.
 * Used when calculated fields are not included so derived table splits coalesce back to source rows.
 * @param raw - Raw source transaction to export
 * @param processed - Optional processed row that supplies display-only export values such as PTAX
 * @returns Plain object keyed by export CSV column name
 */
export function buildRawExportCsvRow(raw: CryptoComRow, processed?: ProcessedRow): ExportCsvRow {
  const C = EXPORT_CSV_COLUMNS
  const wallet = raw.wallet ?? Wallet.TRADING

  return {
    [C.ORDER]: raw.order,
    [C.TIME_UTC]: raw.timeUtc,
    [C.EVENT_DATE]: raw.eventDate,
    [C.JOURNAL_TYPE]: raw.journalType,
    [C.WALLET]: wallet,
    [C.ASSET]: processed?.asset ?? raw.asset ?? raw.instrument,
    [C.INSTRUMENT]: raw.instrument,
    [C.TAKER_SIDE]: raw.takerSide,
    [C.SIDE]: raw.side || '',
    [C.TRANSACTION_QUANTITY]: raw.transactionQuantity,
    [C.TRANSACTION_COST]: raw.transactionCost,
    [C.PTAX_RATE]: processed?.cambioBC ?? '',
    [C.INFO]: raw.info ?? '',
    [C.AVG_PRICE_SEED]: raw.avgPriceSeed ?? '',
    [C.USD_AVG_PRICE_SEED]: raw.usdAvgPriceSeed ?? '',
    [C.USER_BRL_COST]: raw.userBrlCost ?? '',
    [C.USER_USD_COST]: raw.userUsdCost ?? '',
    [C.BALANCE_OVERRIDE]: raw.balanceOverride ?? '',
    [C.JOURNAL_ID]: raw.journalId ?? '',
    [C.ORDER_ID]: raw.orderId ?? '',
    [C.TRADE_ID]: raw.tradeId ?? '',
    [C.TRADE_MATCH_ID]: raw.tradeMatchId ?? '',
    [C.CLIENT_ORDER_ID]: raw.clientOrderId ?? '',
    [C.EXCHANGE]: raw.exchangeName ?? processed?.exchangeName ?? '',
    [C.SOURCE_FILE]: raw.sourceFileName ?? processed?.sourceFileName ?? '',
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
    wallet: rawRow[C.WALLET]?.trim() === Wallet.EXTERNAL ? Wallet.EXTERNAL : Wallet.TRADING,
    exchangeName: rawRow[C.EXCHANGE]?.trim() || undefined,
    sourceFileName: rawRow[C.SOURCE_FILE]?.trim() || undefined,
    instrument: rawRow[C.INSTRUMENT]?.trim() || '',
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

  const avgSeedStr = rawRow[C.AVG_PRICE_SEED] || ''
  if (avgSeedStr.trim() !== '') {
    const avgSeedVal = avgSeedStr === 'true'
      ? cleanCsvNumber(rawRow[C.BRL_AVG_PRICE] || '')
      : cleanCsvNumber(avgSeedStr)
    if (avgSeedVal > 0) transaction.avgPriceSeed = avgSeedVal
  }

  const usdAvgSeedStr = rawRow[C.USD_AVG_PRICE_SEED] || ''
  if (usdAvgSeedStr.trim() !== '') {
    const usdAvgSeedVal = usdAvgSeedStr === 'true'
      ? cleanCsvNumber(rawRow[C.USD_AVG_PRICE] || '')
      : cleanCsvNumber(usdAvgSeedStr)
    if (usdAvgSeedVal > 0) transaction.usdAvgPriceSeed = usdAvgSeedVal
  }

  const brlCostStr = rawRow[C.USER_BRL_COST] || ''
  if (brlCostStr.trim() !== '') {
    transaction.userBrlCost = cleanCsvNumber(brlCostStr)
  }

  const usdCostStr = rawRow[C.USER_USD_COST] || ''
  if (usdCostStr.trim() !== '') {
    transaction.userUsdCost = cleanCsvNumber(usdCostStr)
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
