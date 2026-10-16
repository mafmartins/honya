import { useState } from "react"
import type { ListedStyle } from "../../shared/api"

type Choice = "dialogue" | "skip" | null

export function StyleChecklist(props: {
  styles: ListedStyle[]
  onConfirm: (dialogueStyles: string[]) => void
  onCancel: () => void
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
    <div>
      <ul className="styles">
        {props.styles.map((style) => (
          <li key={style.name}>
            <span className="name">{style.name}</span>{" "}
            {(["dialogue", "skip"] as const).map((choice) => (
              <label key={choice} className="picked">
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
      <button
        type="button"
        className="action"
        disabled={!ready}
        onClick={() => {
          props.onConfirm(
            [...choices].filter(([, choice]) => choice === "dialogue").map(([name]) => name),
          )
        }}
      >
        Import
      </button>
      <button type="button" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  )
}
