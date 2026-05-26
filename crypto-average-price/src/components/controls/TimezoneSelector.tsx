import { useAppStore } from '../../store/useAppStore'

const TIMEZONE_OPTIONS = [
  { label: 'UTC', timezone: 'UTC' },
  { label: 'Brazil - Araguaina', timezone: 'America/Araguaina' },
  { label: 'Brazil - Bahia', timezone: 'America/Bahia' },
  { label: 'Brazil - Belem', timezone: 'America/Belem' },
  { label: 'Brazil - Boa Vista', timezone: 'America/Boa_Vista' },
  { label: 'Brazil - Campo Grande', timezone: 'America/Campo_Grande' },
  { label: 'Brazil - Cuiaba', timezone: 'America/Cuiaba' },
  { label: 'Brazil - Eirunepe', timezone: 'America/Eirunepe' },
  { label: 'Brazil - Fortaleza', timezone: 'America/Fortaleza' },
  { label: 'Brazil - Maceio', timezone: 'America/Maceio' },
  { label: 'Brazil - Manaus', timezone: 'America/Manaus' },
  { label: 'Brazil - Noronha', timezone: 'America/Noronha' },
  { label: 'Brazil - Porto Velho', timezone: 'America/Porto_Velho' },
  { label: 'Brazil - Recife', timezone: 'America/Recife' },
  { label: 'Brazil - Rio Branco', timezone: 'America/Rio_Branco' },
  { label: 'Brazil - Santarem', timezone: 'America/Santarem' },
  { label: 'Brazil - Sao Paulo', timezone: 'America/Sao_Paulo' },
  { label: 'US - Adak', timezone: 'America/Adak' },
  { label: 'US - Anchorage', timezone: 'America/Anchorage' },
  { label: 'US - Boise', timezone: 'America/Boise' },
  { label: 'US - Chicago', timezone: 'America/Chicago' },
  { label: 'US - Denver', timezone: 'America/Denver' },
  { label: 'US - Detroit', timezone: 'America/Detroit' },
  { label: 'US - Honolulu', timezone: 'Pacific/Honolulu' },
  { label: 'US - Indiana/Indianapolis', timezone: 'America/Indianapolis' },
  { label: 'US - Indiana/Knox', timezone: 'America/Indiana/Knox' },
  { label: 'US - Indiana/Marengo', timezone: 'America/Indiana/Marengo' },
  { label: 'US - Indiana/Petersburg', timezone: 'America/Indiana/Petersburg' },
  { label: 'US - Indiana/Tell City', timezone: 'America/Indiana/Tell_City' },
  { label: 'US - Indiana/Vevay', timezone: 'America/Indiana/Vevay' },
  { label: 'US - Indiana/Vincennes', timezone: 'America/Indiana/Vincennes' },
  { label: 'US - Indiana/Winamac', timezone: 'America/Indiana/Winamac' },
  { label: 'US - Juneau', timezone: 'America/Juneau' },
  { label: 'US - Kentucky/Louisville', timezone: 'America/Louisville' },
  { label: 'US - Kentucky/Monticello', timezone: 'America/Kentucky/Monticello' },
  { label: 'US - Los Angeles', timezone: 'America/Los_Angeles' },
  { label: 'US - Menominee', timezone: 'America/Menominee' },
  { label: 'US - Metlakatla', timezone: 'America/Metlakatla' },
  { label: 'US - New York', timezone: 'America/New_York' },
  { label: 'US - Nome', timezone: 'America/Nome' },
  { label: 'US - North Dakota/Beulah', timezone: 'America/North_Dakota/Beulah' },
  { label: 'US - North Dakota/Center', timezone: 'America/North_Dakota/Center' },
  { label: 'US - North Dakota/New Salem', timezone: 'America/North_Dakota/New_Salem' },
  { label: 'US - Phoenix', timezone: 'America/Phoenix' },
  { label: 'US - Sitka', timezone: 'America/Sitka' },
  { label: 'US - Yakutat', timezone: 'America/Yakutat' },
  { label: 'Japan - Tokyo', timezone: 'Asia/Tokyo' },
  { label: 'Portugal - Lisbon', timezone: 'Europe/Lisbon' },
  { label: 'Singapore - Singapore', timezone: 'Asia/Singapore' },
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
