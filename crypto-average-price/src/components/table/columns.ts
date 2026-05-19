import { createColumnHelper } from '@tanstack/react-table'
import type { ProcessedRow } from '../../types/transaction'
import { JournalType } from '../../types/transaction'
import { formatBrl, formatUsd, formatNumber } from '../../utils/number'
import { isUsdInstrument } from '../../engine/usdMerge'

/**
 * Applies a timezone offset to a UTC time string for display.
 * @param timeStr - Time string in MM/DD/YYYY HH:MM:SS format
 * @param offsetHours - Hours to add (e.g., -3 for BRT)
 * @returns Adjusted time string, or the original if offset is zero or format is invalid
 */
function applyTimezoneOffset(timeStr: string, offsetHours: number): string {
  if (!offsetHours || !timeStr) return timeStr
  const parts = timeStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (!parts) return timeStr
  const [, mo, d, y, h, mi, s] = parts
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
  date.setUTCHours(date.getUTCHours() + offsetHours)
  const oy = date.getUTCFullYear()
  const omo = String(date.getUTCMonth() + 1).padStart(2, '0')
  const od = String(date.getUTCDate()).padStart(2, '0')
  const oh = String(date.getUTCHours()).padStart(2, '0')
  const omi = String(date.getUTCMinutes()).padStart(2, '0')
  const os = String(date.getUTCSeconds()).padStart(2, '0')
  return `${omo}/${od}/${oy} ${oh}:${omi}:${os}`
}

/**
 * Formats a BRL value with rounding control.
 * @param value - BRL amount, or null
 * @param roundBalance - When true, rounds to 2 decimal places; otherwise 4
 * @returns Formatted BRL string
 */
function formatRoundedBrl(value: number | null, roundBalance: boolean): string {
  return formatBrl(value, roundBalance ? 2 : 4)
}

const columnHelper = createColumnHelper<ProcessedRow>()

/**
 * Checks whether a processed row should hide calculated table values.
 * @param row - Processed row to inspect
 * @returns True when calculated values should be blank for display
 */
function shouldHideCalculatedValue(row: ProcessedRow): boolean {
  return row.suppressCalculatedFields
}

/**
 * Formats a trade link summary string for display in the Trade Link column.
 * @param row - Processed row with trade link metadata
 * @returns Formatted trade link string, or empty string if not linked
 */
function formatTradeLink(row: ProcessedRow): string {
  if (!row.isTradeLinked) return ''

  const groupLabel = row.tradeGroupSource === 'inferred'
    ? row.tradeGroupId
    : `Trade group ${row.tradeGroupId}`
  const feeLabel = row.linkedFeeAmount !== null
    ? ` + fee ${formatNumber(row.linkedFeeAmount, 8)}${row.linkedFeeInstrument ? ` ${row.linkedFeeInstrument}` : ''}`
    : ''

  return `${groupLabel}: ${row.tradeLinkSummary}${feeLabel}`
}

/**
 * Creates the TanStack Table column definitions for the data table.
 * @param timezoneOffset - Hours offset from UTC for time display
 * @param roundBalance - Whether to round BRL values to 2 decimal places
 * @returns Array of column definitions
 */
