import { createColumnHelper } from '@tanstack/react-table'
import type { ProcessedRow } from '../../types/transaction'
import { JournalType } from '../../types/transaction'
import { formatBrl, formatUsd, formatNumber } from '../../utils/number'
import { isUsdInstrument } from '../../engine/usdMerge'

/**
 * Checks whether the table should format an instrument as USD currency.
 * @param instrument - Instrument name from a processed row
 * @returns True when the instrument represents USD or merged USD
 */
function isUsdLike(instrument: string): boolean {
  return isUsdInstrument(instrument)
}

/**
 * Applies the configured timezone offset to a UTC timestamp string.
 * @param timeStr - UTC timestamp in MM/DD/YYYY HH:MM:SS format
 * @param offsetHours - Number of hours to offset
 * @returns Timestamp string after applying the offset, or the original string if invalid
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
 * Formats a BRL value using the current rounding preference.
 * @param value - BRL value to format
 * @param roundBalance - Whether compact 2-decimal formatting is enabled
 * @returns Formatted BRL string
 */
function formatRoundedBrl(value: number | null, roundBalance: boolean): string {
  return formatBrl(value, roundBalance ? 2 : 4)
}

const columnHelper = createColumnHelper<ProcessedRow>()

/**
 * Formats a row's linked trade metadata for display in the table.
 * @param row - Processed row with computed trade link fields
 * @returns Compact linked trade summary, or empty string when unlinked
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
 * All column definitions for the datatable.
 * Includes raw data columns and computed BRL columns.
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
      const instrument = info.row.original.instrument
      if (isUsdLike(instrument)) return formatUsd(info.getValue())
      return formatNumber(info.getValue(), roundBalance ? 2 : 8)
    },
    enableColumnFilter: false,
    meta: { numeric: true },
  }),
  columnHelper.accessor('cambioBC', {
    header: 'PTAX Rate',
    size: 110,
    cell: info => {
      const val = info.getValue()
      return val !== null ? `R$ ${val.toFixed(4)}` : ''
    },
    enableColumnFilter: false,
    meta: { numeric: true },
  }),
  columnHelper.accessor('brlRunningBalance', {
    header: 'BRL Balance',
    size: 140,
    cell: info => formatRoundedBrl(info.getValue(), roundBalance),
    enableColumnFilter: false,
    meta: { numeric: true },
  }),
  columnHelper.accessor('brlTransactionCost', {
    header: 'BRL Tx Cost',
    size: 140,
    cell: info => formatNumber(info.getValue(), roundBalance ? 2 : 4),
    enableColumnFilter: false,
    meta: { numeric: true },
  }),
  columnHelper.accessor('precoMedioCompra', {
    header: 'BRL Avg Price',
    size: 130,
    cell: info => formatRoundedBrl(info.getValue(), roundBalance),
    enableColumnFilter: false,
    meta: { editable: 'avgPrice' as const, numeric: true },
  }),
  columnHelper.accessor('totalLucroPrejuizo', {
    header: 'BRL Profit/Loss',
    size: 130,
    cell: info => {
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
 * Formats a JournalType enum value into a more readable display string.
 * @param type - The journal type to format
 * @returns Formatted string with underscores replaced by spaces
 */
function formatJournalType(type: JournalType): string {
  return type.replace(/_/g, ' ')
}
