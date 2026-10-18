import {
  PRESETS,
  PROVIDERS,
  type Preset,
  type ProviderId,
  type SessionView,
} from "../../../shared/api"
import { ActivityLine } from "../ActivityLine"
import { providerName } from "../labels"
import type { RunState } from "./useSession"
import { CloseIcon } from "../CloseIcon"

const PRESET_NAME: Record<Preset, string> = { save: "Save", balanced: "Balanced", best: "Best" }

function isProvider(value: string): value is ProviderId {
  return PROVIDERS.some((provider) => provider === value)
}

function isPreset(value: string): value is Preset {
  return PRESETS.some((preset) => preset === value)
}

// The session page's header: what is open, how the AI runs, and the page's actions.
export function TopBar({
  view,
  saving,
  run,
  stopping,
  onOptions,
  onAttachVideo,
  onDetachVideo,
  onExport,
  onRun,
  onStop,
}: {
  view: SessionView
  saving: boolean
  run: RunState
  stopping: boolean
  onOptions: (patch: { provider?: ProviderId; preset?: Preset }) => void
  onAttachVideo: () => void
  onDetachVideo: () => void
  onExport: () => void
  onRun: () => void
  onStop: () => void
}): React.JSX.Element {
  const untranslated = view.lines.filter((line) => line.words === null).length
  const started = view.lines.some((line) => line.words !== null)
  const running = run !== null
  return (
    <header className="page-header session-bar">
      <div className="session-title">
        <h1>{view.scriptName ?? "Session"}</h1>
        <p className="session-meta">{`${view.projectName} · ${view.variant.toUpperCase()}`}</p>
      </div>
      <div className="session-actions">
        <select
          aria-label="Provider"
          value={view.provider}
          disabled={running}
          onChange={(event) => {
            const value = event.target.value
            if (isProvider(value)) {
              onOptions({ provider: value })
            }
          }}
        >
          {PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {providerName(provider)}
            </option>
          ))}
        </select>
        <select
          aria-label="Preset"
          value={view.preset}
          disabled={running}
          onChange={(event) => {
            const value = event.target.value
            if (isPreset(value)) {
              onOptions({ preset: value })
            }
          }}
        >
          {PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {PRESET_NAME[preset]}
            </option>
          ))}
        </select>
        {view.videoName === null ? (
          <button type="button" onClick={onAttachVideo}>
            Attach video
          </button>
        ) : (
          <span className="session-video">
            <span className="session-video-name">{view.videoName}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Detach video"
              onClick={onDetachVideo}
            >
              <CloseIcon />
            </button>
          </span>
        )}
        <span className="session-saved" role="status">
          {saving ? "Saving…" : "Saved"}
        </span>
        <button type="button" disabled={view.lines.length === 0} onClick={onExport}>
          Export…
        </button>
        {running ? null : untranslated === 0 ? null : (
          <button type="button" className="primary" onClick={onRun}>
            {started ? "Translate the rest with AI" : "Translate with AI"}
          </button>
        )}
      </div>
      {run === null ? null : (
        <div className="session-run" role="group" aria-label="AI run">
          <p className="session-run-count">
            {run === "starting"
              ? "Starting…"
              : `Batch ${String(run.batch)} of ${String(run.batches)} · ${String(run.linesDone)} of ${String(run.lineTotal)} lines`}
          </p>
          {run === "starting" ? null : <ActivityLine key={run.activity} text={run.activity} />}
          <button type="button" disabled={stopping} onClick={onStop}>
            {stopping ? "Stopping…" : "Stop"}
          </button>
        </div>
      )}
    </header>
  )
}
