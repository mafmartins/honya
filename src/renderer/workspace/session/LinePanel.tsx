import { useCallback, useContext, useEffect, useId, useRef, useState } from "react"
import { visibleLength } from "../../../core/ass/fit"
import type { LineView, Owner, Rule } from "../../../shared/api"
import { errorMessage, useApi } from "../../api"
import { RuleDraftDialog } from "./RuleDraftDialog"
import { SaveStatusContext } from "./useSession"

const SAVE_DELAY_MS = 600

// "none": the video has no frame for this line. Failed requests aren't cached, so
// the next visit to the line asks again.
type Frame = { kind: "image"; src: string } | { kind: "none" }

type StyleOwner = Extract<Owner, { kind: "style" }>

interface FrameCache {
  video: string | null
  frames: ReadonlyMap<number, Frame>
}

// The selected line: its video frame, the English, the Portuguese editor and the
// actions. Frames are kept per line until the video changes.
export function LinePanel({
  sessionId,
  line,
  video,
  owner,
  styleOwner,
  onLine,
  onLeave,
}: {
  sessionId: string
  line: LineView
  video: string | null
  owner: Owner
  styleOwner: StyleOwner
  onLine: (line: LineView) => void
  // Esc in the editor: the list takes the focus back.
  onLeave: () => void
}): React.JSX.Element {
  return (
    <>
      <LineFrame sessionId={sessionId} index={line.index} video={video} />
      <LineEditor
        key={line.index}
        sessionId={sessionId}
        line={line}
        owner={owner}
        styleOwner={styleOwner}
        onLine={onLine}
        onLeave={onLeave}
      />
    </>
  )
}

function LineFrame({
  sessionId,
  index,
  video,
}: {
  sessionId: string
  index: number
  video: string | null
}): React.JSX.Element {
  const api = useApi()
  const [cache, setCache] = useState<FrameCache>({ video, frames: new Map() })
  const frame = cache.video === video ? cache.frames.get(index) : undefined
  const known = frame !== undefined
  const [failed, setFailed] = useState<{ index: number; message: string } | null>(null)
  useEffect(() => {
    if (video === null || known) {
      return
    }
    let live = true
    const store = (found: Frame): void => {
      if (!live) {
        return
      }
      setCache((current) => {
        const frames = new Map(current.video === video ? current.frames : [])
        frames.set(index, found)
        return { video, frames }
      })
    }
    api.lineFrame(sessionId, index).then(
      (src) => {
        store(src === null ? { kind: "none" } : { kind: "image", src })
      },
      (error: unknown) => {
        if (live) {
          setFailed({ index, message: errorMessage(error) })
        }
      },
    )
    return () => {
      live = false
      setFailed(null)
    }
  }, [api, sessionId, index, video, known])

  if (video === null) {
    return (
      <div className="line-frame line-frame-empty">
        <p>Attach a video to see frames</p>
      </div>
    )
  }
  return (
    <div className="line-frame">
      {frame?.kind === "image" ? (
        <img src={frame.src} alt={`Frame for line ${String(index + 1)}`} />
      ) : frame?.kind === "none" ? (
        <p>Couldn't get the frame for this line.</p>
      ) : failed?.index === index ? (
        <p>{failed.message}</p>
      ) : (
        <p>Getting the frame…</p>
      )}
    </div>
  )
}

function metaOf(line: LineView): string {
  const speaker = line.speaker === "" ? "no speaker" : line.speaker
  const seconds = (Math.max(0, line.end - line.start) / 1000).toFixed(2)
  return `Line ${String(line.index + 1)} · ${speaker} · ${seconds} s · ${String(line.budget)} characters max`
}

type Busy = "accept" | "ask" | "draft"

const BUSY_TEXT: Record<Busy, string> = {
  accept: "Accepting…",
  ask: "Asking the AI…",
  draft: "Drafting a rule…",
}

