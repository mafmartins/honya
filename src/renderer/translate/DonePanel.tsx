import type { FinishResult } from "../../shared/api"

function duration(elapsedMs: number): string {
  const total = Math.floor(elapsedMs / 1000)
  return `${String(Math.floor(total / 60))} min ${String(total % 60)} s`
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
  rows.push(["Time", duration(report.elapsedMs)], ["Saved to", props.result.outputPath])
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
      <button type="button" className="action" onClick={props.onReveal}>
        Show in Finder
      </button>
      <button type="button" onClick={props.onAnother}>
        Translate another
      </button>
    </section>
  )
}
