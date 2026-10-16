import type { Variant } from "../../shared/api"

export function ProfilesScreen(props: {
  variant: Variant
  onVariantChange: (variant: Variant) => void
  onBack: () => void
}): React.JSX.Element {
  return (
    <header className="card-header">
      <button type="button" className="link" onClick={props.onBack}>
        Back
      </button>
    </header>
  )
}
