import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import type { LineView } from "../../../shared/api"
import { formatCueTime } from "../../format"

export const ROW_HEIGHT = 44
// Rows rendered above and below the visible ones, so a quick scroll never shows a gap.
const OVERSCAN = 10
// Rows assumed visible before the list has a height (and in tests, where it never does).
const FALLBACK_ROWS = 40

function rowId(index: number): string {
  return `line-row-${String(index)}`
}

// The session's lines as a table: number, time, English, Portuguese and mark.
// Only the rows in view (± OVERSCAN) are in the DOM; spacers keep the scroll height.
export function LineList({
  lines,
  selected,
  working,
  onSelect,
  onEdit,
  focusRef,
}: {
  lines: readonly LineView[]
  selected: number | null
  // Lines the AI is translating right now; shown busy until their Portuguese arrives.
  working: ReadonlySet<number>
  onSelect: (index: number) => void
  // Enter on the selected line: the panel takes the focus for editing.
  onEdit?: (index: number) => void
  focusRef?: RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const ownRef = useRef<HTMLDivElement>(null)
  const ref = focusRef ?? ownRef
  const [scrolled, setScrollTop] = useState(0)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) {
      return
    }
    setHeight(element.clientHeight)
    if (typeof ResizeObserver === "undefined") {
      return
    }
    const observer = new ResizeObserver(() => {
      setHeight(element.clientHeight)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [ref])
  const viewport = height > 0 ? height : FALLBACK_ROWS * ROW_HEIGHT
  // A filter can shorten the list below where it was scrolled to.
  const scrollTop = Math.min(scrolled, Math.max(0, (lines.length + 1) * ROW_HEIGHT - viewport))
  // The sticky header takes the first row's height at the top of the scroll area.
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 1 - OVERSCAN)
  const last = Math.min(lines.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN)
  const position = lines.findIndex((line) => line.index === selected)

  // Moves the selection and keeps it clear of the sticky header and the bottom edge.
  const move = (step: number): void => {
    const next = Math.min(lines.length - 1, Math.max(0, position < 0 ? 0 : position + step))
    const target = lines[next]
    if (target === undefined) {
      return
    }
    onSelect(target.index)
    const top = next * ROW_HEIGHT
    const scrollTo =
      top < scrollTop
        ? top
        : top + 2 * ROW_HEIGHT > scrollTop + viewport
          ? top + 2 * ROW_HEIGHT - viewport
          : null
    if (scrollTo !== null) {
      const element = ref.current
      if (element !== null) {
        element.scrollTop = scrollTo
      }
      setScrollTop(scrollTo)
    }
  }
  return (
    <div
      ref={ref}
      className="line-list"
      role="grid"
      aria-label="Lines"
      aria-rowcount={lines.length + 1}
      aria-activedescendant={selected === null || position < 0 ? undefined : rowId(selected)}
      tabIndex={0}
      onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop)
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault()
          move(1)
        } else if (event.key === "ArrowUp") {
          event.preventDefault()
          move(-1)
        } else if (event.key === "Enter" && selected !== null && position >= 0) {
          event.preventDefault()
          onEdit?.(selected)
        }
      }}
    >
      <div className="line-row line-head" role="row" aria-rowindex={1}>
        <span role="columnheader" className="line-number">
          #
        </span>
        <span role="columnheader">Time</span>
        <span role="columnheader">English</span>
        <span role="columnheader">Portuguese</span>
        <span role="columnheader" aria-label="Mark" />
      </div>
      <div aria-hidden="true" style={{ height: first * ROW_HEIGHT }} />
      {lines.slice(first, last).map((line, offset) => (
        <LineRow
          key={line.index}
          line={line}
          rowIndex={first + offset + 2}
          selected={line.index === selected}
          working={working.has(line.index) && line.words === null}
          onSelect={onSelect}
        />
      ))}
      <div aria-hidden="true" style={{ height: (lines.length - last) * ROW_HEIGHT }} />
    </div>
  )
}

function LineRow({
  line,
  rowIndex,
  selected,
  working,
  onSelect,
}: {
  line: LineView
  rowIndex: number
  selected: boolean
  working: boolean
  onSelect: (index: number) => void
}): React.JSX.Element {
  return (
    <div
      id={rowId(line.index)}
      className={working ? "line-row line-working" : "line-row"}
      role="row"
      aria-rowindex={rowIndex}
      aria-selected={selected}
      aria-busy={working || undefined}
      onClick={() => {
        onSelect(line.index)
      }}
    >
      <span role="gridcell" className="line-number">
        {line.index + 1}
      </span>
      <span role="gridcell" className="line-time">
        {formatCueTime(line.start)}
      </span>
      <span role="gridcell" className="line-text line-english">
        {line.english}
      </span>
      <span role="gridcell" className="line-portuguese">
        {working ? (
          <span className="line-text line-missing">Translating…</span>
        ) : line.words === null ? (
          <span className="line-text line-missing" aria-label="not translated yet">
            —
          </span>
        ) : (
          <span className="line-text">{line.words}</span>
        )}
        {line.origin === "manual" && line.words !== null ? (
          <span className="line-you">you</span>
        ) : null}
      </span>
      <span role="gridcell" className="line-mark">
        {line.flag === null ? null : (
          <span className="line-flag" title={line.flag}>
            ⚑
          </span>
        )}
      </span>
    </div>
  )
}
