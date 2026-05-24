import type { AssetGroup } from '../types/app'
import type { CryptoComRow } from '../types/transaction'
import { MERGED_USD_NAME, USD_INSTRUMENTS } from '../types/app'
import { isUsdInstrument } from './usdMerge'

const QUANTITY_MATCH_TOLERANCE = 0.00000001

export interface AssetSuggestion {
  assetName: string
  instruments: string[]
}

/**
 * Creates the default asset group that replaces the previous USD merge toggle.
 * @returns Enabled default USD stablecoin asset group
 */
export function createDefaultUsdAssetGroup(): AssetGroup {
  return {
    assetName: MERGED_USD_NAME,
    instruments: [...USD_INSTRUMENTS],
    enabled: true,
  }
}

/**
 * Converts an instrument or asset name into a case-insensitive lookup key.
 * @param value - Raw instrument or asset name
 * @returns Trimmed uppercase key
 */
export function assetLookupKey(value: string): string {
  return value.trim().toUpperCase()
}

/**
 * Normalizes a list of instrument names for storage and comparison.
 * @param instruments - Raw instrument names
 * @returns Unique trimmed instrument names sorted alphabetically
 */
export function normalizeAssetInstruments(instruments: string[]): string[] {
  const byKey = new Map<string, string>()
  for (const instrument of instruments) {
    const trimmed = instrument.trim()
    if (!trimmed) continue
    const key = assetLookupKey(trimmed)
    if (!byKey.has(key)) byKey.set(key, trimmed)
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b))
}

/**
 * Normalizes asset groups by trimming names, deduplicating instruments, and removing invalid entries.
 * @param groups - Raw asset group settings
 * @returns Clean asset groups ready for persistence or calculation
 */
export function normalizeAssetGroups(groups: AssetGroup[]): AssetGroup[] {
  const result: AssetGroup[] = []
  const usedAssetNames = new Set<string>()
  const usedInstruments = new Set<string>()

  for (const group of groups) {
    const assetName = group.assetName.trim()
    const assetKey = assetLookupKey(assetName)
    if (!assetName || usedAssetNames.has(assetKey)) continue

    const instruments = normalizeAssetInstruments(group.instruments)
      .filter(instrument => {
        const instrumentKey = assetLookupKey(instrument)
        if (usedInstruments.has(instrumentKey)) return false
        usedInstruments.add(instrumentKey)
        return true
      })

    if (instruments.length === 0) continue
    usedAssetNames.add(assetKey)
    result.push({ assetName, instruments, enabled: group.enabled ?? true })
  }

  return result
}

/**
 * Builds a lookup from reported instrument name to calculation asset name.
 * @param assetGroups - User-defined asset groups
 * @param enabledOnly - Whether to include only rules enabled for calculations
 * @returns Map keyed by normalized instrument name
 */
export function buildAssetLookup(assetGroups: AssetGroup[], enabledOnly: boolean): Map<string, string> {
  const lookup = new Map<string, string>()

  for (const group of normalizeAssetGroups(assetGroups)) {
    if (enabledOnly && !group.enabled) continue
    for (const instrument of group.instruments) {
      lookup.set(assetLookupKey(instrument), group.assetName)
    }
  }

  return lookup
}

/**
 * Derives the calculation asset name for a reported instrument.
 * @param instrument - Exchange-reported instrument name
 * @param lookup - Asset lookup from reported instrument to asset name
 * @returns Calculation asset name
 */
export function getAssetForInstrument(instrument: string, lookup: Map<string, string>): string {
  const trimmed = instrument.trim()
  return lookup.get(assetLookupKey(trimmed)) ?? trimmed
}

/**
 * Adds derived calculation assets to raw rows without changing their reported instruments.
 * @param rows - Raw transaction rows
 * @param assetGroups - User-defined asset groups
 * @param assetGroups - User-defined asset groups
 * @returns New row objects with asset populated
 */