// One line's editor. Mounted per line, so what you type stays here until you pick
// another line; saves go out 600 ms after typing stops, on blur and on leaving.
function LineEditor({
  sessionId,
  line,
  owner,
  styleOwner,
  onLine,
  onLeave,
}: {
  sessionId: string
  line: LineView
  owner: Owner
  styleOwner: StyleOwner
  onLine: (line: LineView) => void
  onLeave: () => void
}): React.JSX.Element {
  const api = useApi()
  const { markSaving } = useContext(SaveStatusContext)
  const index = line.index
  const editorId = useId()
  const [text, setText] = useState(line.words ?? "")
  // What you typed last and what was last sent; null when the last save failed.
  const typed = useRef(text)
  const sent = useRef<string | null>(text)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set by typing here; a save on blur doesn't clear it, so Ask AI again still confirms.
  const edited = useRef(false)
  // Settles the "Saving…" shown from the first keystroke until that typing is saved.
  const settleTyping = useRef<(() => void) | null>(null)
  const [busy, setBusy] = useState<Busy | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hint, setHint] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState<Rule | null>(null)

  const show = useCallback((words: string): void => {
    typed.current = words
    sent.current = words
    setText(words)
  }, [])

  const cancelTimer = useCallback((): (() => void) => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const settle = settleTyping.current ?? (() => undefined)
    settleTyping.current = null
    return settle
  }, [])

  const save = useCallback((): Promise<void> => {
    const settle = cancelTimer()
    const words = typed.current
    if (words === sent.current) {
      settle()
      return Promise.resolve()
    }
    sent.current = words
    const work = api.editLine(sessionId, index, words).then((next) => {
      onLine(next)
      setFailure(null)
    })
    markSaving(work)
    work.then(settle, settle)
    return work.catch((error: unknown) => {
      sent.current = null
      setFailure(errorMessage(error))
      throw error
    })
  }, [api, sessionId, index, onLine, markSaving, cancelTimer])

  // Leaving the line (or the page), or closing the window, sends what is still waiting.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])
  useEffect(() => {
    const flush = (): void => {
      if (timer.current !== null) {
        void saveRef.current().catch(() => undefined)
      }
    }
    window.addEventListener("beforeunload", flush)
    return () => {
      window.removeEventListener("beforeunload", flush)
      flush()
    }
  }, [])

  // The line changed from elsewhere (an AI run, Accept): show it unless you have
  // unsaved typing. Main trims what it saves, so your own save coming back without
  // its trailing space is not a change.
  const words = line.words ?? ""
  useEffect(() => {
    if (typed.current === sent.current && words !== typed.current.trim()) {
      show(words)
    }
  }, [words, show])

  const run = (kind: Busy, work: () => Promise<void>): void => {
    setBusy(kind)
    setFailure(null)
    setNotice(null)
    work().then(
      () => {
        setBusy(null)
      },
      (error: unknown) => {
        setBusy(null)
        setFailure(errorMessage(error))
      },
    )
  }

  const accept = (): void => {
    run("accept", async () => {
      await save()
      onLine(await api.acceptLine(sessionId, index))
    })
  }

  const ask = (): void => {
    setConfirming(false)
    cancelTimer()()
    run("ask", async () => {
      const { line: next, keptEdit } = await api.retranslate(sessionId, index, hint.trim())
      onLine(next)
      edited.current = keptEdit
      show(next.words ?? "")
      if (keptEdit) {
        setNotice("Kept your edit; the AI's suggestion was not applied.")
      }
    })
  }

  const draftRule = (): void => {
    run("draft", async () => {
      await save()
      setDraft(await api.draftRule(sessionId, index))
    })
  }

  const count = visibleLength(text)
  const over = count > line.budget

  return (
    <div className="line-editor">
      <p className="line-panel-meta">{metaOf(line)}</p>
      <div className="line-field">
        <span className="field-label">English</span>
        <p className="line-english">{line.english}</p>
      </div>
      <div className="line-field">
        <span className="line-field-head">
          <label className="field-label" htmlFor={editorId}>
            Portuguese
          </label>
          <span className={over ? "line-count over" : "line-count"} aria-live="polite">
            {`${String(count)} / ${String(line.budget)}`}
          </span>
        </span>
        <textarea
          id={editorId}
          rows={3}
          value={text}
          // An edit made while the AI answers would be lost to its suggestion.
          disabled={busy === "ask"}
          onChange={(event) => {
            const next = event.target.value
            typed.current = next
            edited.current = true
            setText(next)
            setNotice(null)
            if (timer.current !== null) {
              clearTimeout(timer.current)
            }
            if (settleTyping.current === null) {
              markSaving(
                new Promise<void>((resolve) => {
                  settleTyping.current = resolve
                }),
              )
            }
            timer.current = setTimeout(() => {
              timer.current = null
              void save().catch(() => undefined)
            }, SAVE_DELAY_MS)
          }}
          onBlur={() => {
            void save().catch(() => undefined)
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation()
              void save().catch(() => undefined)
              onLeave()
            }
          }}
        />
      </div>
      {line.flag === null ? null : (
        <div className="line-flag-row">
          <p className="line-flag-reason">{`⚑ ${line.flag}`}</p>
          <button type="button" disabled={busy !== null} onClick={accept}>
            Accept
          </button>
        </div>
      )}
      <div className="line-ask">
        <label className="line-field">
          <span className="field-label">Hint (optional)</span>
          <input
            value={hint}
            onChange={(event) => {
              setHint(event.target.value)
            }}
          />
        </label>
        <div className="line-actions">
          <button
            type="button"
            disabled={busy !== null || confirming}
            onClick={() => {
              // A line you wrote, or edited here (even if just saved), is yours.
              if (line.origin === "manual" || edited.current) {
                setConfirming(true)
              } else {
                ask()
              }
            }}
          >
            Ask AI again
          </button>
          <button type="button" disabled={busy !== null} onClick={draftRule}>
            Make a rule…
          </button>
        </div>
        {confirming ? (
          <div className="line-confirm" role="group" aria-label="Confirm">
            <p>This replaces your translation. Ask anyway?</p>
            <div className="line-actions">
              <button type="button" className="primary" onClick={ask}>
                Ask
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {busy === null ? null : (
        <p className="muted" role="status">
          {BUSY_TEXT[busy]}
        </p>
      )}
      {notice === null ? null : (
        <p className="line-notice" role="status">
          {notice}
        </p>
      )}
      {failure === null ? null : (
        <p className="error-line" role="alert">
          {failure}
        </p>
      )}
      {draft === null ? null : (
        <RuleDraftDialog
          draft={draft}
          owner={owner}
          styleOwner={styleOwner}
          onSaved={() => {
            setDraft(null)
            setNotice("Rule saved")
          }}
          onClose={() => {
            setDraft(null)
          }}
        />
      )}
    </div>
  )
}
