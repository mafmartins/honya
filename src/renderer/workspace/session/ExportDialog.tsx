import { useEffect, useState } from "react"
import type { ExportPreview, Owner } from "../../../shared/api"
import { errorMessage, useApi } from "../../api"
import { formatRule } from "../../format"
import { Dialog } from "../Dialog"
import { styleName } from "../route"

type Target = "project" | "style"

function summary(preview: ExportPreview): string {
  if (preview.english === 0 && preview.openFlags === 0) {
    return `All ${String(preview.translated)} lines translated.`
  }
  const parts = [`${String(preview.translated)} translated`]
  if (preview.english > 0) {
    parts.push(`${String(preview.english)} still in English`)
  }
  if (preview.openFlags > 0) {
    const flags = preview.openFlags === 1 ? "flag" : "flags"
    parts.push(`${String(preview.openFlags)} open ${flags} will be written as notes`)
  }
  return parts.join(" · ")
}

function fromLines(lines: number[]): string {
  const numbers = lines.map((index) => String(index + 1)).join(", ")
  return `from ${lines.length === 1 ? "line" : "lines"} ${numbers}`
}

function isTarget(value: string): value is Target {
  return value === "project" || value === "style"
}

// The export dialog: what will be written, the rules worth keeping from your edits, where
// to save, then the saved file. The session stays open behind it.
export function ExportDialog({
  sessionId,
  edited,
  owner,
  styleOwner,
  onClose,
  onNextEpisode,
}: {
  sessionId: string
  // Whether you edited lines: the preview then asks the AI for rule suggestions.
  edited: boolean
  owner: Owner
  styleOwner: Extract<Owner, { kind: "style" }>
  onClose: () => void
  // Starts a new session in the same project once the file is saved.
  onNextEpisode?: () => void
}): React.JSX.Element {
  const api = useApi()
  const [preview, setPreview] = useState<ExportPreview | null>(null)
  const [path, setPath] = useState("")
  const [kept, setKept] = useState<boolean[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [writing, setWriting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api.exportPreview(sessionId).then(
      (loaded) => {
        if (live) {
          setPreview(loaded)
          setPath(loaded.defaultPath)
          setKept(loaded.suggestions.map(() => true))
          setTargets(loaded.suggestions.map(() => "project"))
        }
      },
      (error: unknown) => {
        if (live) {
          setFailure(errorMessage(error))
        }
      },
    )
    return () => {
      live = false
    }
  }, [api, sessionId])

  const change = (): void => {
    api.pickExportPath(path).then(
      (picked) => {
        if (picked !== null) {
          setPath(picked)
          setFailure(null)
        }
      },
      (error: unknown) => {
        setFailure(errorMessage(error))
      },
    )
  }

  const write = (): void => {
    if (preview === null) {
      return
    }
    const rules = preview.suggestions.flatMap((suggestion, index) =>
      kept[index] === true
        ? [{ owner: targets[index] === "style" ? styleOwner : owner, rule: suggestion.rule }]
        : [],
    )
    setWriting(true)
    setFailure(null)
    api.exportWrite(sessionId, path, rules).then(
      (result) => {
        setWriting(false)
        setSaved(result.path)
      },
      (error: unknown) => {
        setWriting(false)
        setFailure(errorMessage(error))
      },
    )
  }

  const alert =
    failure === null ? null : (
      <p className="error-line" role="alert">
        {failure}
      </p>
    )

  if (saved !== null) {
    return (
      <Dialog title="Export" onClose={onClose}>
        <div className="dialog-fields">
          <p className="export-path">{`Saved to ${saved}`}</p>
          {alert}
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => {
                api.revealPath(saved).catch((error: unknown) => {
                  setFailure(errorMessage(error))
                })
              }}
            >
              Show in Finder
            </button>
            <button
              type="button"
              className={onNextEpisode === undefined ? "primary" : undefined}
              onClick={onClose}
            >
              Done
            </button>
            {onNextEpisode === undefined ? null : (
              <button type="button" className="primary" onClick={onNextEpisode}>
                Start the next episode
              </button>
            )}
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title="Export" onClose={onClose}>
      <div className="dialog-fields">
        {preview === null ? (
          failure === null ? (
            <p className="muted">
              {edited ? "Looking at your edits…" : "Getting the export ready…"}
            </p>
          ) : null
        ) : (
          <>
            <p>{summary(preview)}</p>
            {preview.suggestions.length === 0 ? null : (
              <section className="export-rules" aria-label="Rule suggestions from your edits">
                <h3 className="field-label">Rule suggestions from your edits</h3>
                <ul>
                  {preview.suggestions.map((suggestion, index) => {
                    const text = formatRule(suggestion.rule)
                    return (
                      <li key={`${String(index)}:${text}`} className="export-rule">
                        <label className="choice">
                          <input
                            type="checkbox"
                            checked={kept[index] === true}
                            onChange={(event) => {
                              const on = event.target.checked
                              setKept((current) => current.map((v, i) => (i === index ? on : v)))
                            }}
                          />
                          {text}
                        </label>
                        <span className="export-rule-meta">{fromLines(suggestion.lines)}</span>
                        <select
                          aria-label={`Save “${text}” to`}
                          value={targets[index] ?? "project"}
                          onChange={(event) => {
                            const value = event.target.value
                            if (isTarget(value)) {
                              setTargets((current) =>
                                current.map((v, i) => (i === index ? value : v)),
                              )
                            }
                          }}
                        >
                          <option value="project">This project</option>
                          <option value="style">{styleName(styleOwner.variant)}</option>
                        </select>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
            <div className="export-location">
              <span className="field-label">Save as</span>
              <span className="export-path">{path}</span>
              <button type="button" onClick={change}>
                Change…
              </button>
            </div>
          </>
        )}
        {alert}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={preview === null || writing || path === ""}
            onClick={write}
          >
            Export
          </button>
        </div>
      </div>
    </Dialog>
  )
}
