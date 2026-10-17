import { useCallback, useState } from "react"
import type { HonyaApi } from "../../shared/api"
import { ErrorContext } from "../action"
import { ApiContext } from "../api"
import { ErrorLine } from "../ErrorLine"
import { Menu } from "./Menu"
import { ProfilePage } from "./pages/ProfilePage"
import { ProjectsPage } from "./pages/ProjectsPage"
import { SettingsPage } from "./pages/SettingsPage"
import { StatsPage } from "./pages/StatsPage"
import type { Route } from "./route"
import { SessionPage } from "./session/SessionPage"

// The workspace: the left menu and the page for the current route. The open session
// stays open while other pages are shown.
export function Shell({ api }: { api: HonyaApi }): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ page: "session", sessionId: null })
  const [projectId, setProjectId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useCallback((next: Route): void => {
    if (next.page === "session") {
      setSessionId(next.sessionId)
    }
    setError(null)
    setRoute(next)
  }, [])
  return (
    <ApiContext.Provider value={api}>
      <ErrorContext.Provider value={setError}>
        <div className="shell">
          <Menu
            route={route}
            projectId={projectId}
            sessionId={sessionId}
            onNavigate={navigate}
            onSwitchProject={setProjectId}
          />
          <main className="shell-main">
            <ErrorLine message={error} />
            <Page route={route} sessionId={sessionId} />
          </main>
        </div>
      </ErrorContext.Provider>
    </ApiContext.Provider>
  )
}

function Page({ route, sessionId }: { route: Route; sessionId: string | null }): React.JSX.Element {
  switch (route.page) {
    case "session":
      return <SessionPage sessionId={route.sessionId} />
    case "stats":
      return <StatsPage sessionId={sessionId} />
    case "projects":
      return <ProjectsPage />
    case "project":
      return <ProfilePage owner={{ kind: "project", id: route.id }} />
    case "style":
      return <ProfilePage owner={{ kind: "style", variant: route.variant }} />
    case "settings":
      return <SettingsPage />
  }
}
