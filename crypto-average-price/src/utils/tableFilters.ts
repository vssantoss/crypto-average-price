import type { TableFilterState, TableFilterValue } from '../types/app'

/**
 * Checks whether a value is a non-array object.
 * @param value - Value to inspect
 * @returns True when the value is a plain record-like object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Checks whether a value is an array containing only strings.
 * @param value - Value to inspect
 * @returns True when every array entry is a string
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/**
 * Checks whether an unknown filter value can be persisted in the browser session.
 * @param value - Raw table filter value
 * @returns True when the filter value matches the app's serializable filter shapes
 */
function isSerializableTableFilterValue(value: unknown): value is TableFilterValue {
  if (typeof value === 'string') return true
  if (isStringArray(value)) return true
  if (!isRecord(value)) return false

  const hasValues = value.values !== undefined
  const hasText = value.text !== undefined
  if (!hasValues && !hasText) return false
  return (!hasValues || isStringArray(value.values)) && (!hasText || typeof value.text === 'string')
}

/**
 * Normalizes a stored table filter value to supported serializable shapes.
 * @param value - Unknown persisted filter value
 * @returns Valid table filter value, or null when unsupported
 */
function normalizeTableFilterValue(value: unknown): TableFilterValue | null {
  if (typeof value === 'string') return value
  if (isStringArray(value)) return value
  if (!isRecord(value)) return null

  const normalized: { values?: string[]; text?: string } = {}
  if (isStringArray(value.values)) normalized.values = value.values
  if (typeof value.text === 'string') normalized.text = value.text

  return Object.keys(normalized).length > 0 ? normalized : null
}

/**
 * Converts table filter state into the serializable browser-session filter shape.
 * @param filters - Current table column filters
 * @returns Filters that can be persisted safely in session storage
 */
export function toSerializableTableFilters(filters: { id: string; value: unknown }[]): TableFilterState[] {
  return filters.flatMap(filter => {
    if (!isSerializableTableFilterValue(filter.value)) return []
    return [{ id: filter.id, value: filter.value }]
  })
}

/**
 * Normalizes stored table filters, dropping entries with unsupported shapes.
 * @param filters - Unknown persisted table filters value
 * @returns Valid serializable table filter state
 */
export function normalizeTableFilters(filters: unknown): TableFilterState[] {
  if (!Array.isArray(filters)) return []

  return filters.flatMap(filter => {
    if (!isRecord(filter) || typeof filter.id !== 'string') return []
    const value = normalizeTableFilterValue(filter.value)
    return value === null ? [] : [{ id: filter.id, value }]
  })
}
