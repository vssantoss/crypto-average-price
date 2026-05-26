export const DEFAULT_TIMEZONE = 'UTC'

const OFFSET_TIMEZONE_MAP = new Map<number, string>([
  [0, 'UTC'],
  [-3, 'America/Sao_Paulo'],
  [-4, 'America/New_York'],
  [-5, 'America/New_York'],
  [-6, 'America/Chicago'],
  [-7, 'America/Denver'],
  [-8, 'America/Los_Angeles'],
  [1, 'Europe/Lisbon'],
  [8, 'Asia/Singapore'],
  [9, 'Asia/Tokyo'],
])

interface DateTimeParts {
  y: number
  mo: number
  d: number
  h: number
  mi: number
  s: number
}

/**
 * Checks whether a value is a browser-supported IANA timezone id.
 * @param timezone - Timezone value to validate
 * @returns True when Intl can format dates in the timezone
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    return true
  } catch {
    return false
  }
}

/**
 * Converts a legacy numeric UTC offset to a representative IANA timezone id.
 * @param offset - Legacy offset in hours from UTC
 * @returns Representative timezone id for the offset
 */
export function timezoneFromOffset(offset: number): string {
  return OFFSET_TIMEZONE_MAP.get(offset) ?? DEFAULT_TIMEZONE
}

/**
 * Normalizes an unknown persisted timezone setting to a supported timezone id.
 * @param timezone - Persisted or imported timezone value
 * @param fallback - Fallback timezone when the value is invalid
 * @returns Valid timezone id
 */
export function normalizeTimezone(timezone: unknown, fallback = DEFAULT_TIMEZONE): string {
  if (typeof timezone !== 'string') return fallback
  const trimmed = timezone.trim()
  return trimmed && isValidTimezone(trimmed) ? trimmed : fallback
}

/**
 * Parses a date/time string in 24h or 12h format into component parts.
 * @param value - Date/time string in MM/DD/YYYY HH:MM:SS format, with optional AM/PM
 * @returns Parsed date components, or null when the format is invalid
 */
export function parseDateTimeParts(value: string): DateTimeParts | null {
  const str = value.trim()
  let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
  if (match) {
    const [, mo, d, y, h, mi, s] = match.map(Number)
    return { y, mo, d, h, mi, s }
  }

  match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null

  const [, moS, dS, yS, hS, miS, sS, ampm] = match
  let h = Number(hS)
  if (h < 1 || h > 12) return null
  if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12
  if (ampm.toUpperCase() === 'AM' && h === 12) h = 0

  return {
    y: Number(yS),
    mo: Number(moS),
    d: Number(dS),
    h,
    mi: Number(miS),
    s: Number(sS),
  }
}

/**
 * Formats date/time parts in the app's CSV and table timestamp format.
 * @param parts - Date/time components to format
 * @returns Date/time string in MM/DD/YYYY HH:MM:SS format
 */
export function formatDateTimeParts(parts: DateTimeParts): string {
  const mo = String(parts.mo).padStart(2, '0')
  const d = String(parts.d).padStart(2, '0')
  const h = String(parts.h).padStart(2, '0')
  const mi = String(parts.mi).padStart(2, '0')
  const s = String(parts.s).padStart(2, '0')
  return `${mo}/${d}/${parts.y} ${h}:${mi}:${s}`
}

/**
 * Parses a stored UTC timestamp string into a Date object.
 * @param timeUtc - UTC timestamp in MM/DD/YYYY HH:MM:SS format
 * @returns Date for the UTC instant, or null when invalid
 */
export function parseUtcTimeString(timeUtc: string): Date | null {
  const parts = parseDateTimeParts(timeUtc)
  if (!parts) return null
  const date = new Date(Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s))
  const valid = date.getUTCFullYear() === parts.y &&
    date.getUTCMonth() === parts.mo - 1 &&
    date.getUTCDate() === parts.d &&
    date.getUTCHours() === parts.h &&
    date.getUTCMinutes() === parts.mi &&
    date.getUTCSeconds() === parts.s
  return valid ? date : null
}

/**
 * Formats a Date instant as app date/time parts in a timezone.
 * @param date - Date instant to format
 * @param timezone - IANA timezone id
 * @returns Date/time parts in the requested timezone
 */
function getTimezoneParts(date: Date, timezone: string): DateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  })
  const partMap = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  )

  return {
    y: Number(partMap.year),
    mo: Number(partMap.month),
    d: Number(partMap.day),
    h: Number(partMap.hour),
    mi: Number(partMap.minute),
    s: Number(partMap.second),
  }
}

/**
 * Formats a stored UTC timestamp for display in a timezone.
 * @param timeUtc - UTC timestamp in MM/DD/YYYY HH:MM:SS format
 * @param timezone - IANA timezone id
 * @returns Timestamp rendered in the selected timezone, or the original value if invalid
 */
export function formatUtcTimeForTimezone(timeUtc: string, timezone: string): string {
  if (!timeUtc) return timeUtc
  const date = parseUtcTimeString(timeUtc)
  if (!date) return timeUtc
  return formatDateTimeParts(getTimezoneParts(date, normalizeTimezone(timezone)))
}

/**
 * Converts date/time parts interpreted in a timezone to a UTC Date.
 * @param parts - Local date/time parts in the selected timezone
 * @param timezone - IANA timezone id
 * @returns UTC Date for the local time, or null when the local time is invalid
 */
function zonedPartsToUtcDate(parts: DateTimeParts, timezone: string): Date | null {
  const targetLocalMs = Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s)
  let utcMs = targetLocalMs

  for (let i = 0; i < 4; i += 1) {
    const rendered = getTimezoneParts(new Date(utcMs), timezone)
    const renderedLocalMs = Date.UTC(rendered.y, rendered.mo - 1, rendered.d, rendered.h, rendered.mi, rendered.s)
    const delta = renderedLocalMs - targetLocalMs
    if (delta === 0) break
    utcMs -= delta
  }

  const date = new Date(utcMs)
  const check = getTimezoneParts(date, timezone)
  const valid = check.y === parts.y &&
    check.mo === parts.mo &&
    check.d === parts.d &&
    check.h === parts.h &&
    check.mi === parts.mi &&
    check.s === parts.s
  return valid ? date : null
}

/**
 * Converts a local timestamp in a timezone into the stored UTC timestamp format.
 * @param value - Local timestamp in MM/DD/YYYY HH:MM:SS format, with optional AM/PM
 * @param timezone - IANA timezone id
 * @returns UTC timestamp in MM/DD/YYYY HH:MM:SS format, or null when invalid
 */
export function convertZonedTimeToUtcString(value: string, timezone: string): string | null {
  const parts = parseDateTimeParts(value)
  if (!parts) return null
  const normalizedTimezone = normalizeTimezone(timezone)
  const utcDate = zonedPartsToUtcDate(parts, normalizedTimezone)
  if (!utcDate) return null
  return formatDateTimeParts({
    y: utcDate.getUTCFullYear(),
    mo: utcDate.getUTCMonth() + 1,
    d: utcDate.getUTCDate(),
    h: utcDate.getUTCHours(),
    mi: utcDate.getUTCMinutes(),
    s: utcDate.getUTCSeconds(),
  })
}

/**
 * Checks whether a local timestamp is valid in the selected timezone.
 * @param value - Local timestamp in MM/DD/YYYY HH:MM:SS format, with optional AM/PM
 * @param timezone - IANA timezone id
 * @returns True when the timestamp can be converted to UTC
 */
export function isValidZonedDateTime(value: string, timezone: string): boolean {
  return convertZonedTimeToUtcString(value, timezone) !== null
}
