import { useRef, useState } from 'react'

interface PromiseDialogController<TPayload, TResult> {
  open: boolean
  payload: TPayload | null
  request: (payload: TPayload) => Promise<TResult>
  resolve: (value: TResult) => void
}

/**
 * Stores state for a dialog that resolves a Promise when the user chooses an action.
 * @returns Dialog payload, open state, request function, and resolve function
 */
export function usePromiseDialog<TPayload, TResult>(): PromiseDialogController<TPayload, TResult> {
  const [payload, setPayload] = useState<TPayload | null>(null)
  const resolverRef = useRef<((value: TResult) => void) | null>(null)

  /**
   * Opens the dialog with a payload and returns a Promise for the user's response.
   * @param nextPayload - Data needed to render the dialog
   * @returns Promise resolved by the dialog action buttons
   */
  function request(nextPayload: TPayload): Promise<TResult> {
    return new Promise(resolve => {
      resolverRef.current = resolve
      setPayload(nextPayload)
    })
  }

  /**
   * Resolves the pending dialog Promise and closes the dialog.
   * @param value - User response to send back to the caller
   */
  function resolve(value: TResult): void {
    resolverRef.current?.(value)
    resolverRef.current = null
    setPayload(null)
  }

  return {
    open: payload !== null,
    payload,
    request,
    resolve,
  }
}
