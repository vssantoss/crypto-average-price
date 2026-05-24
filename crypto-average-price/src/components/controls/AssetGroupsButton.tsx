import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useInstrumentList } from '../../store/selectors'
import type { AssetGroup } from '../../types/app'
import { normalizeAssetGroups, normalizeAssetInstruments, suggestAssetGroups, type AssetSuggestion } from '../../engine/assetGroups'
import { Dialog, DialogFooter, dialogCancelClass, dialogPrimaryClass, dialogSecondaryClass } from '../common/Dialog'
import { Check, Layers3, Plus, Trash2, X } from 'lucide-react'

const inputClass = 'bg-surface-1 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted'
const smallButtonClass = 'inline-flex items-center gap-1 bg-surface-1 border border-border rounded px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors'

/**
 * Creates a blank editable asset group.
 * @returns Empty asset group draft
 */
function createEmptyGroup(): AssetGroup {
  return { assetName: '', instruments: [], enabled: true }
}

/**
 * Checks whether an asset group has enough information to be saved.
 * @param group - Asset group to inspect
 * @returns True when the group has a name and at least one instrument
 */
function isSaveableGroup(group: AssetGroup): boolean {
  return group.assetName.trim().length > 0 && group.instruments.some(instrument => instrument.trim().length > 0)
}

/**
 * Renders the asset group editor and suggestion dialog trigger.
 * @returns Asset groups control
 */
