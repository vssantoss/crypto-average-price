/**
 * Summary statistics for a single coin/instrument.
 */
export interface CoinSummary {
  instrument: string
  currentBalance: number
  averagePrice: number | null
  totalBrlInvested: number | null
  brlBalance: number | null
}

/**
 * Synthetic datatable column id for the edit/delete action gutter.
 */
export const TABLE_ACTIONS_COLUMN_ID = '__rowActions'

/**
 * Column layout options used by the datatable.
 */
export interface TableLayoutSettings {
  columnVisibility: Record<string, boolean>
  stickyColumns: string[]
}

export function getVisibleStickyColumns(
  stickyColumns: string[],
  columnVisibility: Record<string, boolean>,
): string[] {
  return stickyColumns.filter(column => columnVisibility[column] !== false)
}

/**
 * Application settings that persist across sessions.
 */
export interface AppSettings extends TableLayoutSettings {
  usdMergeEnabled: boolean
  selectedInstrument: string | null
  timezoneOffset: number
  roundBalance: boolean
  panelExpanded: boolean
}

/**
 * Instruments that should be merged when the USD merge toggle is ON.
 */
export const USD_INSTRUMENTS = ['USD', 'USDC', 'USDT', 'USD_Stable_Coin']

/**
 * The merged instrument name when USD merge is enabled.
 */
export const MERGED_USD_NAME = 'USD (merged)'
