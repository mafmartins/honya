import { useCallback, useEffect, useState } from "react"
import { useReport } from "../../action"
import { errorMessage } from "../../api"

// Loads a value on mount and whenever `load` changes; reload() fetches it again and
// keeps showing the old value until the new one arrives; update() changes the latest
// value, so a reply that lands late doesn't undo a change made meanwhile. Failures go
// to the error line.
export function useLoad<T>(load: () => Promise<T>): {
  value: T | null
  reload: () => void
  set: (value: T) => void
  update: (change: (current: T) => T) => void
} {
  const report = useReport()
  const [value, setValue] = useState<T | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    load().then(
      (loaded) => {
        if (live) {
          setValue(loaded)
        }
      },
      (error: unknown) => {
        if (live) {
          report(errorMessage(error))
        }
      },
    )
    return () => {
      live = false
    }
  }, [load, report, tick])
  const reload = useCallback(() => {
    setTick((current) => current + 1)
  }, [])
  const update = useCallback((change: (current: T) => T) => {
    setValue((current) => (current === null ? null : change(current)))
  }, [])
  return { value, reload, set: setValue, update }
}
