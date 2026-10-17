import { useEffect, useRef, useState } from "react"
import {
  PRESETS,
  PROVIDERS,
  VARIANTS,
  type AppSettings,
  type FrameSetting,
  type Preset,
  type ProviderId,
  type Variant,
} from "../../shared/api"
import { useApi } from "../api"
import { Dialog } from "./Dialog"
import { FRAME_LABEL, FRAMES, PRESET_LABEL, providerName, VARIANT_LABEL } from "./labels"

type Test =
  { state: "idle" } | { state: "testing" } | { state: "ok" } | { state: "failed"; message: string }

// First-time setup: step 1 a provider and a tested key, step 2 the defaults for new projects.
export function SetupDialog({
  initial,
  onDone,
  onClose,
}: {
  initial: AppSettings
  onDone: () => void
  onClose?: () => void
}): React.JSX.Element {
  const api = useApi()
  const [step, setStep] = useState<1 | 2>(1)
  const [provider, setProvider] = useState<ProviderId>(initial.defaultProvider)
  const [key, setKey] = useState("")
  const [test, setTest] = useState<Test>({ state: "idle" })
  const [variant, setVariant] = useState<Variant>(initial.defaults.variant)
  const [preset, setPreset] = useState<Preset>(initial.defaults.preset)
  const [frameSetting, setFrameSetting] = useState<FrameSetting>(initial.defaults.frameSetting)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // Bumped by every run and every edit, so a result from an older run is ignored.
  const runs = useRef(0)
  const firstField = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    firstField.current?.focus()
  }, [step])

  const runTest = (): void => {
    runs.current += 1
    const run = runs.current
    setTest({ state: "testing" })
    setFailure(null)
    api.testKey(provider, key).then(
      (result) => {
        if (run !== runs.current) {
          return
        }
        setTest(result.ok ? { state: "ok" } : { state: "failed", message: result.message })
      },
      (error: unknown) => {
        if (run !== runs.current) {
          return
        }
        setTest({
          state: "failed",
          message: error instanceof Error ? error.message : "Something went wrong.",
        })
      },
    )
  }
  const attempt = (task: () => Promise<void>): void => {
    setBusy(true)
    setFailure(null)
    task().then(
      () => {
        setBusy(false)
      },
      (error: unknown) => {
        setBusy(false)
        setFailure(error instanceof Error ? error.message : "Something went wrong.")
      },
    )
  }

  return (
    <Dialog title="Welcome to Honya" {...(onClose === undefined ? {} : { onClose })}>
      <ol className="steps" aria-label="Steps">
        <li aria-current={step === 1 ? "step" : undefined}>1 Provider</li>
        <li aria-current={step === 2 ? "step" : undefined}>2 Defaults</li>
      </ol>
      {step === 1 ? (
        <div className="dialog-fields">
          <label>
            <span className="field-label">Provider</span>
            <select
              ref={firstField}
              value={provider}
              onChange={(event) => {
                const next = PROVIDERS.find((item) => item === event.target.value)
                if (next !== undefined) {
                  setProvider(next)
                  runs.current += 1
                  setTest({ state: "idle" })
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
          <label>
            <span className="field-label">Key</span>
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => {
                setKey(event.target.value)
                runs.current += 1
                setTest({ state: "idle" })
              }}
            />
          </label>
          <div className="dialog-test">
            <button
              type="button"
              disabled={key.trim() === "" || test.state === "testing"}
              onClick={runTest}
            >
              Test the key
            </button>
            {test.state === "ok" ? (
              <span className="test-ok">{`✓ ${providerName(provider)} answered`}</span>
            ) : null}
            {test.state === "failed" ? (
              <span className="test-failed" role="alert">
                {test.message}
              </span>
            ) : null}
          </div>
          {failure === null ? null : (
            <p className="error-line" role="alert">
              {failure}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="primary"
              disabled={test.state !== "ok" || busy}
              onClick={() => {
                attempt(async () => {
                  await api.setKey(provider, key)
                  await api.updateSettings({ defaultProvider: provider })
                  setStep(2)
                })
              }}
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="dialog-fields">
          <p className="muted">Defaults for new projects. You can change them later in Settings.</p>
          <label>
            <span className="field-label">Portuguese</span>
            <select
              ref={firstField}
              value={variant}
              onChange={(event) => {
                setVariant(VARIANTS.find((item) => item === event.target.value) ?? variant)
              }}
            >
              {VARIANTS.map((item) => (
                <option key={item} value={item}>
                  {VARIANT_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Quality</span>
            <select
              value={preset}
              onChange={(event) => {
                setPreset(PRESETS.find((item) => item === event.target.value) ?? preset)
              }}
            >
              {PRESETS.map((item) => (
                <option key={item} value={item}>
                  {PRESET_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Video frames</span>
            <select
              value={frameSetting}
              onChange={(event) => {
                setFrameSetting(FRAMES.find((item) => item === event.target.value) ?? frameSetting)
              }}
            >
              {FRAMES.map((item) => (
                <option key={item} value={item}>
                  {FRAME_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          {failure === null ? null : (
            <p className="error-line" role="alert">
              {failure}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStep(1)
              }}
            >
              Back
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => {
                attempt(async () => {
                  await api.updateSettings({
                    defaults: { variant, preset, frameSetting },
                    setupDone: true,
                  })
                  onDone()
                })
              }}
            >
              Finish
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
