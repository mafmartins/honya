import type { ExampleScript, Owner, Variant } from "../../../shared/api"
import { LearnPanel } from "../../components/LearnPanel"

// The reference translations a project or style keeps, and the panel that adds more:
// each one added runs the learning pass, as often as the translator likes.
export function ReferencesPanel({
  owner,
  variant,
  references,
  onChanged,
}: {
  owner: Owner
  variant: Variant
  references: ExampleScript[]
  onChanged: () => void
}): React.JSX.Element {
  return (
    <div className="references">
      {references.length === 0 ? (
        <p className="hint">No reference translations yet.</p>
      ) : (
        <ul className="reference-list">
          {references.map((reference, index) => (
            <li key={`${String(index)}-${reference.name}`}>{reference.name}</li>
          ))}
        </ul>
      )}
      <LearnPanel owner={owner} variant={variant} onChanged={onChanged} />
    </div>
  )
}
