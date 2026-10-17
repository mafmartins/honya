import type { FinishResult } from "../../shared/api"

function duration(elapsedMs: number): string {
  const total = Math.floor(elapsedMs / 1000)
  return `${String(Math.floor(total / 60))} min ${String(total % 60)} s`
}

type Cost = FinishResult["report"]["cost"]

function tokens(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

// "≈ $0.07 · 14 requests, 28.0k in / 13.3k out", noting models without a known price.
export function costText(cost: Cost): string {
  const usage = `${String(cost.requests)} requests, ${tokens(cost.input)} tokens in / ${tokens(cost.output)} out`
  const money =
    cost.usd === null
      ? "price unknown"
      : `≈ $${cost.usd < 0.01 && cost.usd > 0 ? "<0.01" : cost.usd.toFixed(2)}`
  const missing =
    cost.usd !== null && cost.unpriced.length > 0 ? ` (without ${cost.unpriced.join(", ")})` : ""
  return `${money}${missing} · ${usage}`
}

export function DonePanel(props: {
  result: FinishResult
  onReveal: () => void
  onAnother: () => void
}): React.JSX.Element {
  const { report } = props.result
  const rows: [string, string][] = [
    ["Lines translated", `${String(report.translated)} of ${String(report.dialogueLines)}`],
    ["Sent to the strong model", String(report.strongModel)],
    ["Left in English", String(report.leftInEnglish)],
    ["Over the reading speed limit", String(report.overLimit)],
    [
      "Flags",
      `${String(report.flags)}: ${String(report.editedFlags)} edited, ${String(report.acceptedAsIs)} accepted as they were`,
    ],
    [
      "Rules saved",
      `${String(report.rulesSaved.series)} to the series, ${String(report.rulesSaved.base)} to the base`,
    ],
  ]
  if (report.framesUsed !== 0 || report.frameFailures !== 0) {
    rows.push([
      "Frames",
      `${String(report.framesUsed)} used, ${String(report.frameFailures)} couldn't be grabbed`,
    ])
  }
  if (report.unchanged !== 0) {
    rows.push(["Events copied unchanged", String(report.unchanged)])
  }
  rows.push(
    ["Cost", costText(report.cost)],
    ["Time", duration(report.elapsedMs)],
    ["Saved to", props.result.outputPath],
  )
  return (
    <section className="done">
      <h2>Done</h2>
      <dl className="report">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">Cost is estimated from list prices; a free tier costs nothing.</p>
      <button type="button" className="action" onClick={props.onReveal}>
        Show in Finder
      </button>
      <button type="button" onClick={props.onAnother}>
        Translate another
      </button>
    </section>
  )
}
