import { useAppStore } from '../../store/useAppStore'
import { ToggleSwitch } from '../common/ToggleSwitch'

export function UsdMergeToggle() {
  const enabled = useAppStore(s => s.settings.usdMergeEnabled)
  const toggle = useAppStore(s => s.toggleUsdMerge)

  return <ToggleSwitch enabled={enabled} onToggle={toggle} label="Merge USD stablecoins" />
}
