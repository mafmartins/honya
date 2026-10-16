import { useEffect, useState } from "react"
import {
  PRESETS,
  PROVIDERS,
  VARIANTS,
  type Preset,
  type ProviderId,
  type Variant,
} from "../../shared/api"
import type { FrameSetting, Session } from "../App"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"
import { KeyField } from "../components/KeyField"
import { SeriesPicker } from "../components/SeriesPicker"

export function StartScreen(props: {
  session: Session
  onChange: (patch: Partial<Session>) => void
  onOpenProfiles: () => void
}): React.JSX.Element {
  const { session, onChange } = props
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [hasKey, setHasKey] = useState<{ provider: ProviderId; present: boolean } | null>(null)

  useEffect(() => {
    let current = true
    api.hasKey(session.provider).then(
      (present) => {
        if (current) {
          setHasKey({ provider: session.provider, present })
        }
      },
      (error: unknown) => {
        if (current) {
          report(errorMessage(error))
        }
      },
    )
    return () => {
      current = false
    }
  }, [api, session.provider, report])

  return (
    <>
      <header className="card-header">
        <p>Start</p>
        <button type="button" className="link" onClick={props.onOpenProfiles}>
          Profiles
        </button>
      </header>
      <div className="split">
        <div>
          <div className="field">
            <span>file</span>
            <div className="picked">
              <span
                className={session.script === null ? "slot muted" : "slot"}
                title={session.script?.name}
              >
                {session.script === null ? "No script chosen" : session.script.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  act(async () => {
                    const script = await api.pickScript()
                    if (script !== null) {
                      onChange({ script })
                    }
                  })
                }}
              >
                Choose script…
              </button>
            </div>
          </div>
          <label>
            <span>variant</span>
            <select
              aria-label="variant"
              value={session.variant}
              onChange={(event) => {
                const variant = VARIANTS.find((item) => item === event.target.value)
                if (variant !== undefined) {
                  onChange({ variant, seriesId: null })
                }
              }}
            >
              {VARIANTS.map((variant: Variant) => (
                <option key={variant}>{variant}</option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>series</span>
            <SeriesPicker
              key={session.variant}
              variant={session.variant}
              seriesId={session.seriesId}
              onSelect={(seriesId) => {
                onChange({ seriesId })
              }}
            />
          </div>
          <label>
            <span>provider</span>
            <select
              aria-label="provider"
              value={session.provider}
              onChange={(event) => {
                const provider = PROVIDERS.find((item) => item === event.target.value)
                if (provider !== undefined) {
                  onChange({ provider })
                }
              }}
            >
              {PROVIDERS.map((provider: ProviderId) => (
                <option key={provider}>{provider}</option>
              ))}
            </select>
          </label>
          {hasKey !== null && hasKey.provider === session.provider && !hasKey.present ? (
            <KeyField
              key={session.provider}
              provider={session.provider}
              onSaved={() => {
                setHasKey({ provider: session.provider, present: true })
              }}
            />
          ) : null}
          <label>
            <span>preset</span>
            <select
              aria-label="preset"
              value={session.preset}
              onChange={(event) => {
                const preset = PRESETS.find((item) => item === event.target.value)
                if (preset !== undefined) {
                  onChange({ preset })
                }
              }}
            >
              {PRESETS.map((preset: Preset) => (
                <option key={preset}>{preset}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="decision">
          <div className="field">
            <span>video</span>
            <div className="picked">
              <span
                className={session.video === null ? "slot muted" : "slot"}
                title={session.video?.name}
              >
                {session.video === null ? "No video chosen" : session.video.name}
              </span>
              {session.video === null ? null : (
                <button
                  type="button"
                  aria-label="Clear video"
                  onClick={() => {
                    onChange({ video: null, frameSetting: "none" })
                  }}
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  act(async () => {
                    const video = await api.pickVideo()
                    if (video !== null) {
                      onChange({ video })
                    }
                  })
                }}
              >
                Choose video…
              </button>
            </div>
          </div>
          <label>
            <span>frame setting</span>
            <select
              aria-label="frame setting"
              disabled={session.video === null}
              value={session.frameSetting}
              onChange={(event) => {
                const value = event.target.value
                const frameSetting: FrameSetting | undefined =
                  value === "none" || value === "marked" || value === "every" ? value : undefined
                if (frameSetting !== undefined) {
                  onChange({ frameSetting })
                }
              }}
            >
              <option value="none">none</option>
              <option value="marked">only the marked lines</option>
              <option value="every">every dialogue line</option>
            </select>
          </label>
        </div>
      </div>
    </>
  )
}
