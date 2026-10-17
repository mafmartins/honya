import { useCallback, useId, useState, type ReactNode } from "react"
import {
  PRESETS,
  VARIANTS,
  type Owner,
  type ProjectPatch,
  type Rule,
  type SessionSummary,
  type Variant,
} from "../../../shared/api"
import { useAction } from "../../action"
import { useApi } from "../../api"
import { formatDate } from "../../format"
import { ConfirmDialog } from "../ConfirmDialog"
import { FRAME_LABEL, FRAMES, PRESET_LABEL, VARIANT_LABEL } from "../labels"
import { PageHeader } from "../PageHeader"
import { styleName } from "../route"
import { ReferencesPanel } from "./ReferencesPanel"
import { RulesEditor } from "./RulesEditor"
import { useLoad } from "./useLoad"

// What a project page asks the shell to do: opening or starting a session leaves the
// open one, so the shell can ask "Stop the AI run?" first.
export interface ProfileActions {
  onOpenSession: (projectId: string, sessionId: string) => void
  onNewSession: (projectId: string) => void
  onDeleted: (projectId: string) => void
  // A name or language changed, so the menu reloads its project list.
  onChanged: () => void
}

// A project's page or a language style's page: the same areas, plus the project's
// sessions and settings.
export function ProfilePage({
  owner,
  ...actions
}: { owner: Owner } & ProfileActions): React.JSX.Element {
  return owner.kind === "project" ? (
    <ProjectPage key={owner.id} id={owner.id} {...actions} />
  ) : (
    <StylePage key={owner.variant} variant={owner.variant} />
  )
}

