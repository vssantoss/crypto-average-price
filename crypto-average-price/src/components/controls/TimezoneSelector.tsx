import { useAppStore } from '../../store/useAppStore'

const TIMEZONE_OPTIONS = [
  { label: 'UTC', timezone: 'UTC' },
  { label: 'Sao Paulo', timezone: 'America/Sao_Paulo' },
  { label: 'New York', timezone: 'America/New_York' },
  { label: 'Chicago', timezone: 'America/Chicago' },
  { label: 'Denver', timezone: 'America/Denver' },
  { label: 'Los Angeles', timezone: 'America/Los_Angeles' },
  { label: 'Lisbon', timezone: 'Europe/Lisbon' },
  { label: 'Singapore', timezone: 'Asia/Singapore' },
  { label: 'Tokyo', timezone: 'Asia/Tokyo' },
]

/**
 * Renders the app timezone selector and persists the selected IANA timezone id.
 * @returns Timezone selector control
 */
export function TimezoneSelector() {
  const timezone = useAppStore(s => s.settings.timezone)
  const setTimezone = useAppStore(s => s.setTimezone)

  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs text-text-secondary">TZ:</label>
      <select
        value={timezone}
        onChange={e => setTimezone(e.target.value)}
        className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent cursor-pointer"
      >
        {TIMEZONE_OPTIONS.map(tz => (
          <option key={tz.timezone} value={tz.timezone}>{tz.label}</option>
        ))}
      </select>
    </div>
  )
}
