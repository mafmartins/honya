import { useCallback, useEffect, useRef, useState } from "react"
import type { FinishResult, TranslateEvent, LiveLine, PreparedScript } from "../../shared/api"
import { useReport } from "../action"
import { errorMessage, useApi } from "../api"
import type { TranslateTarget } from "../App"
import { DonePanel } from "../translate/DonePanel"
import { HaltPanel } from "../translate/HaltPanel"
import { ReviewPanel } from "../translate/ReviewPanel"
import { LivePanel, type Progress } from "../translate/LivePanel"
import { StylesStep } from "../translate/StylesStep"

type NewRequest = Extract<TranslateTarget, { kind: "new" }>["request"]

type Phase = "loading" | "styles" | "empty" | "running" | "halted" | "review" | "finishing" | "done"

export function TranslateScreen(props: {
  target: TranslateTarget
  onBack: () => void
  onAnother: () => void
}): React.JSX.Element {
  const api = useApi()
  const report = useReport()
  // Unlike useAction, a success never clears the error line: a `failed` event may have set it meanwhile.
  const act = useCallback(
    (task: () => Promise<void>): void => {
      void task().catch((error: unknown) => {
        report(errorMessage(error))
      })
    },
    [report],
  )
  const { target } = props
  const [phase, setPhase] = useState<Phase>(target.kind === "resume" ? "running" : "loading")
  const [prepared, setPrepared] = useState<PreparedScript | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [activity, setActivity] = useState<string | null>(null)
  const [lines, setLines] = useState<LiveLine[]>([])
  const [halt, setHalt] = useState<"stopped" | "failed">("stopped")
  const [stopping, setStopping] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const [result, setResult] = useState<FinishResult | null>(null)
  const sessionId = useRef<string | null>(target.kind === "resume" ? target.id : null)
  const early = useRef<TranslateEvent[]>([])
  const apply = useCallback(
    (event: TranslateEvent): void => {
      switch (event.type) {
        case "activity":
          setActivity(event.text)
          break
        case "batch":
          setProgress({
            index: event.index,
            total: event.total,
            linesDone: event.linesDone,
            lineTotal: event.lineTotal,
          })
          setLines((current) => [...current, ...event.lines])
          break
        case "stopped":
          setStopping(false)
          setHalt("stopped")
          setPhase("halted")
          break
        case "failed":
          setStopping(false)
          setHalt("failed")
          setPhase("halted")
          report(event.message)
          break
        case "finished":
          setStopping(false)
          setReviewId(event.sessionId)
          setPhase("review")
          break
      }
    },
    [report],
  )

  const begin = useCallback(
    (request: NewRequest, styles: string[]): void => {
      if (styles.length === 0) {
        setPhase("empty")
        return
      }
      setPhase("loading")
      act(async () => {
        const id = await api.startTranslation({ ...request, dialogueStyles: styles })
        sessionId.current = id
        setPhase("running")
        const buffered = early.current
        early.current = []
        for (const event of buffered) {
          if (event.sessionId === id) {
            apply(event)
          }
        }
      })
    },
    [api, act, apply],
  )

  const resumeSession = useCallback(
    (id: string): void => {
      act(async () => {
        try {
          await api.resumeTranslation(id)
        } catch (error) {
          setStopping(false)
          setHalt("failed")
          setPhase("halted")
          throw error
        }
      })
    },
    [api, act],
  )

  useEffect(() => {
    return api.onTranslateEvent((event) => {
      if (sessionId.current === null) {
        early.current.push(event)
      } else if (event.sessionId === sessionId.current) {
        apply(event)
      }
    })
  }, [api, apply])

  const started = useRef(false)
  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true
    if (target.kind === "resume") {
      resumeSession(target.id)
    } else {
      act(async () => {
        const script = await api.prepareTranslation(
          target.request.scriptPath,
          target.request.variant,
        )
        setPrepared(script)
        if (script.styles.some((style) => style.guess === "ambiguous")) {
          setPhase("styles")
          return
        }
        begin(
          target.request,
          script.styles.filter((style) => style.guess === "dialogue").map((style) => style.name),
        )
      })
    }
  }, [api, act, begin, resumeSession, target])

  const resume = (): void => {
    const id = sessionId.current
    if (id === null) {
      return
    }
    report(null)
    setPhase("running")
    resumeSession(id)
  }

  const finish = (id: string): void => {
    report(null)
    setWriting(true)
    act(async () => {
      try {
        const finished = await api.finishTranslation(id)
        setResult(finished)
        setPhase("done")
      } finally {
        setWriting(false)
      }
    })
  }

  const showJob =
    phase === "loading" || phase === "styles" || phase === "running" || phase === "halted"

  return (
    <>
      <header className="card-header">
        <p>Translate</p>
        {phase === "running" ? null : (
          <button type="button" className="link" onClick={props.onBack}>
            Back
          </button>
        )}
      </header>
      {showJob && target.kind === "new" ? (
        <div className="job">
          <p>
            {`${target.scriptName} · ${target.seriesName} · ${target.request.variant} · ${target.request.provider} · ${target.request.preset}`}
          </p>
          {prepared === null ? null : <p>{`Output: ${prepared.outputPath}`}</p>}
        </div>
      ) : null}
      {phase === "styles" && prepared !== null && target.kind === "new" ? (
        <StylesStep
          styles={prepared.styles}
          onConfirm={(styles) => {
            begin(target.request, styles)
          }}
          onBack={props.onBack}
        />
      ) : null}
      {phase === "empty" ? <p>This script has no dialogue lines in the chosen styles.</p> : null}
      {phase === "running" ? (
        <LivePanel
          progress={progress}
          activity={activity}
          lines={lines}
          stopping={stopping}
          onStop={() => {
            setStopping(true)
            act(async () => {
              try {
                await api.stopTranslation()
              } catch (error) {
                setStopping(false)
                throw error
              }
            })
          }}
        />
      ) : null}
      {phase === "halted" ? (
        <HaltPanel kind={halt} onResume={resume} onBack={props.onBack} />
      ) : null}
      {phase === "review" && reviewId !== null ? (
        <ReviewPanel
          sessionId={reviewId}
          onFinish={() => {
            setPhase("finishing")
            finish(reviewId)
          }}
        />
      ) : null}
      {phase === "finishing" && writing ? <p>Writing the file…</p> : null}
      {phase === "finishing" && !writing && reviewId !== null ? (
        <button
          type="button"
          className="action"
          onClick={() => {
            finish(reviewId)
          }}
        >
          Try again
        </button>
      ) : null}
      {phase === "done" && result !== null && reviewId !== null ? (
        <DonePanel
          result={result}
          onReveal={() => {
            act(() => api.revealOutput(reviewId))
          }}
          onAnother={props.onAnother}
        />
      ) : null}
    </>
  )
}
