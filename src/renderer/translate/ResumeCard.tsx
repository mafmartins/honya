import type { UnfinishedSession } from "../../shared/api"

export function ResumeCard(props: {
  session: UnfinishedSession
  onResume: () => void
  onDiscard: () => void
}): React.JSX.Element {
  const { session } = props
  const where = `${session.scriptName} · ${session.seriesName}`
  const progress =
    session.phase === "review"
      ? `in review, ${String(session.openFlags)} flags left`
      : `batch ${String(session.completedBatches)} of ${String(session.totalBatches)}`
  return (
    <div className="picked">
      <span className="slot">{`Unfinished: ${where} · ${progress}`}</span>
      <button type="button" className="action" onClick={props.onResume}>
        Resume
      </button>
      <button type="button" onClick={props.onDiscard}>
        Discard
      </button>
    </div>
  )
}
