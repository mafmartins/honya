import { useEffect, useState } from "react"
import {
  PROVIDERS,
  type Combined,
  type Learned,
  type LearnScript,
  type PickedExample,
  type ProviderId,
  type Rule,
  type Variant,
} from "../../shared/api"
import { useAction } from "../action"
import { errorMessage, useApi } from "../api"
import { formatRule } from "../format"
import { StyleChecklist } from "./StyleChecklist"

type Named = LearnScript & { name: string }

interface Episode {
  pt: Named
  en: Named | null
}

// Where a picked file goes once its dialogue styles are known.
type Target = { kind: "pt" } | { kind: "en"; index: number }

type Phase =
  | { kind: "edit" }
  | { kind: "learning"; text: string }
  | { kind: "proposals"; combined: Combined; chosen: Set<number>; skipped: string[] }

// Reads episodes the translator already did and offers glossary entries and rules for
// the series. With several episodes, suggestions are ranked by how many episodes show
// them, and only those seen more than once start ticked.
export function LearnPanel(props: {
  variant: Variant
  seriesId: string
  rules: Rule[]
  onSave: (rules: Rule[]) => void
}): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [styles, setStyles] = useState<string[] | null>(null)
  const [pending, setPending] = useState<{ picked: PickedExample; target: Target } | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: "edit" })
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
    setEpisodes([])
    setPending(null)
    setPhase({ kind: "edit" })
  }

  const place = (named: Named, target: Target): void => {
    setEpisodes((current) =>
      target.kind === "pt"
        ? [...current, { pt: named, en: null }]
        : current.map((episode, index) =>
            index === target.index ? { ...episode, en: named } : episode,
          ),
    )
  }

  // A file with the styles already chosen reuses them; anything else asks.
  const pick = (target: Target): void => {
    act(async () => {
      const picked = await api.pickExample()
      if (picked === null) {
        return
      }
      const names = new Set(picked.styles.map((style) => style.name))
      const reuse = styles?.filter((style) => names.has(style)) ?? []
      if (reuse.length > 0) {
        place({ name: picked.name, text: picked.text, dialogueStyles: reuse }, target)
      } else {
        setPending({ picked, target })
      }
    })
  }

  const learn = (chosenProvider: ProviderId): void => {
    act(async () => {
      const learned: Learned[] = []
      const skipped: string[] = []
      for (const [index, episode] of episodes.entries()) {
        setPhase({
          kind: "learning",
          text:
            episodes.length === 1
              ? "Reading the episode…"
              : `Reading episode ${String(index + 1)} of ${String(episodes.length)}…`,
        })
        try {
          learned.push(
            await api.learnFromScript(
              props.variant,
              props.seriesId,
              chosenProvider,
              script(episode.pt),
              episode.en === null ? null : script(episode.en),
            ),
          )
        } catch (error) {
          skipped.push(`${episode.pt.name}: ${errorMessage(error)}`)
        }
      }
      if (learned.length === 0) {
        setPhase({ kind: "edit" })
        throw new Error(skipped.join(" "))
      }
      if (learned.length > 1) {
        setPhase({ kind: "learning", text: "Combining what the episodes have in common…" })
      }
      try {
        const combined = await api.combineLearned(chosenProvider, learned)
        const chosen = new Set(
          combined.suggestions.flatMap((suggestion, index) =>
            combined.episodes === 1 || suggestion.episodes > 1 ? [index] : [],
          ),
        )
        setPhase({ kind: "proposals", combined, chosen, skipped })
      } catch (error) {
        setPhase({ kind: "edit" })
        throw error
      }
    })
  }

  if (pending !== null) {
    const { picked, target } = pending
    return (
      <div className="learn">
        <p>{`Which styles are dialogue in ${picked.name}?`}</p>
        <StyleChecklist
          styles={picked.styles}
          confirmLabel="Use these styles"
          onCancel={() => {
            setPending(null)
          }}
          onConfirm={(dialogueStyles) => {
            if (styles === null) {
              setStyles(dialogueStyles)
            }
            place({ name: picked.name, text: picked.text, dialogueStyles }, target)
            setPending(null)
          }}
        />
      </div>
    )
  }

  if (phase.kind === "proposals") {
    return (
      <Proposals
        phase={phase}
        onToggle={(index) => {
          const chosen = new Set(phase.chosen)
          if (chosen.has(index)) {
            chosen.delete(index)
          } else {
            chosen.add(index)
          }
          setPhase({ ...phase, chosen })
        }}
        onSave={(kept) => {
          props.onSave([...props.rules, ...kept])
          reset()
        }}
        onDiscard={reset}
      />
    )
  }

  if (episodes.length === 0) {
    return (
      <div className="learn">
        <button
          type="button"
          onClick={() => {
            pick({ kind: "pt" })
          }}
        >
          Learn from translated episodes…
        </button>
        <p className="muted">
          Reads episodes you already translated and suggests glossary entries and rules for this
          series. You choose what to keep.
        </p>
      </div>
    )
  }

  const learning = phase.kind === "learning"
  return (
    <div className="learn">
      <p>Translated episodes</p>
      <ul className="episodes">
        {episodes.map((episode, index) => (
          <li key={`${String(index)}-${episode.pt.name}`}>
            <span>{episode.pt.name}</span>{" "}
            {episode.en === null ? (
              <button
                type="button"
                disabled={learning}
                aria-label={`Add the English script for ${episode.pt.name}`}
                onClick={() => {
                  pick({ kind: "en", index })
                }}
              >
                Add English…
              </button>
            ) : (
              <span className="muted">{`with ${episode.en.name}`}</span>
            )}{" "}
            <button
              type="button"
              disabled={learning}
              aria-label={`Remove ${episode.pt.name}`}
              onClick={() => {
                setEpisodes((current) => current.filter((_, at) => at !== index))
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <p>
        <button
          type="button"
          disabled={learning}
          onClick={() => {
            pick({ kind: "pt" })
          }}
        >
          Add another episode…
        </button>{" "}
        <span className="muted">
          The English script is optional; with it, terms are matched line by line instead of
          guessed.
        </span>
      </p>
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
              setProvider(PROVIDERS.find((id) => id === event.target.value) ?? null)
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
            if (provider !== null) {
              learn(provider)
            }
          }}
        >
          {learning
            ? phase.text
            : episodes.length === 1
              ? "Learn"
              : `Learn from ${String(episodes.length)} episodes`}
        </button>{" "}
        <button type="button" disabled={learning} onClick={reset}>
          Cancel
        </button>
      </p>
    </div>
  )
}

function Proposals(props: {
  phase: Extract<Phase, { kind: "proposals" }>
  onToggle: (index: number) => void
  onSave: (kept: Rule[]) => void
  onDiscard: () => void
}): React.JSX.Element {
  const { combined, chosen, skipped } = props.phase
  const several = combined.episodes > 1
  const skippedNote =
    skipped.length === 0 ? null : <p className="muted">{`Skipped ${skipped.join(" ")}`}</p>
  if (combined.suggestions.length === 0) {
    return (
      <div className="learn">
        {skippedNote}
        <p>Nothing new to suggest: the series rules already cover what these episodes show.</p>
        <button type="button" onClick={props.onDiscard}>
          Done
        </button>
      </div>
    )
  }
  const source =
    combined.pairs > 0
      ? `${String(combined.pairs)} matched lines`
      : "your Portuguese alone, so check the English terms"
  return (
    <div className="learn">
      {skippedNote}
      <p>
        {several
          ? `Suggestions from ${String(combined.episodes)} episodes (${source}). Ones seen in more than one episode are ticked.`
          : `Suggestions from ${source}. Untick what you don't want.`}
      </p>
      <ul className="proposals">
        {combined.suggestions.map((suggestion, index) => (
          <li key={index}>
            <label className="picked">
              <input
                type="checkbox"
                checked={chosen.has(index)}
                onChange={() => {
                  props.onToggle(index)
                }}
              />
              {formatRule(suggestion.rule)}
            </label>
            {several ? (
              <span className="muted">
                {` · ${String(suggestion.episodes)} of ${String(combined.episodes)} episodes`}
                {suggestion.alternatives.length > 0
                  ? ` · also ${suggestion.alternatives.join(", ")}`
                  : ""}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="action"
        disabled={chosen.size === 0}
        onClick={() => {
          props.onSave(
            combined.suggestions.flatMap((suggestion, index) =>
              chosen.has(index) ? [suggestion.rule] : [],
            ),
          )
        }}
      >
        {`Save ${String(chosen.size)} to the series`}
      </button>{" "}
      <button type="button" onClick={props.onDiscard}>
        Discard
      </button>
    </div>
  )
}

function script(named: Named): LearnScript {
  return { text: named.text, dialogueStyles: named.dialogueStyles }
}