export function createColumns(timezoneOffset: number, roundBalance: boolean = false) {
  return [
  columnHelper.accessor('order', {
    header: '#',
    size: 50,
    enableColumnFilter: false,
  }),
  columnHelper.accessor('timeUtc', {
    header: timezoneOffset === 0 ? 'Time (UTC)' : `Time (UTC${timezoneOffset > 0 ? '+' : ''}${timezoneOffset})`,
    size: 160,
    cell: info => applyTimezoneOffset(info.getValue(), timezoneOffset),
  }),
  columnHelper.accessor('eventDate', {
    header: 'Event Date',
    size: 100,
  }),
  columnHelper.accessor('journalType', {
    header: 'Journal Type',
    size: 170,
    cell: info => formatJournalType(info.getValue()),
    meta: { filterType: 'combo' as const },
  }),
  columnHelper.accessor('instrument', {
    header: 'Instrument',
    size: 130,
    meta: { filterType: 'combo' as const },
  }),
  columnHelper.accessor('takerSide', {
    header: 'Taker Side',
    size: 90,
    meta: { filterType: 'combo' as const },
  }),
  columnHelper.accessor('side', {
    header: 'Side',
    size: 100,
    cell: info => info.getValue() || '',
    meta: { filterType: 'combo' as const },
  }),
  columnHelper.accessor('transactionQuantity', {
    header: 'Tx Quantity',
    size: 130,
    cell: info => formatNumber(info.getValue(), 8),
    meta: { numeric: true },
  }),
  columnHelper.accessor('tradeFeeQuantity', {
    header: 'Trade Fee',
    size: 120,
    cell: info => {
      if (shouldHideCalculatedValue(info.row.original)) return ''
      const value = info.getValue()
      return value > 0 ? formatNumber(value, 8) : ''
    },
    enableColumnFilter: false,
    meta: { numeric: true },
  }),
  columnHelper.accessor('netTransactionQuantity', {
    header: 'Net Tx Quantity',
    size: 140,
    cell: info => shouldHideCalculatedValue(info.row.original) ? '' : formatNumber(info.getValue(), 8),
    meta: { numeric: true },
  }),
  columnHelper.accessor('transactionCost', {
    header: 'Tx Cost',
    size: 120,
    cell: info => formatNumber(info.getValue(), 8),
    meta: { numeric: true },
  }),
  columnHelper.accessor('runningBalance', {
    header: 'Running Balance',
    size: 140,
    cell: info => {
      if (shouldHideCalculatedValue(info.row.original)) return ''
      const instrument = info.row.original.instrument
      if (isUsdInstrument(instrument)) return formatUsd(info.getValue())
      return formatNumber(info.getValue(), roundBalance ? 2 : 8)
    },
    enableColumnFilter: false,
    meta: { numeric: true },
  }),
  columnHelper.accessor('cambioBC', {
    header: 'PTAX Rate',
    size: 110,
    cell: info => shouldHideCalculatedValue(info.row.original) ? '' : formatBrl(info.getValue(), 4),
    enableColumnFilter: false,
    meta: { numeric: true },
  }),
  columnHelper.accessor('brlRunningBalance', {
    header: 'BRL Balance',
    size: 140,
    cell: info => shouldHideCalculatedValue(info.row.original) ? '' : formatRoundedBrl(info.getValue(), roundBalance),
    enableColumnFilter: false,
    meta: { numeric: true },
  }),
  columnHelper.accessor('brlTransactionCost', {
    header: 'BRL Tx Cost',
    size: 140,
    cell: info => shouldHideCalculatedValue(info.row.original) ? '' : formatNumber(info.getValue(), roundBalance ? 2 : 4),
    enableColumnFilter: false,
    meta: { numeric: true },
  }),
  columnHelper.accessor('precoMedioCompra', {
    header: 'BRL Avg Price',
    size: 130,
    cell: info => shouldHideCalculatedValue(info.row.original) ? '' : formatRoundedBrl(info.getValue(), roundBalance),
    enableColumnFilter: false,
    meta: { editable: 'avgPrice' as const, numeric: true },
  }),
  columnHelper.accessor('totalLucroPrejuizo', {
    header: 'BRL Profit/Loss',
    size: 130,
    cell: info => {
      if (shouldHideCalculatedValue(info.row.original)) return ''
      const val = info.getValue()
      return formatRoundedBrl(val, roundBalance)
    },
    enableColumnFilter: false,
    meta: { numeric: true },
  }),
  columnHelper.accessor('info', {
    header: 'Info',
    size: 400,
    meta: { editable: 'info' as const },
  }),
  columnHelper.accessor('tradeLinkSummary', {
    header: 'Trade Link',
    size: 360,
    cell: info => formatTradeLink(info.row.original),
    meta: { filterType: 'combo' as const },
  }),
  columnHelper.accessor('exchangeName', {
    header: 'Exchange',
    size: 130,
    meta: { filterType: 'combo' as const },
  }),
  columnHelper.accessor('sourceFileName', {
    header: 'Source File',
    size: 180,
    meta: { filterType: 'combo' as const },
  }),
  ]
}

/**
 * Formats a JournalType enum value for display by replacing underscores with spaces.
 * @param type - Journal type enum value
 * @returns Human-readable journal type string
 */
function formatJournalType(type: JournalType): string {
  return type.replace(/_/g, ' ')
}
