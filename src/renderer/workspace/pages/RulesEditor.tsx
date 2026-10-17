import { useState } from "react"
import type { Rule } from "../../../shared/api"
import { useAction } from "../../action"
import { formatRule } from "../../format"

type Editing =
  | { index: number; kind: "prose"; text: string }
  | { index: number; kind: "glossary"; source: string; pt: string }

// The owner's rules in two lists, prose rules and the glossary. The owner's own entries
// can be added, edited in place and deleted; a project's inherited ones are greyed with
// where they come from. One search box filters both lists. Every change saves the whole
// own list through onSave.
export function RulesEditor({
  own,
  inherited,
  inheritedFrom,
  onSave,
}: {
  own: Rule[]
  inherited: Rule[]
  // The style the inherited entries come from, like "PT-PT style".
  inheritedFrom: string | null
  onSave: (rules: Rule[]) => Promise<void>
}): React.JSX.Element {
  const act = useAction()
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<Editing | null>(null)
  const [newText, setNewText] = useState("")
  const [newSource, setNewSource] = useState("")
  const [newPt, setNewPt] = useState("")
  const [saving, setSaving] = useState(false)

  const save = (next: Rule[], after: () => void): void => {
    setSaving(true)
    act(async () => {
      try {
        await onSave(next)
        after()
      } finally {
        setSaving(false)
      }
    })
  }

  const needle = query.trim().toLowerCase()
  const matches = (rule: Rule): boolean =>
    needle === "" || formatRule(rule).toLowerCase().includes(needle)
  const ownOf = (kind: Rule["kind"]): { rule: Rule; index: number }[] =>
    own.flatMap((rule, index) => (rule.kind === kind && matches(rule) ? [{ rule, index }] : []))
  const inheritedOf = (kind: Rule["kind"]): Rule[] =>
    inherited.filter((rule) => rule.kind === kind && matches(rule))

  const replace = (index: number, rule: Rule): Rule[] =>
    own.map((item, at) => (at === index ? rule : item))
  const remove = (index: number): Rule[] => own.filter((_, at) => at !== index)

  const ownRow = (rule: Rule, index: number): React.JSX.Element => {
    const text = formatRule(rule)
    if (editing !== null && editing.index === index) {
      const ready =
        editing.kind === "prose"
          ? editing.text.trim() !== ""
          : editing.source.trim() !== "" && editing.pt.trim() !== ""
      const edited: Rule =
        editing.kind === "prose"
          ? { kind: "prose", text: editing.text.trim() }
          : { kind: "glossary", source: editing.source.trim(), pt: editing.pt.trim() }
      return (
        <li key={`edit-${String(index)}`} className="rule-row rule-editing">
          {editing.kind === "prose" ? (
            <input
              aria-label="Rule"
              value={editing.text}
              onChange={(event) => {
                setEditing({ ...editing, text: event.target.value })
              }}
            />
          ) : (
            <span className="rule-pair">
              <input
                aria-label="English"
                value={editing.source}
                onChange={(event) => {
                  setEditing({ ...editing, source: event.target.value })
                }}
              />
              <input
                aria-label="Portuguese"
                value={editing.pt}
                onChange={(event) => {
                  setEditing({ ...editing, pt: event.target.value })
                }}
              />
            </span>
          )}
          <span className="row-actions">
            <button
              type="button"
              className="primary"
              disabled={!ready || saving}
              onClick={() => {
                save(replace(index, edited), () => {
                  setEditing(null)
                })
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null)
              }}
            >
              Cancel
            </button>
          </span>
        </li>
      )
    }
    return (
      <li key={`own-${String(index)}-${text}`} className="rule-row">
        <RuleText rule={rule} />
        <span className="row-actions">
          <button
            type="button"
            aria-label={`Edit “${text}”`}
            disabled={saving}
            onClick={() => {
              setEditing(
                rule.kind === "prose"
                  ? { index, kind: "prose", text: rule.text }
                  : { index, kind: "glossary", source: rule.source, pt: rule.pt },
              )
            }}
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Delete “${text}”`}
            disabled={saving}
            onClick={() => {
              save(remove(index), () => {
                setEditing(null)
              })
            }}
          >
            Delete
          </button>
        </span>
      </li>
    )
  }

  const inheritedRow = (rule: Rule, index: number): React.JSX.Element => (
    <li key={`inherited-${String(index)}-${formatRule(rule)}`} className="rule-row inherited">
      <RuleText rule={rule} />
      {inheritedFrom === null ? null : <span className="tag">{`from ${inheritedFrom}`}</span>}
    </li>
  )

  const list = (kind: Rule["kind"], empty: string): React.JSX.Element => {
    const mine = ownOf(kind)
    const theirs = inheritedOf(kind)
    if (mine.length === 0 && theirs.length === 0) {
      return <p className="hint">{needle === "" ? empty : "Nothing matches the search."}</p>
    }
    return (
      <ul className="rule-list">
        {mine.map(({ rule, index }) => ownRow(rule, index))}
        {theirs.map(inheritedRow)}
      </ul>
    )
  }

  return (
    <div className="rules-editor">
      <input
        type="search"
        className="rules-search"
        aria-label="Search rules and glossary"
        placeholder="Search rules and glossary"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
        }}
      />
      <div className="rules-group">
        <h3 className="field-label">Rules</h3>
        {list("prose", "No rules yet.")}
        <div className="rule-add">
          <input
            aria-label="New rule"
            placeholder="A rule in your words"
            value={newText}
            onChange={(event) => {
              setNewText(event.target.value)
            }}
          />
          <button
            type="button"
            disabled={newText.trim() === "" || saving}
            onClick={() => {
              save([...own, { kind: "prose", text: newText.trim() }], () => {
                setNewText("")
              })
            }}
          >
            Add rule
          </button>
        </div>
      </div>
      <div className="rules-group">
        <h3 className="field-label">Glossary</h3>
        {list("glossary", "No glossary entries yet.")}
        <div className="rule-add">
          <span className="rule-pair">
            <input
              aria-label="New glossary English"
              placeholder="English"
              value={newSource}
              onChange={(event) => {
                setNewSource(event.target.value)
              }}
            />
            <input
              aria-label="New glossary Portuguese"
              placeholder="Portuguese"
              value={newPt}
              onChange={(event) => {
                setNewPt(event.target.value)
              }}
            />
          </span>
          <button
            type="button"
            disabled={newSource.trim() === "" || newPt.trim() === "" || saving}
            onClick={() => {
              save(
                [...own, { kind: "glossary", source: newSource.trim(), pt: newPt.trim() }],
                () => {
                  setNewSource("")
                  setNewPt("")
                },
              )
            }}
          >
            Add to glossary
          </button>
        </div>
      </div>
    </div>
  )
}

function RuleText({ rule }: { rule: Rule }): React.JSX.Element {
  if (rule.kind === "prose") {
    return <span className="rule-text">{rule.text}</span>
  }
  return (
    <span className="rule-text rule-pair">
      <span>{rule.source}</span>
      <span aria-hidden="true">→</span>
      <span>{rule.pt}</span>
    </span>
  )
}