export function applyAssetGroups(
  rows: CryptoComRow[],
  assetGroups: AssetGroup[],
): CryptoComRow[] {
  const displayLookup = buildAssetLookup(assetGroups, false)
  const calculationLookup = buildAssetLookup(assetGroups, true)
  return suppressInternalAssetMovements(
    rows.map(row => ({
      ...row,
      asset: getAssetForInstrument(row.instrument, displayLookup),
      calculationAsset: getAssetForInstrument(row.instrument, calculationLookup),
    })),
  )
}

/**
 * Extracts unique asset names from rows that already have derived assets.
 * @param rows - Rows with optional asset names
 * @returns Sorted unique asset names
 */
export function getUniqueAssets(rows: CryptoComRow[]): string[] {
  const assets = new Set<string>()
  for (const row of rows) {
    assets.add(row.calculationAsset || row.instrument)
  }
  return Array.from(assets).sort((a, b) => a.localeCompare(b))
}

/**
 * Checks whether an asset bucket represents USD-like instruments.
 * @param asset - Asset name
 * @param rows - Rows in that asset bucket
 * @returns True when the asset should use stablecoin display/calculation behavior
 */
export function isUsdAsset(asset: string, rows: CryptoComRow[]): boolean {
  return isUsdInstrument(asset) || rows.some(row => isUsdInstrument(row.instrument))
}

/**
 * Checks whether a trade row moves value between instruments inside one asset.
 * @param row - Transaction row to inspect
 * @param rows - Rows in the same asset bucket
 * @returns True when the row is one side of an internal asset trade
 */
export function isInternalAssetTrade(row: CryptoComRow, rows: CryptoComRow[]): boolean {
  if (String(row.journalType) !== 'TRADING' || row.side === null) return false

  return rows.some(match => {
    if (match.order === row.order) return false
    if (String(match.journalType) !== 'TRADING' || match.side === null || match.side === row.side) return false
    if (match.instrument === row.instrument) return false

    if (row.tradeMatchId && row.tradeMatchId !== '0' && match.tradeMatchId === row.tradeMatchId) {
      return true
    }

    const rowQuantity = Math.abs(row.transactionQuantity)
    const matchQuantity = Math.abs(match.transactionQuantity)
    const quantitiesMatch = Math.abs(rowQuantity - matchQuantity) <= Math.max(rowQuantity, matchQuantity) * 0.005
    return row.timeUtc === match.timeUtc && quantitiesMatch
  })
}

/**
 * Builds asset groups from exported row asset/instrument pairs.
 * @param pairs - Asset and instrument pairs parsed from a backup CSV
 * @returns Asset groups that carry non-default grouping information
 */
export function buildAssetGroupsFromPairs(pairs: Array<{ asset: string; instrument: string }>): AssetGroup[] {
  const byAsset = new Map<string, { assetName: string; instruments: Map<string, string>; hasRename: boolean }>()

  for (const pair of pairs) {
    const asset = pair.asset.trim()
    const instrument = pair.instrument.trim()
    if (!asset || !instrument) continue

    const assetKey = assetLookupKey(asset)
    const entry = byAsset.get(assetKey) ?? {
      assetName: asset,
      instruments: new Map<string, string>(),
      hasRename: false,
    }
    entry.instruments.set(assetLookupKey(instrument), instrument)
    if (assetLookupKey(asset) !== assetLookupKey(instrument)) entry.hasRename = true
    byAsset.set(assetKey, entry)
  }

  const groups: AssetGroup[] = []
  for (const entry of byAsset.values()) {
    const instruments = Array.from(entry.instruments.values()).sort((a, b) => a.localeCompare(b))
    if (instruments.length > 1 || entry.hasRename) {
      groups.push({ assetName: entry.assetName, instruments, enabled: true })
    }
  }
  return groups.sort((a, b) => a.assetName.localeCompare(b.assetName))
}

/**
 * Suggests asset groups from same-time equal-and-opposite internal instrument movements.
 * @param rows - Raw transaction rows
 * @param existingGroups - Already configured asset groups
 * @returns Suggested asset groups that are not already configured
 */
