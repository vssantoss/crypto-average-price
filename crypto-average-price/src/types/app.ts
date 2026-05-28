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

/**
 * Serializable table filter value shapes supported by the table UI.
 */
export type TableFilterValue = string | string[] | {
  values?: string[]
  text?: string
}

/**
 * Serializable table filter state persisted in the browser session.
 */
export interface TableFilterState {
  id: string
  value: TableFilterValue
}

/**
 * User-defined group of exchange-reported instruments that calculate as one asset.
 */
export interface AssetGroup {
  assetName: string
  instruments: string[]
  enabled: boolean
}

/**
 * Application settings that persist across sessions.
 */
export interface AppSettings extends TableLayoutSettings {
  assetGroups: AssetGroup[]
  timezone: string
  roundBalance: boolean
  panelExpanded: boolean
}

/**
 * Filters sticky column ids down to columns that are currently visible.
 * @param stickyColumns - Column ids configured as sticky
 * @param columnVisibility - Column visibility map where false means hidden
 * @returns Sticky column ids that are still visible
 */
export function getVisibleStickyColumns(
  stickyColumns: string[],
  columnVisibility: Record<string, boolean>,
): string[] {
  return stickyColumns.filter(column => columnVisibility[column] !== false)
}

/**
 * Instruments included in the default USD stablecoin asset group.
 */
export const USD_INSTRUMENTS = ['USD', 'USDC', 'USDT', 'USD_Stable_Coin']

/**
 * The default USD stablecoin asset group name.
 */
export const MERGED_USD_NAME = 'USD (merged)'