function ProjectPage({
  id,
  onOpenSession,
  onNewSession,
  onDeleted,
  onChanged,
}: { id: string } & ProfileActions): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const project = useLoad(useCallback(() => api.getProject(id), [api, id]))
  const sessions = useLoad(useCallback(() => api.projectSessions(id), [api, id]))
  const [name, setName] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const languageId = useId()
  const lockedId = useId()
  const owner: Owner = { kind: "project", id }
  const view = project.value

  const update = (patch: ProjectPatch, after?: () => void): void => {
    act(async () => {
      project.set(await api.updateProject(id, patch))
      after?.()
    })
  }

  if (view === null) {
    return (
      <section className="page">
        <PageHeader title="Project" />
        <div className="page-body" />
      </section>
    )
  }
  const { summary } = view
  const style = styleName(summary.variant)
  return (
    <section className="page">
      {name === null ? (
        <PageHeader title={summary.name}>
          <button
            type="button"
            onClick={() => {
              setName(summary.name)
            }}
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleting(true)
            }}
          >
            Delete
          </button>
        </PageHeader>
      ) : (
        <header className="page-header page-rename">
          <input
            aria-label="Project name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <div className="page-actions">
            <button
              type="button"
              className="primary"
              disabled={name.trim() === ""}
              onClick={() => {
                update({ name }, () => {
                  setName(null)
                  onChanged()
                })
              }}
            >
              Save name
            </button>
            <button
              type="button"
              onClick={() => {
                setName(null)
              }}
            >
              Cancel
            </button>
          </div>
        </header>
      )}
      <div className="page-body">
        <Area
          title="Sessions"
          action={
            <button
              type="button"
              onClick={() => {
                onNewSession(id)
              }}
            >
              New session
            </button>
          }
        >
          <SessionTable
            sessions={sessions.value}
            onOpen={(session) => {
              onOpenSession(id, session)
            }}
            onFinished={(session, value) => {
              act(async () => {
                await api.setFinished(session, value)
                sessions.reload()
              })
            }}
          />
        </Area>
        <Area title="Project settings">
          <div className="settings-grid">
            <div className="page-field">
              <label className="field-label" htmlFor={languageId}>
                Portuguese
              </label>
              <select
                id={languageId}
                value={summary.variant}
                disabled={view.languageLocked}
                aria-describedby={view.languageLocked ? lockedId : undefined}
                onChange={(event) => {
                  const variant = VARIANTS.find((item) => item === event.target.value)
                  if (variant !== undefined) {
                    update({ variant }, onChanged)
                  }
                }}
              >
                {VARIANTS.map((item) => (
                  <option key={item} value={item}>
                    {VARIANT_LABEL[item]}
                  </option>
                ))}
              </select>
              {view.languageLocked ? (
                <span id={lockedId} className="hint">
                  Fixed once the project has sessions.
                </span>
              ) : null}
            </div>
            <label className="page-field">
              <span className="field-label">Quality</span>
              <select
                value={view.preset}
                onChange={(event) => {
                  const preset = PRESETS.find((item) => item === event.target.value)
                  if (preset !== undefined) {
                    update({ preset })
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
                value={view.frameSetting}
                onChange={(event) => {
                  const frameSetting = FRAMES.find((item) => item === event.target.value)
                  if (frameSetting !== undefined) {
                    update({ frameSetting })
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
            <CpsField
              key={String(view.cpsLimit)}
              value={view.cpsLimit}
              inherit={{ label: style, value: view.styleCps }}
              onSave={(cpsLimit) => {
                update({ cpsLimit })
              }}
            />
          </div>
        </Area>
        <Area title="Rules and glossary">
          <RulesEditor
            own={view.rules.own}
            inherited={view.rules.inherited}
            inheritedFrom={style}
            onSave={async (rules: Rule[]) => {
              await api.saveRules(owner, rules)
              project.update((current) => ({ ...current, rules: { ...current.rules, own: rules } }))
            }}
          />
        </Area>
        <Area title="Reference translations">
          <ReferencesPanel
            owner={owner}
            variant={summary.variant}
            references={view.references}
            onChanged={project.reload}
          />
        </Area>
      </div>
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${summary.name}?`}
          body={
            summary.sessions === 1
              ? "This also deletes its 1 session."
              : `This also deletes its ${String(summary.sessions)} sessions.`
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            setDeleting(false)
            act(async () => {
              await api.deleteProject(id)
              onDeleted(id)
            })
          }}
          onCancel={() => {
            setDeleting(false)
          }}
        />
      ) : null}
    </section>
  )
}

function StylePage({ variant }: { variant: Variant }): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const style = useLoad(useCallback(() => api.getStyle(variant), [api, variant]))
  const owner: Owner = { kind: "style", variant }
  const view = style.value
  const title = styleName(variant)
  if (view === null) {
    return (
      <section className="page">
        <PageHeader title={title} />
        <div className="page-body" />
      </section>
    )
  }
  return (
    <section className="page">
      <PageHeader title={title} />
      <div className="page-body">
        <p className="page-note">{usedBy(view.usedBy)}</p>
        <Area title="Style settings">
          <div className="settings-grid">
            <CpsField
              key={String(view.cpsLimit)}
              value={view.cpsLimit}
              inherit={null}
              onSave={(cpsLimit) => {
                if (cpsLimit !== null) {
                  act(async () => {
                    style.set(await api.updateStyle(variant, { cpsLimit }))
                  })
                }
              }}
            />
          </div>
        </Area>
        <Area title="Rules and glossary">
          <RulesEditor
            own={view.rules}
            inherited={[]}
            inheritedFrom={null}
            onSave={async (rules: Rule[]) => {
              await api.saveRules(owner, rules)
              style.update((current) => ({ ...current, rules }))
            }}
          />
        </Area>
        <Area title="Reference translations">
          <ReferencesPanel
            owner={owner}
            variant={variant}
            references={view.references}
            onChanged={style.reload}
          />
        </Area>
      </div>
    </section>
  )
}

function usedBy(names: string[]): string {
  if (names.length === 0) {
    return "Not used by any project yet. Changes here reach every project in this language."
  }
  const sorted = [...names].sort((left, right) => left.localeCompare(right))
  const count = names.length === 1 ? "1 project" : `${String(names.length)} projects`
  return `Used by ${count}: ${sorted.join(", ")}.`
}

// A titled area of a page, with an optional action at the right of its title.
function Area({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const titleId = useId()
  return (
    <section className="page-section" aria-labelledby={titleId}>
      <div className="section-head">
        <h2 className="section-title" id={titleId}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const CPS_PATTERN = /^\d+$/

// Characters per second, 1 to 60. On a project it can follow the style's value
// instead, saved as null.
function CpsField({
  value,
  inherit,
  onSave,
}: {
  value: number | null
  inherit: { label: string; value: number } | null
  onSave: (value: number | null) => void
}): React.JSX.Element {
  const inputId = useId()
  const hintId = useId()
  const inheriting = inherit !== null && value === null
  const [text, setText] = useState(String(value ?? inherit?.value ?? ""))
  const parsed = CPS_PATTERN.test(text.trim()) ? Number(text.trim()) : null
  const valid = parsed !== null && parsed >= 1 && parsed <= 60
  return (
    <div className="page-field">
      <label className="field-label" htmlFor={inputId}>
        Characters per second
      </label>
      <div className="field-row">
        <input
          id={inputId}
          className="number-input"
          inputMode="numeric"
          value={inheriting ? String(inherit.value) : text}
          disabled={inheriting}
          aria-invalid={!inheriting && !valid}
          aria-describedby={hintId}
          onChange={(event) => {
            setText(event.target.value)
          }}
        />
        <button
          type="button"
          aria-label="Save characters per second"
          disabled={inheriting || !valid || parsed === value}
          onClick={() => {
            if (valid) {
              onSave(parsed)
            }
          }}
        >
          Save
        </button>
      </div>
      {inherit === null ? null : (
        <label className="choice">
          <input
            type="checkbox"
            checked={inheriting}
            onChange={(event) => {
              onSave(event.target.checked ? null : valid ? parsed : inherit.value)
            }}
          />
          {`Use the ${inherit.label}'s value (${String(inherit.value)})`}
        </label>
      )}
      <span id={hintId} className={!inheriting && !valid ? "field-error" : "hint"}>
        {!inheriting && !valid
          ? "Use a whole number from 1 to 60."
          : "Sets how long each line can be."}
      </span>
    </div>
  )
}

function SessionTable({
  sessions,
  onOpen,
  onFinished,
}: {
  sessions: SessionSummary[] | null
  onOpen: (id: string) => void
  onFinished: (id: string, value: boolean) => void
}): React.JSX.Element | null {
  if (sessions === null) {
    return null
  }
  if (sessions.length === 0) {
    return <p className="hint">No sessions yet. Start one for the next episode.</p>
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th scope="col">Script</th>
          <th scope="col">Progress</th>
          <th scope="col" className="num">
            Open flags
          </th>
          <th scope="col">Last worked on</th>
          <th scope="col">Status</th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => (
          <tr key={session.id}>
            <td>{session.scriptName === "" ? "No script yet" : session.scriptName}</td>
            <td className="tabular">{`${String(session.translated)} of ${String(session.total)} lines`}</td>
            <td className="num">{session.openFlags}</td>
            <td className="tabular">{formatDate(session.updatedAt)}</td>
            <td>{session.finished ? "Finished" : "In progress"}</td>
            <td>
              <span className="row-actions">
                <button
                  type="button"
                  onClick={() => {
                    onOpen(session.id)
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onFinished(session.id, !session.finished)
                  }}
                >
                  {session.finished ? "Reopen" : "Mark finished"}
                </button>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
