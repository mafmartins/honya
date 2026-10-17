import { createContext, useCallback, useEffect, useMemo, useState } from "react"
import type { HonyaApi, LineView, SessionView } from "../../../shared/api"
import { useReport } from "../../action"
import { errorMessage } from "../../api"

export interface SessionState {
  view: SessionView | null
  setView: (view: SessionView) => void
  setLine: (line: LineView) => void
  reload: () => void
}

function mergeLines(view: SessionView, lines: readonly LineView[]): SessionView {
  const changed = new Map(lines.map((line) => [line.index, line]))
  return { ...view, lines: view.lines.map((line) => changed.get(line.index) ?? line) }
}

// The open session, kept current by the lines the AI sends while it runs.
export function useSession(api: HonyaApi, id: string): SessionState {
  const report = useReport()
  const [view, setView] = useState<SessionView | null>(null)
  const reload = useCallback((): void => {
    api.openSession(id).then(setView, (failure: unknown) => {
      report(errorMessage(failure))
    })
  }, [api, id, report])
  useEffect(() => {
    reload()
    return api.onWorkspaceEvent((event) => {
      if (event.type === "lines" && event.sessionId === id) {
        setView((current) => (current === null ? current : mergeLines(current, event.lines)))
      }
    })
  }, [api, id, reload])
  const setLine = useCallback((line: LineView): void => {
    setView((current) => (current === null ? current : mergeLines(current, [line])))
  }, [])
  return { view, setView, setLine, reload }
}

export interface RunProgress {
  batch: number
  batches: number
  linesDone: number
  lineTotal: number
  activity: string
  // The lines of the batch being translated.
  working: ReadonlySet<number>
}

// null: no run; "starting": running, before the first progress event.
export type RunState = RunProgress | "starting" | null

// How the last run ended, when it didn't finish: shown under the top bar.
export type RunEnding = { outcome: "stopped" } | { outcome: "failed"; message: string | null }

// Whether the AI is translating this session, from aiActive and the run events. A run
// that ends reloads the session; a failed one also reports its message.
export function useAiRun(
  api: HonyaApi,
  id: string,
  onEnded: () => void,
): { run: RunState; ending: RunEnding | null; start: () => void; dismiss: () => void } {
  const report = useReport()
  const [run, setRun] = useState<RunState>(null)
  const [ending, setEnding] = useState<RunEnding | null>(null)
  useEffect(() => {
    let live = true
    // A run that ended while aiActive was in flight must not come back as "starting".
    let endedMeanwhile = false
    api.aiActive().then(
      (active) => {
        if (live && !endedMeanwhile && active === id) {
          setRun((current) => current ?? "starting")
        }
      },
      () => undefined,
    )
    const unsubscribe = api.onWorkspaceEvent((event) => {
      if (event.sessionId !== id) {
        return
      }
      if (event.type === "run-progress") {
        setRun({
          batch: event.index,
          batches: event.total,
          linesDone: event.linesDone,
          lineTotal: event.lineTotal,
          activity: event.activity,
          working: new Set(event.indexes),
        })
      } else if (event.type === "run-ended") {
        endedMeanwhile = true
        setRun(null)
        if (event.outcome === "failed") {
          setEnding({ outcome: "failed", message: event.message })
          report(event.message ?? "The AI run stopped.")
        } else {
          setEnding(event.outcome === "stopped" ? { outcome: "stopped" } : null)
        }
        onEnded()
      }
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [api, id, onEnded, report])
  const start = useCallback((): void => {
    setRun("starting")
    setEnding(null)
    api.runAi(id).then(
      () => {
        report(null)
      },
      (failure: unknown) => {
        setRun(null)
        report(errorMessage(failure))
      },
    )
  }, [api, id, report])
  const dismiss = useCallback((): void => {
    setEnding(null)
  }, [])
  return { run, ending, start, dismiss }
}

export interface SaveStatus {
  // Shows "Saving…" in the top bar until the write settles.
  markSaving: (work: Promise<unknown>) => void
}

export const SaveStatusContext = createContext<SaveStatus>({ markSaving: () => undefined })

// The writes still in flight, for the top bar's Saved / Saving… indicator.
export function useSaveStatus(): { saving: boolean; status: SaveStatus } {
  const [pending, setPending] = useState(0)
  const status = useMemo<SaveStatus>(
    () => ({
      markSaving: (work) => {
        setPending((count) => count + 1)
        const settle = (): void => {
          setPending((count) => count - 1)
        }
        void work.then(settle, settle)
      },
    }),
    [],
  )
  return { saving: pending > 0, status }
}
