import { useAppStore } from '../../store/useAppStore'

const TIMEZONE_OPTIONS = [
  { label: 'UTC', offset: 0 },
  { label: 'UTC-3 (BRT)', offset: -3 },
  { label: 'UTC-4', offset: -4 },
  { label: 'UTC-5 (EST)', offset: -5 },
  { label: 'UTC-6 (CST)', offset: -6 },
  { label: 'UTC-7 (MST)', offset: -7 },
  { label: 'UTC-8 (PST)', offset: -8 },
  { label: 'UTC+1 (CET)', offset: 1 },
  { label: 'UTC+8 (SGT)', offset: 8 },
  { label: 'UTC+9 (JST)', offset: 9 },
]

export function TimezoneSelector() {
  const offset = useAppStore(s => s.settings.timezoneOffset)
  const setOffset = useAppStore(s => s.setTimezoneOffset)

  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs text-text-secondary">TZ:</label>
      <select
        value={offset}
        onChange={e => setOffset(Number(e.target.value))}
        className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent cursor-pointer"
      >
        {TIMEZONE_OPTIONS.map(tz => (
          <option key={tz.offset} value={tz.offset}>{tz.label}</option>
        ))}
      </select>
    </div>
  )
}
