/**
 * A single PTAX entry from the BCB exchange rate CSV.
 */
export interface PtaxEntry {
  date: string
  buyRate: number
  sellRate: number
}

/**
 * Map from ISO date string (YYYY-MM-DD) to the PTAX venda (sell) rate.
 */
export type PtaxMap = Map<string, number>
