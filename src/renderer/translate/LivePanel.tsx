import { useEffect, useRef } from "react"
import type { LiveLine } from "../../shared/api"

export interface Progress {
  index: number
  total: number
  linesDone: number
  lineTotal: number
}

export function LivePanel(props: {
  progress: Progress | null
  activity: string | null
  lines: LiveLine[]
  stopping: boolean
  onStop: () => void
}): React.JSX.Element {
  const list = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const count = props.lines.length
  useEffect(() => {
    const element = list.current
    if (element !== null && pinned.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [count])
  const { progress } = props
  return (
    <section>
      <p>
        {progress === null
          ? "Starting…"
          : `Batch ${String(progress.index)} of ${String(progress.total)}`}
      </p>
      <progress value={progress?.linesDone ?? 0} max={progress?.lineTotal ?? 1} />
      {progress === null ? null : (
        <p>{`${String(progress.linesDone)} of ${String(progress.lineTotal)} lines`}</p>
      )}
      {props.activity === null ? null : <p className="muted">{props.activity}</p>}
      <div
        className="live-scroll"
        ref={list}
        onScroll={(event) => {
          const element = event.currentTarget
          pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 8
        }}
      >
        <ul className="live" role="list" aria-label="live lines">
          {props.lines.map((line) => (
            <li key={line.eventIndex} className={line.note === null ? undefined : "noted"}>
              <span className="english">{line.english}</span>
              <span className="words">{line.words}</span>
              {line.note === null ? null : <span className="note">{`{note: ${line.note}}`}</span>}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" disabled={props.stopping} onClick={props.onStop}>
        {props.stopping ? "Stopping after this batch…" : "Stop"}
      </button>
    </section>
  )
}
