/**
 * Parses a Brazilian-format number string (comma as decimal separator) into a number.
 * @param str - Number string with comma decimal (e.g., "5,7648")
 * @returns Parsed number value
 */
export function parseBrlNumber(str: string): number {
  return parseFloat(str.replace(',', '.'))
}

/**
 * Cleans a CSV number value that may contain formatting characters.
 * Handles values like " $1,064.61 ", "R$ 5,373.7716", "-R$ 849.6000".
 * @param str - Formatted number string from CSV
 * @returns Parsed number value, or 0 if unparseable
 */
export function cleanCsvNumber(str: string): number {
  if (!str || str.trim() === '' || str.trim() === 'R$ -' || str.trim() === '-') {
    return 0
  }
  const cleaned = str
    .replace(/[$R\s]/g, '')
    .replace(/,(\d{3})/g, '$1') // remove thousands separator commas
    .trim()
  const value = parseFloat(cleaned)
  return isNaN(value) ? 0 : value
}

/**
 * Formats a number as Brazilian Real currency (R$ X.XXXX).
 * @param value - Number to format, or null
 * @param decimals - Number of decimal places (default 4)
 * @returns Formatted BRL string, or empty string if null
 */
export function formatBrl(value: number | null, decimals: number = 4): string {
  if (value === null || value === undefined) return ''
  const prefix = value < 0 ? '-R$ ' : 'R$ '
  return prefix + Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Formats a number as USD currency ($ X.XX).
 * @param value - Number to format, or null
 * @param decimals - Number of decimal places (default 2)
 * @returns Formatted USD string, or empty string if null
 */
export function formatUsd(value: number | null, decimals: number = 2): string {
  if (value === null || value === undefined) return ''
  const prefix = value < 0 ? '-$' : '$'
  return prefix + Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Formats a plain number with a given number of decimal places.
 * @param value - Number to format, or null
 * @param decimals - Number of decimal places (default 8)
 * @returns Formatted number string, or empty string if null
 */
export function formatNumber(value: number | null, decimals: number = 8): string {
  if (value === null || value === undefined) return ''
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
