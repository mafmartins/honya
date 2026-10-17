import { useCallback, useEffect, useState } from "react"
import type { HonyaApi, LaunchInfo, Variant } from "../../shared/api"
import { ErrorContext } from "../action"
import { ApiContext, errorMessage } from "../api"
import { ErrorLine } from "../ErrorLine"
import { LaunchDialog } from "./LaunchDialog"
import { Menu } from "./Menu"
import { ProfilePage } from "./pages/ProfilePage"
import { ProjectsPage } from "./pages/ProjectsPage"
import { SettingsPage } from "./pages/SettingsPage"
import { StatsPage } from "./pages/StatsPage"
import type { Route } from "./route"
import { SessionPage } from "./session/SessionPage"
import { SetupDialog } from "./SetupDialog"

type Dialog =
  { kind: "none" } | { kind: "setup" } | { kind: "launch"; info: LaunchInfo; variant: Variant }

// The workspace: the left menu and the page for the current route. The open session
// stays open while other pages are shown.
export function Shell({ api }: { api: HonyaApi }): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ page: "session", sessionId: null })
  const [projectId, setProjectId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" })
  const navigate = useCallback((next: Route): void => {
    if (next.page === "session") {
      setSessionId(next.sessionId)
    }
    setError(null)
    setRoute(next)
  }, [])
  const openSession = useCallback(
    (project: string, session: string): void => {
      setProjectId(project)
      navigate({ page: "session", sessionId: session })
    },
    [navigate],
  )
  // A project opens on its latest unfinished session, or a new empty one.
  const openProject = useCallback(
    async (project: string): Promise<void> => {
      const sessions = await api.projectSessions(project)
      const unfinished = sessions.find((item) => !item.finished)
      openSession(project, unfinished?.id ?? (await api.newSession(project)))
    },
    [api, openSession],
  )
  const boot = useCallback((): void => {
    Promise.all([api.launchInfo(), api.getSettings()]).then(
      ([info, settings]) => {
        setDialog(
          info.setupDone
            ? { kind: "launch", info, variant: settings.defaults.variant }
            : { kind: "setup" },
        )
      },
      (failure: unknown) => {
        setError(errorMessage(failure))
      },
    )
  }, [api])
  useEffect(() => {
    boot()
  }, [boot])
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
            onOpenProject={(id) => {
              openProject(id).catch((failure: unknown) => {
                setError(errorMessage(failure))
              })
            }}
          />
          <main className="shell-main">
            <ErrorLine message={error} />
            <Page route={route} sessionId={sessionId} />
          </main>
          {dialog.kind === "setup" ? <SetupDialog onDone={boot} /> : null}
          {dialog.kind === "launch" ? (
            <LaunchDialog
              info={dialog.info}
              defaultVariant={dialog.variant}
              onContinue={(sessionId) => {
                const current = dialog.info.continueSession
                if (current?.id === sessionId) {
                  openSession(current.projectId, current.id)
                }
                setDialog({ kind: "none" })
                return Promise.resolve()
              }}
              onOpenProject={async (id) => {
                await openProject(id)
                setDialog({ kind: "none" })
              }}
              onNewSession={async (id) => {
                openSession(id, await api.newSession(id))
                setDialog({ kind: "none" })
              }}
              onCreateProject={async (name, variant) => {
                const created = await api.createProject(name, variant)
                openSession(created.id, await api.newSession(created.id))
                setDialog({ kind: "none" })
              }}
              onClose={() => {
                setDialog({ kind: "none" })
              }}
            />
          ) : null}
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
