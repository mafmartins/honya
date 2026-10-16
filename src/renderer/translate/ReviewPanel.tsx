import { useCallback, useEffect, useRef, useState } from "react"
import type { Proposal, ReviewLine, ReviewView } from "../../shared/api"
import { useAction } from "../action"
import { useApi } from "../api"
import { ProposalPanel, type RuleTarget } from "./ProposalPanel"

const CHECKING = "Checking whether this is a lasting change…"
const FAILED = "The check couldn't run. Your edit is kept on this line only."

function isOpen(line: ReviewLine): boolean {
  return line.flagged && !line.accepted
}

function nextOpen(lines: ReviewLine[], from: number): number | null {
  const open = lines.map((line, position) => ({ line, position })).filter((e) => isOpen(e.line))
  const after = open.find((entry) => entry.position > from) ?? open[0]
  return after === undefined ? null : after.position
}

function previousOpen(lines: ReviewLine[], from: number): number | null {
  const open = lines.map((line, position) => ({ line, position })).filter((e) => isOpen(e.line))
  const before = [...open].reverse().find((entry) => entry.position < from) ?? open[open.length - 1]
  return before === undefined ? null : before.position
}

export function ReviewPanel(props: { sessionId: string; onFinish: () => void }): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const { sessionId, onFinish } = props
  const [view, setView] = useState<ReviewView | null>(null)
  const [position, setPosition] = useState(0)
  const [words, setWords] = useState("")
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [offer, setOffer] = useState<{
    eventIndex: number
    words: string
    proposal: Proposal
  } | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const loaded = useRef(false)

  const load = useCallback((): void => {
    act(async () => {
      try {
        const first = await api.loadReview(sessionId)
        if (first.openFlags === 0) {
          onFinish()
          return
        }
        const start = nextOpen(first.lines, -1) ?? 0
        setPosition(start)
        setWords(first.lines[start]?.words ?? "")
        setView(first)
      } catch (error) {
        setLoadFailed(true)
        throw error
      }
    })
  }, [api, act, sessionId, onFinish])

  useEffect(() => {
    if (loaded.current) {
      return
    }
    loaded.current = true
    load()
  }, [load])

  if (view === null) {
    return loadFailed ? (
      <button
        type="button"
        onClick={() => {
          setLoadFailed(false)
          load()
        }}
      >
        Try again
      </button>
    ) : (
      <p>Loading review…</p>
    )
  }
  const current = view.lines[position]
  if (current === undefined) {
    return <p>Nothing to review.</p>
  }
  const edited = words !== current.words

  const open = (target: number | null): void => {
    if (target !== null && target !== position) {
      setPosition(target)
      setWords(view.lines[target]?.words ?? "")
      setFailed(false)
      setOffer(null)
    }
  }
  const adopt = (next: ReviewView, eventIndex: number, stay: boolean): void => {
    setView(next)
    setBusy(false)
    setChecking(false)
    setOffer(null)
    if (!stay) {
      const here = next.lines.findIndex((entry) => entry.eventIndex === eventIndex)
      const from = here < 0 ? position : here
      const index = nextOpen(next.lines, from) ?? from
      setPosition(index)
      setWords(next.lines[index]?.words ?? "")
    }
  }
  const run = (task: () => Promise<void>): void => {
    setBusy(true)
    act(async () => {
      try {
        await task()
      } catch (error) {
        setBusy(false)
        setChecking(false)
        throw error
      }
    })
  }
  const accept = (): void => {
    setFailed(false)
    const eventIndex = current.eventIndex
    if (!edited) {
      run(async () => {
        adopt(await api.acceptLine(sessionId, eventIndex, null), eventIndex, false)
      })
      return
    }
    run(async () => {
      setChecking(true)
      const result = await api.checkEdit(sessionId, eventIndex, words)
      if (result.status === "proposal") {
        setBusy(false)
        setChecking(false)
        setOffer({ eventIndex, words, proposal: result.proposal })
      } else if (result.status === "none") {
        adopt(await api.acceptLine(sessionId, eventIndex, words), eventIndex, false)
      } else {
        adopt(await api.acceptLine(sessionId, eventIndex, words), eventIndex, true)
        setFailed(true)
      }
    })
  }
  const retry = (): void => {
    const eventIndex = current.eventIndex
    run(async () => {
      setChecking(true)
      const result = await api.checkEdit(sessionId, eventIndex, words)
      if (result.status === "proposal") {
        setBusy(false)
        setChecking(false)
        setFailed(false)
        setOffer({ eventIndex, words, proposal: result.proposal })
      } else if (result.status === "none") {
        setBusy(false)
        setChecking(false)
        setFailed(false)
        open(nextOpen(view.lines, position))
      } else {
        setBusy(false)
        setChecking(false)
      }
    })
  }

  const before = view.lines[position - 1]
  const after = view.lines[position + 1]
  return (
    <section className="review">
      <p>{`${view.seriesName} · ${view.scriptName} · ${String(view.openFlags)} flags`}</p>
      <p>{`${view.variant} · ${view.preset}`}</p>
      <div className="review-cols">
        <div className="review-left">
          {before === undefined ? null : <p className="faded">{before.words}</p>}
          <p className="current">{current.words}</p>
          {current.note === null ? null : <p className="note">{`{note: ${current.note}}`}</p>}
          {after === undefined ? null : <p className="faded">{after.words}</p>}
        </div>
        <div className="review-right">
          <p className="english">{current.english}</p>
          {offer === null ? (
            <>
              <textarea
                key={current.eventIndex}
                aria-label="translation"
                value={words}
                onChange={(event) => {
                  setWords(event.target.value)
                }}
              />
              {checking ? <p className="muted">{CHECKING}</p> : null}
              {failed ? (
                <>
                  <p className="note">{FAILED}</p>
                  <button type="button" disabled={busy} onClick={retry}>
                    Retry check
                  </button>
                </>
              ) : null}
              <button type="button" className="action" disabled={busy} onClick={accept}>
                Accept
              </button>
            </>
          ) : (
            <ProposalPanel
              proposal={offer.proposal}
              lines={view.lines}
              busy={busy}
              onCancel={() => {
                setOffer(null)
              }}
              onConfirm={(applyOthers: boolean, ruleTarget: RuleTarget) => {
                const chosen = offer
                run(async () => {
                  adopt(
                    await api.confirmEdit(
                      sessionId,
                      chosen.eventIndex,
                      chosen.words,
                      chosen.proposal,
                      applyOthers,
                      ruleTarget,
                    ),
                    chosen.eventIndex,
                    false,
                  )
                })
              }}
            />
          )}
        </div>
      </div>
      <div className="review-nav">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            open(previousOpen(view.lines, position))
          }}
        >
          Previous flag
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            open(nextOpen(view.lines, position))
          }}
        >
          Next flag
        </button>
        <button type="button" className="action" disabled={view.openFlags !== 0} onClick={onFinish}>
          Finish
        </button>
      </div>
      <div className="review-all">
        <ul role="list" aria-label="all lines">
          {view.lines.map((line, index) => (
            <li key={line.eventIndex}>
              <button
                type="button"
                disabled={busy}
                className={`link${line.flagged ? " flagged" : ""}${index === position ? " here" : ""}`}
                onClick={() => {
                  open(index)
                }}
              >
                {line.words}
                {isOpen(line) ? " ⚑" : ""}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
