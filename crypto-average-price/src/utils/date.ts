/**
 * Parses a Crypto.com date string (MM/DD/YYYY or MM/DD/YYYY HH:mm:ss) into an ISO date (YYYY-MM-DD).
 * @param dateStr - Date string from the Crypto.com CSV
 * @returns ISO date string (YYYY-MM-DD)
 */
export function parseCryptoComDate(dateStr: string): string {
  const parts = dateStr.trim().split(' ')[0].split('/')
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return ''
  const month = parts[0].padStart(2, '0')
  const day = parts[1].padStart(2, '0')
  const year = parts[2]
  return `${year}-${month}-${day}`
}

/**
 * Parses a PTAX date string (ddmmyyyy) into an ISO date (YYYY-MM-DD).
 * @param dateStr - Date string from the PTAX CSV (e.g., "02012025")
 * @returns ISO date string (YYYY-MM-DD)
 */
export function parsePtaxDate(dateStr: string): string {
  const day = dateStr.substring(0, 2)
  const month = dateStr.substring(2, 4)
  const year = dateStr.substring(4, 8)
  return `${year}-${month}-${day}`
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into a display-friendly format (MM/DD/YYYY).
 * @param isoDate - ISO date string
 * @returns Formatted date string
 */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${month}/${day}/${year}`
}

/**
 * Returns the previous calendar day as an ISO date string.
 * Used for PTAX weekend/holiday fallback.
 * @param isoDate - ISO date string (YYYY-MM-DD)
 * @returns ISO date string for the previous day
 */
export function getPreviousDay(isoDate: string): string {
  const date = new Date(isoDate + 'T12:00:00Z')
  if (isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().split('T')[0]
}
