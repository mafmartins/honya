export function HaltPanel(props: {
  kind: "stopped" | "failed"
  onResume: () => void
  onBack: () => void
}): React.JSX.Element {
  return (
    <section>
      {props.kind === "stopped" ? <p>Stopped. Finished batches are saved.</p> : null}
      <button type="button" className="action" onClick={props.onResume}>
        {props.kind === "failed" ? "Retry" : "Continue"}
      </button>
      <button type="button" onClick={props.onBack}>
        Back to Start
      </button>
    </section>
  )
}
