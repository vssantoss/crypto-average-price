import { useAppStore } from '../../store/useAppStore'
import { ToggleSwitch } from '../common/ToggleSwitch'

export function RoundBalanceToggle() {
  const enabled = useAppStore(s => s.settings.roundBalance)
  const toggle = useAppStore(s => s.toggleRoundBalance)

  return <ToggleSwitch enabled={enabled} onToggle={toggle} label="Round balance (2 dec)" />
}
