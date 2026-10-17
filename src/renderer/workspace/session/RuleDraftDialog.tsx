import { useContext, useState } from "react"
import type { Owner, Rule } from "../../../shared/api"
import { useApi, errorMessage } from "../../api"
import { Dialog } from "../Dialog"
import { styleName } from "../route"
import { SaveStatusContext } from "./useSession"

type Kind = Rule["kind"]
type Target = "project" | "style"

// The rule the AI drafted from a line, to edit and save to the project or the language
// style. The project is preselected.
export function RuleDraftDialog({
  draft,
  owner,
  styleOwner,
  onSaved,
  onClose,
}: {
  draft: Rule
  owner: Owner
  styleOwner: Owner
  onSaved: () => void
  onClose: () => void
}): React.JSX.Element {
  const api = useApi()
  const { markSaving } = useContext(SaveStatusContext)
  const [kind, setKind] = useState<Kind>(draft.kind)
  const [text, setText] = useState(draft.kind === "prose" ? draft.text : "")
  const [source, setSource] = useState(draft.kind === "glossary" ? draft.source : "")
  const [pt, setPt] = useState(draft.kind === "glossary" ? draft.pt : "")
  const [target, setTarget] = useState<Target>("project")
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const rule: Rule | null =
    kind === "prose"
      ? text.trim() === ""
        ? null
        : { kind: "prose", text: text.trim() }
      : source.trim() === "" || pt.trim() === ""
        ? null
        : { kind: "glossary", source: source.trim(), pt: pt.trim() }
  const styleLabel = styleOwner.kind === "style" ? styleName(styleOwner.variant) : "Style"

  const save = (): void => {
    if (rule === null) {
      return
    }
    setSaving(true)
    setFailure(null)
    const work = api.addRule(target === "project" ? owner : styleOwner, rule)
    markSaving(work)
    work.then(onSaved, (error: unknown) => {
      setSaving(false)
      setFailure(errorMessage(error))
    })
  }

  return (
    <Dialog title="Make a rule" onClose={onClose}>
      <div className="dialog-fields">
        <fieldset className="choice-group">
          <legend className="field-label">Kind</legend>
          <label className="choice">
            <input
              type="radio"
              name="rule-kind"
              checked={kind === "prose"}
              onChange={() => {
                setKind("prose")
              }}
            />
            Instruction
          </label>
          <label className="choice">
            <input
              type="radio"
              name="rule-kind"
              checked={kind === "glossary"}
              onChange={() => {
                setKind("glossary")
              }}
            />
            Glossary entry
          </label>
        </fieldset>
        {kind === "prose" ? (
          <label>
            <span className="field-label">Rule</span>
            <textarea
              rows={3}
              value={text}
              onChange={(event) => {
                setText(event.target.value)
              }}
            />
          </label>
        ) : (
          <>
            <label>
              <span className="field-label">English</span>
              <input
                value={source}
                onChange={(event) => {
                  setSource(event.target.value)
                }}
              />
            </label>
            <label>
              <span className="field-label">Portuguese</span>
              <input
                value={pt}
                onChange={(event) => {
                  setPt(event.target.value)
                }}
              />
            </label>
          </>
        )}
        <fieldset className="choice-group">
          <legend className="field-label">Save to</legend>
          <label className="choice">
            <input
              type="radio"
              name="rule-owner"
              checked={target === "project"}
              onChange={() => {
                setTarget("project")
              }}
            />
            This project
          </label>
          <label className="choice">
            <input
              type="radio"
              name="rule-owner"
              checked={target === "style"}
              onChange={() => {
                setTarget("style")
              }}
            />
            {styleLabel}
          </label>
        </fieldset>
        {failure === null ? null : (
          <p className="error-line" role="alert">
            {failure}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={rule === null || saving}
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </Dialog>
  )
}
