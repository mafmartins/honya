import { useState } from "react"
import { VARIANTS, type LaunchInfo, type Variant } from "../../shared/api"
import { ErrorLine } from "../ErrorLine"
import { Dialog } from "./Dialog"
import { VARIANT_LABEL } from "./labels"

export interface LaunchDialogProps {
  info: LaunchInfo
  defaultVariant: Variant
  onContinue: (sessionId: string) => Promise<void>
  onOpenProject: (projectId: string) => Promise<void>
  onNewSession: (projectId: string) => Promise<void>
  onCreateProject: (name: string, variant: Variant) => Promise<void>
  onClose: () => void
}

function when(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString()
}

// "What are we working on?": continue the latest session, open a project or start a new one.
export function LaunchDialog({
  info,
  defaultVariant,
  onContinue,
  onOpenProject,
  onNewSession,
  onCreateProject,
  onClose,
}: LaunchDialogProps): React.JSX.Element {
  const [name, setName] = useState("")
  const [variant, setVariant] = useState<Variant>(defaultVariant)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const attempt = (task: () => Promise<void>): void => {
    setBusy(true)
    setError(null)
    task().then(
      () => {
        setBusy(false)
      },
      (failure: unknown) => {
        setBusy(false)
        setError(failure instanceof Error ? failure.message : "Something went wrong.")
      },
    )
  }
  const current = info.continueSession
  const projects = [...info.projects].sort((left, right) => left.name.localeCompare(right.name))
  return (
    <Dialog title="What are we working on?" onClose={onClose}>
      <ErrorLine message={error} />
      {current === null ? null : (
        <section className="tile tile-accent" aria-labelledby="launch-continue">
          <h3 className="tile-label" id="launch-continue">
            Continue
          </h3>
          <p>
            <strong>{current.projectName}</strong>
            {` · ${current.scriptName === "" ? "No script yet" : current.scriptName}`}
          </p>
          <p className="muted">
            {`${String(current.translated)} of ${String(current.total)} lines · ${String(current.openFlags)} ${current.openFlags === 1 ? "flag" : "flags"} open · ${when(current.updatedAt)}`}
          </p>
          <div>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => {
                attempt(() => onContinue(current.id))
              }}
            >
              Continue session
            </button>
          </div>
        </section>
      )}
      <div className="launch-grid">
        <section className="tile" aria-labelledby="launch-projects">
          <h3 className="tile-label" id="launch-projects">
            Projects
          </h3>
          {projects.length === 0 ? (
            <p className="muted">No projects yet.</p>
          ) : (
            <ul className="launch-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="launch-row"
                    disabled={busy}
                    onClick={() => {
                      attempt(() => onOpenProject(project.id))
                    }}
                  >
                    <span>{project.name}</span>
                    <span className="muted">{project.variant}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      attempt(() => onNewSession(project.id))
                    }}
                  >
                    New session
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="tile" aria-labelledby="launch-new">
          <h3 className="tile-label" id="launch-new">
            New project
          </h3>
          <label>
            <span className="field-label">Series name</span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
          </label>
          <label>
            <span className="field-label">Portuguese</span>
            <select
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
          <div>
            <button
              type="button"
              disabled={busy || name.trim() === ""}
              onClick={() => {
                attempt(() => onCreateProject(name.trim(), variant))
              }}
            >
              Create
            </button>
          </div>
        </section>
      </div>
    </Dialog>
  )
}
