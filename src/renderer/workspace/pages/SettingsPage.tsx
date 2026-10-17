import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import {
  PRESETS,
  PROVIDERS,
  VARIANTS,
  type AppSettings,
  type ModelOption,
  type ModelPair,
  type ProviderId,
} from "../../../shared/api"
import { useAction } from "../../action"
import { errorMessage, useApi } from "../../api"
import { ConfirmDialog } from "../ConfirmDialog"
import { FRAME_LABEL, FRAMES, PRESET_LABEL, providerName, VARIANT_LABEL } from "../labels"
import { PageHeader } from "../PageHeader"
import { SetupDialog } from "../SetupDialog"
import { useLoad } from "./useLoad"

// Default provider, keys, defaults for new projects, the euro rate, setup again, and
// under Advanced the models per provider and the provider log.
export function SettingsPage(): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const settings = useLoad(useCallback(() => api.getSettings(), [api]))
  const [setup, setSetup] = useState(false)
  // Bumped when setup closes, so the key rows read the keys again.
  const [revision, setRevision] = useState(0)
  // Shown at once, so a second change made before the first is saved builds on it.
  const latest = useRef<AppSettings | null>(null)
  useEffect(() => {
    latest.current = settings.value
  }, [settings.value])
  const save = (patch: Partial<AppSettings>): void => {
    if (latest.current !== null) {
      latest.current = { ...latest.current, ...patch }
      settings.set(latest.current)
    }
    // A refused change goes back to what is saved, so the page never shows a value
    // that isn't.
    act(async () => {
      try {
        settings.set(await api.updateSettings(patch))
      } catch (error) {
        settings.reload()
        throw error
      }
    })
  }
  const saveDefaults = (part: Partial<AppSettings["defaults"]>): void => {
    if (latest.current !== null) {
      save({ defaults: { ...latest.current.defaults, ...part } })
    }
  }
  const value = settings.value
  return (
    <section className="page">
      <PageHeader title="Settings" />
      {value === null ? (
        <div className="page-body" />
      ) : (
        <div className="page-body page-narrow">
          <Area title="AI provider">
            <label className="page-field field-short">
              <span className="field-label">Default provider</span>
              <select
                value={value.defaultProvider}
                onChange={(event) => {
                  const defaultProvider = PROVIDERS.find((item) => item === event.target.value)
                  if (defaultProvider !== undefined) {
                    save({ defaultProvider })
                  }
                }}
              >
                {PROVIDERS.map((item) => (
                  <option key={item} value={item}>
                    {providerName(item)}
                  </option>
                ))}
              </select>
            </label>
            <KeyList key={revision} />
          </Area>
          <Area title="Defaults for new projects">
            <div className="settings-grid">
              <label className="page-field">
                <span className="field-label">Portuguese</span>
                <select
                  value={value.defaults.variant}
                  onChange={(event) => {
                    const variant = VARIANTS.find((item) => item === event.target.value)
                    if (variant !== undefined) {
                      saveDefaults({ variant })
                    }
                  }}
                >
                  {VARIANTS.map((item) => (
                    <option key={item} value={item}>
                      {VARIANT_LABEL[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="page-field">
                <span className="field-label">Quality</span>
                <select
                  value={value.defaults.preset}
                  onChange={(event) => {
                    const preset = PRESETS.find((item) => item === event.target.value)
                    if (preset !== undefined) {
                      saveDefaults({ preset })
                    }
                  }}
                >
                  {PRESETS.map((item) => (
                    <option key={item} value={item}>
                      {PRESET_LABEL[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="page-field">
                <span className="field-label">Video frames</span>
                <select
                  value={value.defaults.frameSetting}
                  onChange={(event) => {
                    const frameSetting = FRAMES.find((item) => item === event.target.value)
                    if (frameSetting !== undefined) {
                      saveDefaults({ frameSetting })
                    }
                  }}
                >
                  {FRAMES.map((item) => (
                    <option key={item} value={item}>
                      {FRAME_LABEL[item]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Area>
          <Area title="Costs">
            <RateField
              key={value.eurRate}
              rate={value.eurRate}
              onSave={(eurRate) => {
                save({ eurRate })
              }}
            />
          </Area>
          <Area title="Setup">
            <div className="field-row">
              <button
                type="button"
                onClick={() => {
                  setSetup(true)
                }}
              >
                Run setup again
              </button>
              <span className="hint">Walks through the provider, key and defaults again.</span>
            </div>
          </Area>
          <details className="advanced">
            <summary>Advanced</summary>
            <div className="advanced-body">
              <p className="hint">
                The cheap model translates most lines; the strong one takes the hard ones.
              </p>
              {PROVIDERS.map((provider) => (
                <ModelRow key={provider} provider={provider} />
              ))}
              <div className="field-row">
                <button
                  type="button"
                  onClick={() => {
                    act(() => api.revealLog())
                  }}
                >
                  Show the provider log
                </button>
                <span className="hint">Every request and problem, for when something fails.</span>
              </div>
            </div>
          </details>
        </div>
      )}
      {setup && value !== null ? (
        <SetupDialog
          initial={value}
          onDone={() => {
            setSetup(false)
            setRevision((current) => current + 1)
            settings.reload()
          }}
          onClose={() => {
            setSetup(false)
            setRevision((current) => current + 1)
          }}
        />
      ) : null}
    </section>
  )
}

function Area({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  const titleId = useId()
  return (
    <section className="page-section" aria-labelledby={titleId}>
      <h2 className="section-title" id={titleId}>
        {title}
      </h2>
      {children}
    </section>
  )
}

// One row per provider: saved or not, with Replace and Remove or Add.
function KeyList(): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const keys = useLoad(
    useCallback(() => Promise.all(PROVIDERS.map((provider) => api.hasKey(provider))), [api]),
  )
  const [editing, setEditing] = useState<ProviderId | null>(null)
  const [removing, setRemoving] = useState<ProviderId | null>(null)
  const saved = keys.value
  if (saved === null) {
    return <ul className="key-list" aria-label="Keys" />
  }
  return (
    <>
      <ul className="key-list" aria-label="Keys">
        {PROVIDERS.map((provider, index) => {
          const name = providerName(provider)
          const has = saved[index] === true
          return (
            <li key={provider} className="key-row">
              <span className="key-state">{`${name} · ${has ? "saved" : "no key"}`}</span>
              {editing === provider ? null : (
                <span className="row-actions">
                  {has ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(provider)
                        }}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRemoving(provider)
                        }}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(provider)
                      }}
                    >
                      Add
                    </button>
                  )}
                </span>
              )}
              {editing === provider ? (
                <KeyEditor
                  provider={provider}
                  onSaved={() => {
                    setEditing(null)
                    keys.reload()
                  }}
                  onCancel={() => {
                    setEditing(null)
                  }}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
      {removing === null ? null : (
        <ConfirmDialog
          title={`Remove the ${providerName(removing)} key?`}
          body={`Honya can't use ${providerName(removing)} until you add a key again.`}
          confirmLabel="Remove"
          cancelLabel="Keep it"
          onConfirm={() => {
            const provider = removing
            setRemoving(null)
            act(async () => {
              await api.removeKey(provider)
              keys.reload()
            })
          }}
          onCancel={() => {
            setRemoving(null)
          }}
        />
      )}
    </>
  )
}

type Test =
  { state: "idle" } | { state: "testing" } | { state: "ok" } | { state: "failed"; message: string }

// Entering a new key: it can be tested before it is saved.
function KeyEditor({
  provider,
  onSaved,
  onCancel,
}: {
  provider: ProviderId
  onSaved: () => void
  onCancel: () => void
}): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const name = providerName(provider)
  const [key, setKey] = useState("")
  const [test, setTest] = useState<Test>({ state: "idle" })
  const [busy, setBusy] = useState(false)
  // Bumped by every test and every edit, so an older test's result is ignored.
  const runs = useRef(0)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    field.current?.focus()
  }, [])
  const runTest = (): void => {
    runs.current += 1
    const run = runs.current
    setTest({ state: "testing" })
    api.testKey(provider, key.trim()).then(
      (result) => {
        if (run === runs.current) {
          setTest(result.ok ? { state: "ok" } : { state: "failed", message: result.message })
        }
      },
      (error: unknown) => {
        if (run === runs.current) {
          setTest({ state: "failed", message: errorMessage(error) })
        }
      },
    )
  }
  return (
    <div className="key-editor">
      <input
        ref={field}
        type="password"
        autoComplete="off"
        aria-label={`${name} key`}
        placeholder="Paste the key"
        value={key}
        onChange={(event) => {
          setKey(event.target.value)
          runs.current += 1
          setTest({ state: "idle" })
        }}
      />
      <div className="field-row">
        <button
          type="button"
          disabled={key.trim() === "" || test.state === "testing"}
          onClick={runTest}
        >
          Test the key
        </button>
        <button
          type="button"
          className="primary"
          disabled={key.trim() === "" || busy}
          onClick={() => {
            setBusy(true)
            act(async () => {
              try {
                await api.setKey(provider, key.trim())
              } finally {
                setBusy(false)
              }
              onSaved()
            })
          }}
        >
          Save key
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {test.state === "testing" ? <span className="hint">Testing…</span> : null}
        {test.state === "ok" ? <span className="test-ok">{`✓ ${name} answered`}</span> : null}
        {test.state === "failed" ? (
          <span className="test-failed" role="alert">
            {test.message}
          </span>
        ) : null}
      </div>
    </div>
  )
}

const RATE_PATTERN = /^\d+(\.\d{1,2})?$/

function RateField({
  rate,
  onSave,
}: {
  rate: number
  onSave: (rate: number) => void
}): React.JSX.Element {
  const inputId = useId()
  const hintId = useId()
  const [text, setText] = useState(String(rate))
  const trimmed = text.trim()
  const valid = RATE_PATTERN.test(trimmed) && Number(trimmed) > 0
  return (
    <div className="page-field">
      <label className="field-label" htmlFor={inputId}>
        Euro rate (USD → EUR)
      </label>
      <div className="field-row">
        <input
          id={inputId}
          className="number-input"
          inputMode="decimal"
          value={text}
          aria-invalid={!valid}
          aria-describedby={hintId}
          onChange={(event) => {
            setText(event.target.value)
          }}
        />
        <button
          type="button"
          disabled={!valid || Number(trimmed) === rate}
          onClick={() => {
            onSave(Number(trimmed))
          }}
        >
          Save rate
        </button>
      </div>
      <span id={hintId} className={valid ? "hint" : "field-error"}>
        {valid
          ? "Providers charge in dollars; costs are shown in euros at this rate."
          : "Enter a rate above zero with up to two decimals, like 0.86."}
      </span>
    </div>
  )
}

// A provider's cheap and strong models, chosen from the curated list.
function ModelRow({ provider }: { provider: ProviderId }): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const name = providerName(provider)
  const options = useLoad(useCallback(() => api.modelOptions(provider), [api, provider]))
  const pair = useLoad(useCallback(() => api.getModels(provider), [api, provider]))
  const choose = (next: ModelPair): void => {
    act(async () => {
      pair.set(await api.setModels(provider, next))
    })
  }
  if (options.value === null || pair.value === null) {
    return <div className="model-row" />
  }
  const current = pair.value
  return (
    <div className="model-row">
      <h3 className="field-label">{name}</h3>
      <div className="model-fields">
        <label className="page-field">
          <span className="hint">Cheap model</span>
          <select
            aria-label={`${name} cheap model`}
            value={current.cheap}
            onChange={(event) => {
              choose({ ...current, cheap: event.target.value })
            }}
          >
            <ModelOptions options={options.value.cheap} current={current.cheap} />
          </select>
        </label>
        <label className="page-field">
          <span className="hint">Strong model</span>
          <select
            aria-label={`${name} strong model`}
            value={current.strong}
            onChange={(event) => {
              choose({ ...current, strong: event.target.value })
            }}
          >
            <ModelOptions options={options.value.strong} current={current.strong} />
          </select>
        </label>
        <button
          type="button"
          aria-label={`Reset ${name} to recommended`}
          onClick={() => {
            act(async () => {
              pair.set(await api.resetModels(provider))
            })
          }}
        >
          Reset to recommended
        </button>
      </div>
    </div>
  )
}

// The curated models, plus the saved one when it isn't in the list.
function ModelOptions({
  options,
  current,
}: {
  options: ModelOption[]
  current: string
}): React.JSX.Element {
  const known = options.some((option) => option.id === current)
  return (
    <>
      {known ? null : <option value={current}>{current}</option>}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.recommended ? `${option.label} (recommended)` : option.label}
        </option>
      ))}
    </>
  )
}
