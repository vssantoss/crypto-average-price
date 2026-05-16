import { useAppStore } from '../../store/useAppStore'
import { useInstrumentList } from '../../store/selectors'

/**
 * Dropdown to filter the datatable by a specific instrument/coin.
 * Shows all available instruments derived from imported transactions.
 * @returns Coin selector dropdown element
 */
export function CoinSelector() {
  const instruments = useInstrumentList()
  const selected = useAppStore(s => s.settings.selectedInstrument)
  const setSelected = useAppStore(s => s.setSelectedInstrument)

  if (instruments.length === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs text-text-secondary">Coin:</label>
      <select
        value={selected || ''}
        onChange={e => setSelected(e.target.value || null)}
        className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent cursor-pointer"
      >
        <option value="">All instruments</option>
        {instruments.map(inst => (
          <option key={inst} value={inst}>{inst}</option>
        ))}
      </select>
    </div>
  )
}
