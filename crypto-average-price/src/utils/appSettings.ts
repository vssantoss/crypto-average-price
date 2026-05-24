import { createDefaultUsdAssetGroup, normalizeAssetGroups } from '../engine/assetGroups'
import { getVisibleStickyColumns, type AppSettings, type AssetGroup, type TableLayoutSettings } from '../types/app'

export type AppSettingsInput = Partial<AppSettings> & { usdMergeEnabled?: boolean }

/**
 * Default datatable column layout.
 */
export const defaultColumnLayout: TableLayoutSettings = {
  columnVisibility: {
    order: false,
    eventDate: false,
    wallet: false,
    takerSide: false,
    tradeFeeQuantity: false,
    transactionCost: false,
    exchangeName: false,
    sourceFileName: false,
  },
  stickyColumns: [],
}

/**
 * Default settings.
 */
export const defaultSettings: AppSettings = {
  assetGroups: [createDefaultUsdAssetGroup()],
  ...defaultColumnLayout,
  timezoneOffset: 0,
  roundBalance: false,
  panelExpanded: false,
}

/**
 * Restores asset groups from saved settings and migrates the removed USD merge toggle into a rule.
 * @param settings - Saved or imported app settings
 * @returns Normalized asset groups for the current settings schema
 */
export function restoreAssetGroups(settings: AppSettingsInput): AssetGroup[] {
  const restoredGroups = settings.assetGroups
  const hasSavedGroups = Array.isArray(restoredGroups)
  const defaultUsdGroup = createDefaultUsdAssetGroup()

  if (!hasSavedGroups) {
    return settings.usdMergeEnabled === false ? [] : [defaultUsdGroup]
  }

  const groups = restoredGroups

  if (settings.usdMergeEnabled === false) {
    return normalizeAssetGroups(groups)
  }

  const hasUsdGroup = groups.some(group =>
    group.assetName.trim().toUpperCase() === defaultUsdGroup.assetName.toUpperCase()
  )

  if (settings.usdMergeEnabled === true && !hasUsdGroup) {
    return normalizeAssetGroups([defaultUsdGroup, ...groups])
  }

  return normalizeAssetGroups(groups)
}

/**
 * Normalizes saved or imported settings against a base settings object.
 * @param settings - Settings values to apply
 * @param baseSettings - Existing settings used when a value is absent
 * @returns Complete app settings with normalized asset groups and sticky columns
 */
export function normalizeAppSettings(
  settings: AppSettingsInput,
  baseSettings: AppSettings = defaultSettings,
): AppSettings {
  const columnVisibility = {
    ...defaultSettings.columnVisibility,
    ...baseSettings.columnVisibility,
    ...settings.columnVisibility,
  }
  const stickyColumns = getVisibleStickyColumns(
    settings.stickyColumns ?? baseSettings.stickyColumns ?? defaultSettings.stickyColumns,
    columnVisibility,
  )
  const assetGroups = settings.assetGroups !== undefined || settings.usdMergeEnabled !== undefined
    ? restoreAssetGroups(settings)
    : normalizeAssetGroups(baseSettings.assetGroups)

  return {
    ...defaultSettings,
    ...baseSettings,
    ...settings,
    assetGroups,
    columnVisibility,
    stickyColumns,
    timezoneOffset: settings.timezoneOffset ?? baseSettings.timezoneOffset ?? defaultSettings.timezoneOffset,
    roundBalance: settings.roundBalance ?? baseSettings.roundBalance ?? defaultSettings.roundBalance,
    panelExpanded: settings.panelExpanded ?? baseSettings.panelExpanded ?? defaultSettings.panelExpanded,
  }
}
