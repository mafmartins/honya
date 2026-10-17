import { useCallback, useState } from "react"
import { VARIANTS, type Variant } from "../../../shared/api"
import { errorMessage, useApi } from "../../api"
import { formatDate } from "../../format"
import { Dialog } from "../Dialog"
import { VARIANT_LABEL } from "../labels"
import { PageHeader } from "../PageHeader"
import { useLoad } from "./useLoad"

// Every project with its language, session count and last activity; a row opens the
// project's page. New project creates one and opens its page.
export function ProjectsPage({ onOpen }: { onOpen: (id: string) => void }): React.JSX.Element {
  const api = useApi()
  const projects = useLoad(useCallback(() => api.listProjects(), [api]))
  const [creating, setCreating] = useState<Variant | null>(null)
  const startCreating = (): void => {
    api.getSettings().then(
      (settings) => {
        setCreating(settings.defaults.variant)
      },
      () => {
        setCreating("pt-pt")
      },
    )
  }
  const list = projects.value
  return (
    <section className="page">
      <PageHeader title="Projects">
        <button type="button" className="primary" onClick={startCreating}>
          New project
        </button>
      </PageHeader>
      <div className="page-body">
        {list === null ? null : list.length === 0 ? (
          <div className="empty-state">
            <p>No projects yet.</p>
            <p className="hint">A project is one series, with its own rules and sessions.</p>
            <button type="button" className="primary" onClick={startCreating}>
              New project
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Language</th>
                <th scope="col" className="num">
                  Sessions
                </th>
                <th scope="col">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {list.map((project) => (
                <tr
                  key={project.id}
                  className="row-link"
                  onClick={() => {
                    onOpen(project.id)
                  }}
                >
                  <td>
                    {/* The click reaches the row; the button gives keyboard users a stop. */}
                    <button type="button" className="cell-link">
                      {project.name}
                    </button>
                  </td>
                  <td>{VARIANT_LABEL[project.variant]}</td>
                  <td className="num">{project.sessions}</td>
                  <td className="tabular">
                    {project.lastActivity === null ? "—" : formatDate(project.lastActivity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating === null ? null : (
        <NewProjectDialog
          initialVariant={creating}
          onCreate={async (name, variant) => {
            const created = await api.createProject(name, variant)
            setCreating(null)
            onOpen(created.id)
          }}
          onClose={() => {
            setCreating(null)
          }}
        />
      )}
    </section>
  )
}

function NewProjectDialog({
  initialVariant,
  onCreate,
  onClose,
}: {
  initialVariant: Variant
  onCreate: (name: string, variant: Variant) => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState("")
  const [variant, setVariant] = useState<Variant>(initialVariant)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const create = (): void => {
    setBusy(true)
    setFailure(null)
    onCreate(name, variant).catch((error: unknown) => {
      setBusy(false)
      setFailure(errorMessage(error))
    })
  }
  return (
    <Dialog title="New project" onClose={onClose}>
      <form
        className="dialog-fields"
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <label>
          <span className="field-label">Name</span>
          <input
            value={name}
            placeholder="The series, like Frieren"
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
        {failure === null ? null : (
          <p className="error-line" role="alert">
            {failure}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || name.trim() === ""}>
            Create
          </button>
        </div>
      </form>
    </Dialog>
  )
}
