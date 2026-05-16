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
 * Application settings that persist across sessions.
 */
export interface AppSettings {
  usdMergeEnabled: boolean
  selectedInstrument: string | null
  columnVisibility: Record<string, boolean>
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
