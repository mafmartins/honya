import type { Rule } from "../../shared/api"
import { formatRule } from "../format"

export function RuleList(props: {
  rules: Rule[]
  onDelete: (index: number) => void
}): React.JSX.Element {
  if (props.rules.length === 0) {
    return <p className="muted">No rules yet.</p>
  }
  return (
    <ul className="rules">
      {props.rules.map((rule, index) => {
        const text = formatRule(rule)
        return (
          <li key={`${String(index)}-${text}`}>
            <span>{text}</span>{" "}
            <button
              type="button"
              aria-label={`Delete rule ${text}`}
              onClick={() => {
                props.onDelete(index)
              }}
            >
              ✕
            </button>
          </li>
        )
      })}
    </ul>
  )
}