export function suggestAssetGroups(rows: CryptoComRow[], existingGroups: AssetGroup[]): AssetSuggestion[] {
  const existingInstrumentKeys = new Set(
    normalizeAssetGroups(existingGroups).flatMap(group => group.instruments.map(assetLookupKey)),
  )
  const suggestions = new Map<string, AssetSuggestion>()

  for (let i = 0; i < rows.length; i++) {
    const current = rows[i]
    if (!canBeInternalAssetMovement(current)) continue

    for (let j = i + 1; j < rows.length; j++) {
      const candidate = rows[j]
      if (candidate.timeUtc !== current.timeUtc) break
      if (!canBeInternalAssetMovement(candidate)) continue
      if (candidate.journalType !== current.journalType) continue
      if ((candidate.exchangeName ?? '') !== (current.exchangeName ?? '')) continue
      if ((candidate.sourceFileName ?? '') !== (current.sourceFileName ?? '')) continue
      if (candidate.instrument === current.instrument) continue
      if (Math.abs(current.transactionQuantity + candidate.transactionQuantity) > QUANTITY_MATCH_TOLERANCE) continue

      const instruments = normalizeAssetInstruments([current.instrument, candidate.instrument])
      if (instruments.some(instrument => existingInstrumentKeys.has(assetLookupKey(instrument)))) continue

      const assetName = inferSuggestedAssetName(instruments)
      const key = instruments.map(assetLookupKey).join('|')
      if (!suggestions.has(key)) suggestions.set(key, { assetName, instruments })
    }
  }

  return Array.from(suggestions.values()).sort((a, b) => a.assetName.localeCompare(b.assetName))
}

/**
 * Checks whether a row can be one side of an internal asset movement.
 * @param row - Row to inspect
 * @returns True when the row has no trade side and a non-zero quantity
 */
function canBeInternalAssetMovement(row: CryptoComRow): boolean {
  return row.side === null && Math.abs(row.transactionQuantity) > QUANTITY_MATCH_TOLERANCE
}

/**
 * Zeros calculation quantities for same-asset movements that only change reported instrument labels.
 * @param rows - Rows with derived assets
 * @returns Rows with internal asset movement quantities neutralized for calculations
 */
function suppressInternalAssetMovements(rows: CryptoComRow[]): CryptoComRow[] {
  const suppressedOrders = new Set<number>()

  for (let i = 0; i < rows.length; i++) {
    const current = rows[i]
    if (!canBeInternalAssetMovement(current)) continue

    for (let j = i + 1; j < rows.length; j++) {
      const candidate = rows[j]
      if (candidate.timeUtc !== current.timeUtc) break
      if (!canBeInternalAssetMovement(candidate)) continue
      if (candidate.journalType !== current.journalType) continue
      if ((candidate.calculationAsset || candidate.instrument) !== (current.calculationAsset || current.instrument)) continue
      if ((candidate.exchangeName ?? '') !== (current.exchangeName ?? '')) continue
      if ((candidate.sourceFileName ?? '') !== (current.sourceFileName ?? '')) continue
      if (candidate.instrument === current.instrument) continue
      if (Math.abs(current.transactionQuantity + candidate.transactionQuantity) > QUANTITY_MATCH_TOLERANCE) continue

      suppressedOrders.add(current.order)
      suppressedOrders.add(candidate.order)
      break
    }
  }

  if (suppressedOrders.size === 0) return rows
  return rows.map(row => suppressedOrders.has(row.order)
    ? { ...row, transactionQuantity: 0, transactionCost: 0 }
    : row
  )
}

/**
 * Infers a concise default asset name for a suggested instrument group.
 * @param instruments - Instruments that likely represent the same asset
 * @returns Suggested asset name
 */
function inferSuggestedAssetName(instruments: string[]): string {
  const sorted = [...instruments].sort((a, b) => a.length - b.length)
  const shortest = sorted[0]
  const match = shortest.match(/^(.+?)(?:[._-]?STAKED)$/i)
  if (match) return match[1]

  const contained = sorted.find(candidate =>
    instruments.every(instrument => assetLookupKey(instrument).includes(assetLookupKey(candidate))),
  )
  return contained ?? shortest
}
