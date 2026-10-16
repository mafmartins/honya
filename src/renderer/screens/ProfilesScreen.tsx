import { VARIANTS, type Variant } from "../../shared/api"
import { BaseSection } from "../components/BaseSection"
import { KeysSection } from "../components/KeysSection"
import { ModelsSection } from "../components/ModelsSection"
import { SeriesSection } from "../components/SeriesSection"

export function ProfilesScreen(props: {
  variant: Variant
  onVariantChange: (variant: Variant) => void
  onBack: () => void
}): React.JSX.Element {
  return (
    <>
      <header className="card-header">
        <button type="button" className="link" onClick={props.onBack}>
          Back
        </button>
        <select
          aria-label="profiles variant"
          value={props.variant}
          onChange={(event) => {
            const variant = VARIANTS.find((item) => item === event.target.value)
            if (variant !== undefined) {
              props.onVariantChange(variant)
            }
          }}
        >
          {VARIANTS.map((variant) => (
            <option key={variant}>{variant}</option>
          ))}
        </select>
      </header>
      <div className="split">
        <div>
          <BaseSection key={props.variant} variant={props.variant} />
        </div>
        <div className="decision">
          <SeriesSection key={props.variant} variant={props.variant} />
          <KeysSection />
          <ModelsSection />
        </div>
      </div>
    </>
  )
}
