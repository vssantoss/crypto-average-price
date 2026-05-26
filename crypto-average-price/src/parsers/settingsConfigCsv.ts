import { normalizeAssetGroups } from '../engine/assetGroups'
import type { AppSettings, AssetGroup } from '../types/app'
import { normalizeTimezone, timezoneFromOffset } from '../utils/timezone'
import { EXPORT_CSV_COLUMNS } from './exportSchema'

const CONFIG_VERSION = 1

export const CONFIG_JOURNAL_TYPE = 'CONFIG'
export const CONFIG_KEYS = {
  TABLE_LAYOUT: 'tableLayout',
  DISPLAY_PREFERENCES: 'displayPreferences',
  UI_STATE: 'uiState',
  ASSET_GROUPS: 'assetGroups',
} as const

type ExportConfigCsvRow = Record<string, string | number>

export interface ParsedSettingsConfig {
  settings: Partial<AppSettings>
  hasAnySettings: boolean
  hasAssetGroups: boolean
}

/**
 * Checks whether a value is a non-array object.
 * @param value - Value to inspect
 * @returns True when the value is a plain record-like object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Checks whether a config payload uses the supported version.
 * @param payload - Parsed JSON payload to inspect
 * @returns True when the payload is an object with the current config version
 */
function hasSupportedVersion(payload: unknown): payload is Record<string, unknown> {
  return isRecord(payload) && payload.version === CONFIG_VERSION
}

/**
 * Checks whether a value is a string array.
 * @param value - Value to inspect
 * @returns True when every item is a string
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/**
 * Parses a JSON settings payload without throwing.
 * @param value - Raw Info column value
 * @returns Parsed JSON value, or null when parsing fails
 */
function parseJsonPayload(value: string): unknown | null {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Copies boolean column visibility values from an unknown object.
 * @param value - Potential column visibility payload
 * @returns Column visibility map, or null when invalid
 */
function parseColumnVisibility(value: unknown): Record<string, boolean> | null {
  if (!isRecord(value)) return null
  const entries = Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

/**
 * Parses asset groups from a config payload.
 * @param value - Potential asset group array
 * @returns Normalized asset groups, or null when the payload is not an array
 */
function parseAssetGroups(value: unknown): AssetGroup[] | null {
  if (!Array.isArray(value)) return null

  const groups = value.flatMap(group => {
    if (!isRecord(group)) return []
    if (typeof group.assetName !== 'string') return []
    if (!isStringArray(group.instruments)) return []

    return [{
      assetName: group.assetName,
      instruments: group.instruments,
      enabled: typeof group.enabled === 'boolean' ? group.enabled : true,
    }]
  })

  return normalizeAssetGroups(groups)
}

/**
 * Builds an empty CSV row with the requested export columns present.
 * @param columns - CSV columns used by the current export mode
 * @returns Blank export row object
 */
function createBlankConfigRow(columns: string[]): ExportConfigCsvRow {
  return Object.fromEntries(columns.map(column => [column, '']))
}

/**
 * Builds one config CSV row for a settings group.
 * @param key - Config group key stored in the Asset column
 * @param payload - JSON-serializable payload stored in the Info column
 * @param columns - CSV columns used by the current export mode
 * @returns CSV row object with the reserved CONFIG journal type
 */
function buildConfigRow(key: string, payload: Record<string, unknown>, columns: string[]): ExportConfigCsvRow {
  return {
    ...createBlankConfigRow(columns),
    [EXPORT_CSV_COLUMNS.JOURNAL_TYPE]: CONFIG_JOURNAL_TYPE,
    [EXPORT_CSV_COLUMNS.ASSET]: key,
    [EXPORT_CSV_COLUMNS.INFO]: JSON.stringify({ version: CONFIG_VERSION, ...payload }),
  }
}

/**
 * Builds grouped settings config rows for an export.
 * @param settings - Current app settings to serialize
 * @param columns - CSV columns used by the current export mode
 * @returns CSV rows containing grouped settings payloads
 */
export function buildSettingsConfigRows(settings: AppSettings, columns: string[]): ExportConfigCsvRow[] {
  return [
    buildConfigRow(CONFIG_KEYS.TABLE_LAYOUT, {
      columnVisibility: settings.columnVisibility,
      stickyColumns: settings.stickyColumns,
    }, columns),
    buildConfigRow(CONFIG_KEYS.DISPLAY_PREFERENCES, {
      timezone: settings.timezone,
      roundBalance: settings.roundBalance,
    }, columns),
    buildConfigRow(CONFIG_KEYS.UI_STATE, {
      panelExpanded: settings.panelExpanded,
    }, columns),
    buildConfigRow(CONFIG_KEYS.ASSET_GROUPS, {
      groups: settings.assetGroups,
    }, columns),
  ]
}

/**
 * Checks whether a raw CSV row is a reserved app config row.
 * @param rawRow - Parsed CSV row
 * @returns True when the row uses the CONFIG journal type
 */
export function isSettingsConfigRow(rawRow: Record<string, string>): boolean {
  return rawRow[EXPORT_CSV_COLUMNS.JOURNAL_TYPE]?.trim().toUpperCase() === CONFIG_JOURNAL_TYPE
}

/**
 * Parses known grouped settings config rows from an exported CSV.
 * @param rows - Raw parsed CSV rows
 * @returns Parsed settings values and flags describing which config groups were found
 */
export function parseSettingsConfigRows(rows: Record<string, string>[]): ParsedSettingsConfig {
  const settings: Partial<AppSettings> = {}
  let hasAssetGroups = false

  for (const rawRow of rows) {
    if (!isSettingsConfigRow(rawRow)) continue

    const key = rawRow[EXPORT_CSV_COLUMNS.ASSET]?.trim()
    const payload = parseJsonPayload(rawRow[EXPORT_CSV_COLUMNS.INFO] ?? '')
    if (!hasSupportedVersion(payload)) continue

    if (key === CONFIG_KEYS.TABLE_LAYOUT) {
      const columnVisibility = parseColumnVisibility(payload.columnVisibility)
      if (columnVisibility) settings.columnVisibility = columnVisibility
      if (isStringArray(payload.stickyColumns)) settings.stickyColumns = payload.stickyColumns
    }

    if (key === CONFIG_KEYS.DISPLAY_PREFERENCES) {
      if (typeof payload.timezone === 'string') {
        settings.timezone = normalizeTimezone(payload.timezone)
      } else if (typeof payload.timezoneOffset === 'number' && Number.isFinite(payload.timezoneOffset)) {
        settings.timezone = timezoneFromOffset(payload.timezoneOffset)
      }
      if (typeof payload.roundBalance === 'boolean') settings.roundBalance = payload.roundBalance
    }

    if (key === CONFIG_KEYS.UI_STATE && typeof payload.panelExpanded === 'boolean') {
      settings.panelExpanded = payload.panelExpanded
    }

    if (key === CONFIG_KEYS.ASSET_GROUPS) {
      const assetGroups = parseAssetGroups(payload.groups)
      if (assetGroups) {
        settings.assetGroups = assetGroups
        hasAssetGroups = true
      }
    }
  }

  return {
    settings,
    hasAnySettings: Object.keys(settings).length > 0,
    hasAssetGroups,
  }
}
