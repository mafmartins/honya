import { useEffect, useState } from "react"
import { toEuros } from "../../core/providers/prices"
import type { ProjectSummary, SessionStats, SessionSummary, Variant } from "../../shared/api"
import { useReport } from "../action"
import { errorMessage, useApi } from "../api"
import { styleName, type Route } from "./route"

const MANAGE = "manage"

export interface MenuProps {
  route: Route
  projectId: string | null
  sessionId: string | null
  onNavigate: (route: Route) => void
  onSwitchProject: (id: string) => void
}

// The left menu: name, project switcher, navigation, recent sessions and a summary
// of the open session.
export function Menu({
  route,
  projectId,
  sessionId,
  onNavigate,
  onSwitchProject,
}: MenuProps): React.JSX.Element {
  const api = useApi()
  const report = useReport()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [recent, setRecent] = useState<SessionSummary[]>([])

  // Reloaded on every page change, so a project or session made elsewhere shows up.
  useEffect(() => {
    let live = true
    Promise.all([api.listProjects(), api.recentSessions()]).then(
      ([listed, sessions]) => {
        if (live) {
          setProjects(listed)
          setRecent(sessions)
        }
      },
      (error: unknown) => {
        if (live) {
          report(errorMessage(error))
        }
      },
    )
    return () => {
      live = false
    }
  }, [api, report, route, sessionId])

  const navItem = (label: string, target: Route, active: boolean): React.JSX.Element => (
    <li>
      <button
        type="button"
        className="menu-item"
        aria-current={active ? "page" : undefined}
        onClick={() => {
          onNavigate(target)
        }}
      >
        {label}
      </button>
    </li>
  )
  const styleItem = (variant: Variant): React.JSX.Element =>
    navItem(
      styleName(variant),
      { page: "style", variant },
      route.page === "style" && route.variant === variant,
    )

  return (
    <nav className="menu" aria-label="Menu">
      <p className="menu-brand">Honya</p>
      <label className="menu-section menu-field">
        <span className="menu-label">Project</span>
        <select
          aria-label="Project"
          value={projectId ?? ""}
          onChange={(event) => {
            const value = event.target.value
            if (value === MANAGE) {
              onNavigate({ page: "projects" })
            } else if (value !== "") {
              onSwitchProject(value)
            }
          }}
        >
          {projectId === null ? (
            <option value="" disabled>
              {projects.length === 0 ? "No projects yet" : "Choose a project"}
            </option>
          ) : null}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
          <option value={MANAGE}>Manage projects</option>
        </select>
      </label>
      <div className="menu-section">
        <ul className="menu-nav">
          {navItem("Session", { page: "session", sessionId }, route.page === "session")}
          {navItem("Session stats", { page: "stats" }, route.page === "stats")}
          {navItem(
            "Projects",
            { page: "projects" },
            route.page === "projects" || route.page === "project",
          )}
          <li className="menu-group">
            <span className="menu-label">Language styles</span>
            <ul className="menu-nav">
              {styleItem("pt-pt")}
              {styleItem("pt-br")}
            </ul>
          </li>
          {navItem("Settings", { page: "settings" }, route.page === "settings")}
        </ul>
      </div>
      <section className="menu-section" aria-labelledby="menu-recent">
        <h2 className="menu-label" id="menu-recent">
          Recent sessions
        </h2>
        {recent.length === 0 ? (
          <p className="menu-meta">No sessions yet.</p>
        ) : (
          <ul className="menu-nav">
            {recent.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="menu-item menu-recent"
                  aria-current={
                    route.page === "session" && item.id === sessionId ? "true" : undefined
                  }
                  onClick={() => {
                    onSwitchProject(item.projectId)
                    onNavigate({ page: "session", sessionId: item.id })
                  }}
                >
                  <span>{item.scriptName === "" ? "No script yet" : item.scriptName}</span>
                  <span className="menu-meta">
                    {item.projectName} · {item.finished ? "Finished" : "In progress"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {sessionId === null ? null : <SessionBox key={sessionId} sessionId={sessionId} />}
    </nav>
  )
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`
}

function costLine(stats: SessionStats, rate: number): string {
  if (stats.cost.usd === null) {
    return stats.cost.requests === 0 ? "No cost yet" : "Cost unknown"
  }
  return `≈ €${toEuros(stats.cost.usd, rate).toFixed(2)} so far`
}

// Lines translated, open flags and cost of the open session, refreshed as the AI
// writes lines.
function SessionBox({ sessionId }: { sessionId: string }): React.JSX.Element {
  const api = useApi()
  const report = useReport()
  const [summary, setSummary] = useState<{ stats: SessionStats; rate: number } | null>(null)
  useEffect(() => {
    let live = true
    const load = (): void => {
      Promise.all([api.sessionStats(sessionId), api.getSettings()]).then(
        ([stats, settings]) => {
          if (live) {
            setSummary({ stats, rate: settings.eurRate })
          }
        },
        (error: unknown) => {
          if (live) {
            report(errorMessage(error))
          }
        },
      )
    }
    load()
    const unsubscribe = api.onWorkspaceEvent((event) => {
      if (event.sessionId === sessionId && (event.type === "lines" || event.type === "run-ended")) {
        load()
      }
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [api, report, sessionId])
  return (
    <section className="menu-section menu-box" aria-labelledby="menu-this-session">
      <h2 className="menu-label" id="menu-this-session">
        This session
      </h2>
      {summary === null ? null : (
        <ul className="menu-stats">
          <li>{`${String(summary.stats.lines.ai + summary.stats.lines.manual)} of ${String(summary.stats.lines.total)} lines translated`}</li>
          <li>{plural(summary.stats.flags.open, "open flag", "open flags")}</li>
          <li>{costLine(summary.stats, summary.rate)}</li>
        </ul>
      )}
    </section>
  )
}
