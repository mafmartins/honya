import type { ListedStyle } from "../../shared/api"
import { StyleChecklist } from "../components/StyleChecklist"

export function StylesStep(props: {
  styles: ListedStyle[]
  onConfirm: (dialogueStyles: string[]) => void
  onBack: () => void
}): React.JSX.Element {
  return (
    <section>
      <p>Some styles could not be classified. Choose which ones hold dialogue.</p>
      <StyleChecklist
        styles={props.styles}
        confirmLabel="Start translating"
        onConfirm={props.onConfirm}
        onCancel={props.onBack}
      />
    </section>
  )
}