export function AssetGroupsButton() {
  const [open, setOpen] = useState(false)
  const [draftGroups, setDraftGroups] = useState<AssetGroup[]>([])
  const [instrumentDrafts, setInstrumentDrafts] = useState<Record<number, string>>({})
  const rawTransactions = useAppStore(s => s.rawTransactions)
  const savedGroups = useAppStore(s => s.settings.assetGroups)
  const setAssetGroups = useAppStore(s => s.setAssetGroups)
  const knownInstruments = useInstrumentList()
  const suggestions = useMemo(
    () => suggestAssetGroups(rawTransactions, draftGroups),
    [draftGroups, rawTransactions],
  )

  /**
   * Opens the dialog with a fresh copy of saved asset groups.
   */
  function openDialog(): void {
    setDraftGroups(savedGroups.map(group => ({ ...group, enabled: group.enabled ?? true, instruments: [...group.instruments] })))
    setInstrumentDrafts({})
    setOpen(true)
  }

  /**
   * Closes the dialog without saving draft changes.
   */
  function cancelDialog(): void {
    setOpen(false)
  }

  /**
   * Saves normalized asset groups to app settings.
   */
  function saveDialog(): void {
    setAssetGroups(normalizeAssetGroups(draftGroups.filter(isSaveableGroup)))
    setOpen(false)
  }

  /**
   * Adds a new blank group to the draft list.
   */
  function addGroup(): void {
    setDraftGroups(current => [...current, createEmptyGroup()])
  }

  /**
   * Removes an asset group from the draft list.
   * @param index - Group index to remove
   */
  function removeGroup(index: number): void {
    setDraftGroups(current => current.filter((_, groupIndex) => groupIndex !== index))
  }

  /**
   * Updates the asset name for a draft group.
   * @param index - Group index to update
   * @param assetName - New asset name
   */
  function updateAssetName(index: number, assetName: string): void {
    setDraftGroups(current => current.map((group, groupIndex) =>
      groupIndex === index ? { ...group, assetName } : group
    ))
  }

  /**
   * Updates whether a draft asset group affects calculations.
   * @param index - Group index to update
   * @param enabled - Whether the group should be applied by the calculation engine
   */
  function updateGroupEnabled(index: number, enabled: boolean): void {
    setDraftGroups(current => current.map((group, groupIndex) =>
      groupIndex === index ? { ...group, enabled } : group
    ))
  }

  /**
   * Updates a pending instrument input for a group.
   * @param index - Group index whose input changed
   * @param value - Draft instrument text
   */
  function updateInstrumentDraft(index: number, value: string): void {
    setInstrumentDrafts(current => ({ ...current, [index]: value }))
  }

  /**
   * Adds the pending instrument input to a draft group.
   * @param index - Group index to update
   */
  function addInstrument(index: number): void {
    const instrument = instrumentDrafts[index]?.trim()
    if (!instrument) return

    setDraftGroups(current => current.map((group, groupIndex) => {
      if (groupIndex !== index) return group
      return { ...group, instruments: normalizeAssetInstruments([...group.instruments, instrument]) }
    }))
    setInstrumentDrafts(current => ({ ...current, [index]: '' }))
  }

  /**
   * Removes one instrument from a draft group.
   * @param groupIndex - Group index to update
   * @param instrument - Instrument name to remove
   */
  function removeInstrument(groupIndex: number, instrument: string): void {
    setDraftGroups(current => current.map((group, index) => {
      if (index !== groupIndex) return group
      return { ...group, instruments: group.instruments.filter(item => item !== instrument) }
    }))
  }

  /**
   * Accepts a suggested asset group into the editable draft list.
   * @param suggestion - Suggested group to add
   */
  function acceptSuggestion(suggestion: AssetSuggestion): void {
    setDraftGroups(current => normalizeAssetGroups([...current, { ...suggestion, enabled: true }]))
  }

  return (
    <>
      <button
        onClick={openDialog}
        className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
      >
        <Layers3 size={13} />
        Assets
      </button>

      <Dialog open={open} onClose={cancelDialog} title="Assets" maxWidth="max-w-3xl">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-text-secondary">
            Group reported instruments that should calculate as one economic asset.
          </p>
          <button
            onClick={cancelDialog}
            className="shrink-0 text-text-muted hover:text-text-primary transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 max-h-[460px] overflow-y-auto pr-1">
          {draftGroups.map((group, index) => (
            <div key={index} className="border border-border rounded bg-surface-2 p-3">
              <div className="grid grid-cols-[240px_minmax(0,1fr)_auto] gap-2 items-start mb-2">
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={group.enabled ?? true}
                      onChange={event => updateGroupEnabled(index, event.target.checked)}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    Apply rule
                  </label>
                  <input
                    value={group.assetName}
                    onChange={event => updateAssetName(index, event.target.value)}
                    placeholder="Asset name"
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5 min-h-7">
                    {group.instruments.map(instrument => (
                      <span
                        key={instrument}
                        className="inline-flex items-center gap-1 bg-surface-1 border border-border rounded px-2 py-1 text-xs text-text-primary"
                      >
                        {instrument}
                        <button
                          onClick={() => removeInstrument(index, instrument)}
                          className="text-text-muted hover:text-danger"
                          title={`Remove ${instrument}`}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      list="asset-instrument-options"
                      value={instrumentDrafts[index] ?? ''}
                      onChange={event => updateInstrumentDraft(index, event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addInstrument(index)
                        }
                      }}
                      placeholder="Add instrument"
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      onClick={() => addInstrument(index)}
                      className={smallButtonClass}
                    >
                      <Plus size={12} />
                      Add
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => removeGroup(index)}
                  className="text-text-muted hover:text-danger transition-colors p-1"
                  title="Delete asset"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          {draftGroups.length === 0 && (
            <div className="border border-dashed border-border rounded bg-surface-2 px-3 py-5 text-center text-xs text-text-secondary">
              No custom assets configured.
            </div>
          )}

          <button onClick={addGroup} className={`${dialogSecondaryClass} self-start inline-flex items-center gap-1.5`}>
            <Plus size={12} />
            Add asset
          </button>

          {suggestions.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-text-secondary mb-2">Suggestions</p>
              <div className="space-y-2">
                {suggestions.map(suggestion => (
                  <div
                    key={`${suggestion.assetName}-${suggestion.instruments.join('|')}`}
                    className="flex items-center justify-between gap-3 bg-surface-2 border border-border rounded px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-text-primary truncate">{suggestion.assetName}</div>
                      <div className="text-xs text-text-secondary truncate">{suggestion.instruments.join(', ')}</div>
                    </div>
                    <button
                      onClick={() => acceptSuggestion(suggestion)}
                      className={smallButtonClass}
                    >
                      <Check size={12} />
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <datalist id="asset-instrument-options">
          {knownInstruments.map(instrument => (
            <option key={instrument} value={instrument} />
          ))}
        </datalist>

        <DialogFooter>
          <button onClick={cancelDialog} className={dialogCancelClass}>
            Cancel
          </button>
          <button onClick={saveDialog} className={dialogPrimaryClass}>
            Save
          </button>
        </DialogFooter>
      </Dialog>
    </>
  )
}
