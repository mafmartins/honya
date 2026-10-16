import { useState } from "react"
import type { Rule } from "../../shared/api"

export function RuleEditor(props: { onAdd: (rule: Rule) => void }): React.JSX.Element {
  const [kind, setKind] = useState<"prose" | "glossary">("prose")
  const [text, setText] = useState("")
  const [source, setSource] = useState("")
  const [pt, setPt] = useState("")
  const ready = kind === "prose" ? text.trim() !== "" : source.trim() !== "" && pt.trim() !== ""
  return (
    <div>
      <select
        aria-label="rule kind"
        value={kind}
        onChange={(event) => {
          setKind(event.target.value === "glossary" ? "glossary" : "prose")
        }}
      >
        <option value="prose">prose</option>
        <option value="glossary">glossary</option>
      </select>
      {kind === "prose" ? (
        <input
          aria-label="rule text"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
          }}
        />
      ) : (
        <>
          <input
            aria-label="english"
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
            }}
          />
          <input
            aria-label="portuguese"
            value={pt}
            onChange={(event) => {
              setPt(event.target.value)
            }}
          />
        </>
      )}
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          props.onAdd(
            kind === "prose"
              ? { kind: "prose", text: text.trim() }
              : { kind: "glossary", source: source.trim(), pt: pt.trim() },
          )
          setText("")
          setSource("")
          setPt("")
        }}
      >
        Add rule
      </button>
    </div>
  )
}
