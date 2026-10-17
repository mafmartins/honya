import { useEffect, useState } from "react"
import {
  PROVIDERS,
  type Learned,
  type LearnScript,
  type PickedExample,
  type ProviderId,
  type Rule,
  type Variant,
} from "../../shared/api"
import { useAction } from "../action"
import { useApi } from "../api"
import { formatRule } from "../format"
import { StyleChecklist } from "./StyleChecklist"

type Step =
  | { kind: "idle" }
  | { kind: "pt-styles"; picked: PickedExample }
  | { kind: "ready"; pt: Named; en: Named | null }
  | { kind: "en-styles"; pt: Named; picked: PickedExample }
  | { kind: "learning"; pt: Named; en: Named | null }
  | { kind: "proposals"; learned: Learned; chosen: Set<number> }

type Named = LearnScript & { name: string }

// Reads an episode the translator already did and offers glossary entries and rules
// for the series. Proposals are checked by default; only the kept ones are saved.
export function LearnPanel(props: {
  variant: Variant
  seriesId: string
  rules: Rule[]
  onSave: (rules: Rule[]) => void
}): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const [step, setStep] = useState<Step>({ kind: "idle" })
  const [providers, setProviders] = useState<ProviderId[]>([])
  const [provider, setProvider] = useState<ProviderId | null>(null)

  useEffect(() => {
    let current = true
    void Promise.all(PROVIDERS.map((id) => api.hasKey(id))).then((keys) => {
      if (!current) {
        return
      }
      const ready = PROVIDERS.filter((_, index) => keys[index] === true)
      setProviders(ready)
      setProvider(ready[0] ?? null)
    })
    return () => {
      current = false
    }
  }, [api])

  const reset = (): void => {
    setStep({ kind: "idle" })
  }

  if (step.kind === "idle") {
    return (
      <div className="learn">
        <button
          type="button"
          onClick={() => {
            act(async () => {
              const picked = await api.pickExample()
              if (picked !== null) {
                setStep({ kind: "pt-styles", picked })
              }
            })
          }}
        >
          Learn from a translated episode…
        </button>
        <p className="muted">
          Reads one of your finished episodes and suggests glossary entries and rules for this
          series. You choose what to keep.
        </p>
      </div>
    )
  }

  if (step.kind === "pt-styles" || step.kind === "en-styles") {
    const picked = step.picked
    return (
      <div className="learn">
        <p>{`Which styles are dialogue in ${picked.name}?`}</p>
        <StyleChecklist
          styles={picked.styles}
          confirmLabel="Use these styles"
          onCancel={() => {
            setStep(
              step.kind === "pt-styles"
                ? { kind: "idle" }
                : { kind: "ready", pt: step.pt, en: null },
            )
          }}
          onConfirm={(dialogueStyles) => {
            const named = { name: picked.name, text: picked.text, dialogueStyles }
            setStep(
              step.kind === "pt-styles"
                ? { kind: "ready", pt: named, en: null }
                : { kind: "ready", pt: step.pt, en: named },
            )
          }}
        />
      </div>
    )
  }

  if (step.kind === "ready" || step.kind === "learning") {
    const learning = step.kind === "learning"
    return (
      <div className="learn">
        <p>{`Translated episode: ${step.pt.name}`}</p>
        {step.en === null ? (
          <p>
            <button
              type="button"
              disabled={learning}
              onClick={() => {
                act(async () => {
                  const picked = await api.pickExample()
                  if (picked !== null) {
                    setStep({ kind: "en-styles", pt: step.pt, picked })
                  }
                })
              }}
            >
              Add the English script…
            </button>{" "}
            <span className="muted">
              Optional. With it, terms are matched line by line instead of guessed.
            </span>
          </p>
        ) : (
          <p>{`English script: ${step.en.name}`}</p>
        )}
        {providers.length === 0 ? (
          <p className="muted">Add a provider key above to learn from scripts.</p>
        ) : (
          <label>
            <span>provider</span>{" "}
            <select
              id="learn-provider"
              aria-label="provider"
              value={provider ?? ""}
              disabled={learning}
              onChange={(event) => {
                const next = PROVIDERS.find((id) => id === event.target.value)
                setProvider(next ?? null)
              }}
            >
              {providers.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        )}
        <p>
          <button
            type="button"
            className="action"
            disabled={learning || provider === null}
            onClick={() => {
              if (provider === null) {
                return
              }
              const { pt, en } = step
              setStep({ kind: "learning", pt, en })
              act(async () => {
                try {
                  const learned = await api.learnFromScript(
                    props.variant,
                    props.seriesId,
                    provider,
                    script(pt),
                    en === null ? null : script(en),
                  )
                  const total = learned.glossary.length + learned.rules.length
                  setStep({
                    kind: "proposals",
                    learned,
                    chosen: new Set(Array.from({ length: total }, (_, i) => i)),
                  })
                } catch (error) {
                  setStep({ kind: "ready", pt, en })
                  throw error
                }
              })
            }}
          >
            {learning ? "Reading the episode…" : "Learn"}
          </button>{" "}
          <button type="button" disabled={learning} onClick={reset}>
            Cancel
          </button>
        </p>
      </div>
    )
  }

  const { learned, chosen } = step
  const proposals: Rule[] = [...learned.glossary, ...learned.rules]
  if (proposals.length === 0) {
    return (
      <div className="learn">
        <p>Nothing new to suggest: the series rules already cover what this episode shows.</p>
        <button type="button" onClick={reset}>
          Done
        </button>
      </div>
    )
  }
  const toggle = (index: number): void => {
    const next = new Set(chosen)
    if (next.has(index)) {
      next.delete(index)
    } else {
      next.add(index)
    }
    setStep({ kind: "proposals", learned, chosen: next })
  }
  return (
    <div className="learn">
      <p>
        {learned.pairs > 0
          ? `Suggestions from ${String(learned.pairs)} matched lines. Untick what you don't want.`
          : "Suggestions from your Portuguese alone, so check the English terms. Untick what you don't want."}
      </p>
      <ul className="proposals">
        {proposals.map((rule, index) => (
          <li key={index}>
            <label className="picked">
              <input
                type="checkbox"
                checked={chosen.has(index)}
                onChange={() => {
                  toggle(index)
                }}
              />
              {formatRule(rule)}
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="action"
        disabled={chosen.size === 0}
        onClick={() => {
          props.onSave([...props.rules, ...proposals.filter((_, index) => chosen.has(index))])
          reset()
        }}
      >
        {`Save ${String(chosen.size)} to the series`}
      </button>{" "}
      <button type="button" onClick={reset}>
        Discard
      </button>
    </div>
  )
}

function script(named: Named): LearnScript {
  return { text: named.text, dialogueStyles: named.dialogueStyles }
}
