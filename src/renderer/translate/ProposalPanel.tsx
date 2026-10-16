import { useState } from "react"
import type { Proposal, ReviewLine } from "../../shared/api"
import { formatRule } from "../format"

export type RuleTarget = "series" | "base" | null

export function ProposalPanel(props: {
  proposal: Proposal
  lines: ReviewLine[]
  busy: boolean
  onConfirm: (applyOthers: boolean, ruleTarget: RuleTarget) => void
  onCancel: () => void
}): React.JSX.Element {
  const { proposal } = props
  const [applyOthers, setApplyOthers] = useState(true)
  const [target, setTarget] = useState<"series" | "base" | "none">("none")
  const count = proposal.siblings.length
  const before = (eventIndex: number): string =>
    props.lines.find((line) => line.eventIndex === eventIndex)?.words ?? ""
  return (
    <section className="proposal">
      {count === 0 ? null : (
        <>
          <ul className="siblings">
            {proposal.siblings.map((sibling) => (
              <li key={sibling.eventIndex}>{`${before(sibling.eventIndex)} → ${sibling.words}`}</li>
            ))}
          </ul>
          <label>
            <input
              type="checkbox"
              checked={applyOthers}
              onChange={(event) => {
                setApplyOthers(event.target.checked)
              }}
            />
            {`Also change these ${String(count)} lines`}
          </label>
        </>
      )}
      {proposal.rule === null ? null : (
        <fieldset>
          <p>{formatRule(proposal.rule)}</p>
          {(
            [
              ["series", "Save to series"],
              ["base", "Save to base"],
              ["none", "Don't save"],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="rule-target"
                checked={target === value}
                onChange={() => {
                  setTarget(value)
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      <button
        type="button"
        className="action"
        disabled={props.busy}
        onClick={() => {
          props.onConfirm(
            count > 0 && applyOthers,
            proposal.rule === null || target === "none" ? null : target,
          )
        }}
      >
        Confirm
      </button>
      <button type="button" disabled={props.busy} onClick={props.onCancel}>
        Cancel
      </button>
    </section>
  )
}
