import { useAppStore } from '../../store/useAppStore'

export function RoundBalanceToggle() {
  const enabled = useAppStore(s => s.settings.roundBalance)
  const toggle = useAppStore(s => s.toggleRoundBalance)

  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-accent' : 'bg-surface-4'}`}
        onClick={toggle}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </div>
      <span className="text-xs text-text-secondary">
        Round balance (2 dec)
      </span>
    </label>
  )
}
