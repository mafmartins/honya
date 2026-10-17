import { useEffect, useState } from "react"
import {
  PROVIDERS,
  type Combined,
  type Learned,
  type LearnScript,
  type Owner,
  type PickedExample,
  type ProviderId,
  type Rule,
  type Variant,
} from "../../shared/api"
import { useAction } from "../action"
import { errorMessage, useApi } from "../api"
import { formatRule } from "../format"
import { providerName } from "../workspace/labels"
import { styleName } from "../workspace/route"
import { StyleChecklist } from "./StyleChecklist"

type Named = LearnScript & { name: string }

interface Episode {
  pt: Named
  en: Named | null
}

// Where a picked file goes once its dialogue styles are known.
type Slot = { kind: "pt" } | { kind: "en"; index: number }

// Where a kept suggestion is saved: the owner itself or, for a project, its style.
type Target = "owner" | "style"

type Phase =
  | { kind: "edit" }
  | { kind: "learning"; text: string }
  | {
      kind: "proposals"
      combined: Combined
      chosen: Set<number>
      targets: Target[]
      skipped: string[]
    }

// Adds reference translations (finished episodes) to a project or a language style:
// each one is stored and read by the learning pass, which offers glossary entries and
// rules. With several episodes, suggestions are ranked by how many episodes show them,
// and only those seen more than once start ticked. On a project page each suggestion
// can go to the project or its style.
export function LearnPanel(props: {
  owner: Owner
  // The owner's language, naming the style a project's suggestions can go to.
  variant: Variant
  // Called once references or rules were saved, so the page reloads them.
  onChanged: () => void
}): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [styles, setStyles] = useState<string[] | null>(null)
  const [pending, setPending] = useState<{ picked: PickedExample; target: Slot } | null>(null)
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

  const place = (named: Named, target: Slot): void => {
    setEpisodes((current) =>
      target.kind === "pt"
        ? [...current, { pt: named, en: null }]
        : current.map((episode, index) =>
            index === target.index ? { ...episode, en: named } : episode,
          ),
    )
  }

  // A file with the styles already chosen reuses them; anything else asks.
  const pick = (target: Slot): void => {
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
      let added = 0
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
              props.owner,
              chosenProvider,
              script(episode.pt),
              episode.en === null ? null : script(episode.en),
            ),
          )
          // Kept only once read, so a failed episode can be added again without a copy.
          await api.addReference(props.owner, episode.pt.name, episode.pt.text, [
            ...episode.pt.dialogueStyles,
          ])
          added += 1
        } catch (error) {
          skipped.push(`${episode.pt.name}: ${errorMessage(error)}`)
        }
      }
      if (added > 0) {
        props.onChanged()
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
        const targets = combined.suggestions.map((): Target => "owner")
        setPhase({ kind: "proposals", combined, chosen, targets, skipped })
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
        <p className="learn-note">{`Which styles are dialogue in ${picked.name}?`}</p>
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
        styleTarget={props.owner.kind === "project" ? styleName(props.variant) : null}
        onToggle={(index) => {
          const chosen = new Set(phase.chosen)
          if (chosen.has(index)) {
            chosen.delete(index)
          } else {
            chosen.add(index)
          }
          setPhase({ ...phase, chosen })
        }}
        onTarget={(index, target) => {
          setPhase({
            ...phase,
            targets: phase.targets.map((value, at) => (at === index ? target : value)),
          })
        }}
        onSave={(kept) => {
          act(async () => {
            const style: Owner = { kind: "style", variant: props.variant }
            try {
              for (const { rule, target } of kept) {
                await api.addRule(target === "style" ? style : props.owner, rule)
              }
            } finally {
              props.onChanged()
            }
            reset()
          })
        }}
        onDiscard={reset}
      />
    )
  }

  if (episodes.length === 0) {
    return (
      <div className="learn">
        <div className="learn-row">
          <button
            type="button"
            onClick={() => {
              pick({ kind: "pt" })
            }}
          >
            Add reference translations…
          </button>
        </div>
        <p className="hint">
          Finished episodes you translated. Honya keeps them as examples of your voice and suggests
          glossary entries and rules from them; you choose what to keep.
        </p>
      </div>
    )
  }

  const learning = phase.kind === "learning"
  return (
    <div className="learn">
      <ul className="learn-episodes" aria-label="Episodes to add">
        {episodes.map((episode, index) => (
          <li key={`${String(index)}-${episode.pt.name}`}>
            <span className="learn-name">{episode.pt.name}</span>
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
              <span className="hint">{`with ${episode.en.name}`}</span>
            )}
            <button
              type="button"
              className="icon"
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
      <div className="learn-row">
        <button
          type="button"
          disabled={learning}
          onClick={() => {
            pick({ kind: "pt" })
          }}
        >
          Add another episode…
        </button>
        <span className="hint">
          The English script is optional; with it, terms are matched line by line instead of
          guessed.
        </span>
      </div>
      {providers.length === 0 ? (
        <p className="hint">Add a provider key in Settings to learn from scripts.</p>
      ) : (
        <label className="learn-provider">
          <span className="field-label">Provider</span>
          <select
            value={provider ?? ""}
            disabled={learning}
            onChange={(event) => {
              setProvider(PROVIDERS.find((id) => id === event.target.value) ?? null)
            }}
          >
            {providers.map((id) => (
              <option key={id} value={id}>
                {providerName(id)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="learn-row">
        <button
          type="button"
          className="primary"
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
        </button>
        <button type="button" disabled={learning} onClick={reset}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function Proposals(props: {
  phase: Extract<Phase, { kind: "proposals" }>
  // The style a project's suggestion can go to instead; null on a style page.
  styleTarget: string | null
  onToggle: (index: number) => void
  onTarget: (index: number, target: Target) => void
  onSave: (kept: { rule: Rule; target: Target }[]) => void
  onDiscard: () => void
}): React.JSX.Element {
  const { combined, chosen, targets, skipped } = props.phase
  const several = combined.episodes > 1
  const skippedNote =
    skipped.length === 0 ? null : <p className="hint">{`Skipped ${skipped.join(" ")}`}</p>
  if (combined.suggestions.length === 0) {
    return (
      <div className="learn">
        {skippedNote}
        <p className="learn-note">
          Nothing new to suggest: the rules already cover what these episodes show.
        </p>
        <div className="learn-row">
          <button type="button" onClick={props.onDiscard}>
            Done
          </button>
        </div>
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
      <p className="learn-note">
        {several
          ? `Suggestions from ${String(combined.episodes)} episodes (${source}). Ones seen in more than one episode are ticked.`
          : `Suggestions from ${source}. Untick what you don't want.`}
      </p>
      <ul className="learn-proposals">
        {combined.suggestions.map((suggestion, index) => {
          const text = formatRule(suggestion.rule)
          return (
            <li key={`${String(index)}:${text}`}>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={chosen.has(index)}
                  onChange={() => {
                    props.onToggle(index)
                  }}
                />
                {text}
              </label>
              {several ? (
                <span className="hint">
                  {`· ${String(suggestion.episodes)} of ${String(combined.episodes)} episodes`}
                  {suggestion.alternatives.length > 0
                    ? ` · also ${suggestion.alternatives.join(", ")}`
                    : ""}
                </span>
              ) : null}
              {props.styleTarget === null ? null : (
                <select
                  aria-label={`Save “${text}” to`}
                  value={targets[index] ?? "owner"}
                  onChange={(event) => {
                    props.onTarget(index, event.target.value === "style" ? "style" : "owner")
                  }}
                >
                  <option value="owner">This project</option>
                  <option value="style">{props.styleTarget}</option>
                </select>
              )}
            </li>
          )
        })}
      </ul>
      <div className="learn-row">
        <button
          type="button"
          className="primary"
          disabled={chosen.size === 0}
          onClick={() => {
            props.onSave(
              combined.suggestions.flatMap((suggestion, index) =>
                chosen.has(index)
                  ? [{ rule: suggestion.rule, target: targets[index] ?? "owner" }]
                  : [],
              ),
            )
          }}
        >
          {chosen.size === 1 ? "Save 1 suggestion" : `Save ${String(chosen.size)} suggestions`}
        </button>
        <button type="button" onClick={props.onDiscard}>
          Discard
        </button>
      </div>
    </div>
  )
}

function script(named: Named): LearnScript {
  return { text: named.text, dialogueStyles: named.dialogueStyles }
}
