import { useState } from "react"
import type { ListedStyle } from "../../shared/api"

type Choice = "dialogue" | "skip" | null

export function StyleChecklist(props: {
  styles: ListedStyle[]
  onConfirm: (dialogueStyles: string[]) => void
  // Without it there is no Cancel button.
  onCancel?: () => void
  confirmLabel?: string
}): React.JSX.Element {
  const [choices, setChoices] = useState<Map<string, Choice>>(
    () =>
      new Map(
        props.styles.map((style) => [style.name, style.guess === "ambiguous" ? null : style.guess]),
      ),
  )
  const ready = [...choices.values()].every((choice) => choice !== null)
  const choose = (name: string, choice: Choice): void => {
    setChoices((current) => new Map(current).set(name, choice))
  }
  return (
    <div className="style-checklist">
      <ul className="style-list">
        {props.styles.map((style) => (
          <li key={style.name} className="style-row">
            <span className="style-name">{style.name}</span>
            {(["dialogue", "skip"] as const).map((choice) => (
              <label key={choice} className="choice">
                <input
                  type="radio"
                  name={`style-${style.name}`}
                  aria-label={`${style.name} ${choice}`}
                  checked={choices.get(style.name) === choice}
                  onChange={() => {
                    choose(style.name, choice)
                  }}
                />
                {choice}
              </label>
            ))}
          </li>
        ))}
      </ul>
      <div className="style-actions">
        <button
          type="button"
          className="primary"
          disabled={!ready}
          onClick={() => {
            props.onConfirm(
              [...choices].filter(([, choice]) => choice === "dialogue").map(([name]) => name),
            )
          }}
        >
          {props.confirmLabel ?? "Import"}
        </button>
        {props.onCancel === undefined ? null : (
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
