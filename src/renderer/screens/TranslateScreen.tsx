import type { TranslateTarget } from "../App"

export function TranslateScreen(props: {
  target: TranslateTarget
  onBack: () => void
  onAnother: () => void
}): React.JSX.Element {
  return (
    <>
      <header className="card-header">
        <h1>Translate</h1>
        <button type="button" className="link" onClick={props.onBack}>
          Back
        </button>
      </header>
    </>
  )
}
