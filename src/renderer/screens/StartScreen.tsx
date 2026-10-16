import type { Session } from "../App"

export function StartScreen(props: {
  session: Session
  onChange: (patch: Partial<Session>) => void
  onOpenProfiles: () => void
}): React.JSX.Element {
  return (
    <header className="card-header">
      <button type="button" className="link" onClick={props.onOpenProfiles}>
        Profiles
      </button>
    </header>
  )
}
