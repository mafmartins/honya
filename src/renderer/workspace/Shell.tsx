import { useCallback, useEffect, useRef, useState } from "react"
import type { AppSettings, HonyaApi, LaunchInfo, Variant } from "../../shared/api"
import { ErrorContext } from "../action"
import { ApiContext, errorMessage } from "../api"
import { ErrorLine } from "../ErrorLine"
import { ConfirmDialog } from "./ConfirmDialog"
import { LaunchDialog } from "./LaunchDialog"
import { Menu } from "./Menu"
import { ProfilePage, type ProfileActions } from "./pages/ProfilePage"
import { ProjectsPage } from "./pages/ProjectsPage"
import { SettingsPage } from "./pages/SettingsPage"
import { StatsPage } from "./pages/StatsPage"
import type { Route } from "./route"
import { SessionPage } from "./session/SessionPage"
import { SetupDialog } from "./SetupDialog"

type Dialog =
  | { kind: "none" }
  | { kind: "setup"; settings: AppSettings }
  | { kind: "launch"; info: LaunchInfo; variant: Variant }

// How long closing the window waits for a stopped run to end.
const CLOSE_WAIT_MS = 5000

// The workspace: the left menu and the page for the current route. The open session
// stays open while other pages are shown.
export function Shell({ api }: { api: HonyaApi }): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ page: "session", sessionId: null })
  const [projectId, setProjectId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" })
  // Leaving the open session while the AI translates it waits for "Stop the AI run?".
  const [leaving, setLeaving] = useState<{ proceed: () => void } | null>(null)
  const [closing, setClosing] = useState(false)
  const leave = useCallback(
    (proceed: () => void): void => {
      if (sessionId === null) {
        proceed()
        return
      }
      api.aiActive().then(
        (active) => {
          if (active === sessionId) {
            setLeaving({ proceed })
          } else {
            proceed()
          }
        },
        () => {
          proceed()
        },
      )
    },
    [api, sessionId],
  )
  const show = useCallback((next: Route): void => {
    if (next.page === "session") {
      setSessionId(next.sessionId)
    }
    setError(null)
    setRoute(next)
  }, [])
  const showSession = useCallback(
    (project: string, session: string): void => {
      setProjectId(project)
      show({ page: "session", sessionId: session })
    },
    [show],
  )
  // A project opens on its latest unfinished session, or a new empty one.
  const showProject = useCallback(
    async (project: string): Promise<void> => {
      const sessions = await api.projectSessions(project)
      const unfinished = sessions.find((item) => !item.finished)
      showSession(project, unfinished?.id ?? (await api.newSession(project)))
    },
    [api, showSession],
  )
  // Opening another session leaves the open one, so a running AI asks first.
  const openSession = useCallback(
    (project: string, session: string): void => {
      if (session === sessionId) {
        showSession(project, session)
      } else {
        leave(() => {
          showSession(project, session)
        })
      }
    },
    [leave, sessionId, showSession],
  )
  const startSession = useCallback(
    (project: string): void => {
      leave(() => {
        api.newSession(project).then(
          (session) => {
            showSession(project, session)
          },
          (failure: unknown) => {
            setError(errorMessage(failure))
          },
        )
      })
    },
    [api, leave, showSession],
  )
  // Bumped when a page renames or deletes a project, so the menu lists it again.
  const [revision, setRevision] = useState(0)
  const changed = useCallback((): void => {
    setRevision((current) => current + 1)
  }, [])
  // A deleted project took its sessions with it, the open one included.
  const deleted = useCallback(
    (project: string): void => {
      if (project === projectId) {
        setProjectId(null)
        setSessionId(null)
      }
      changed()
      show({ page: "projects" })
    },
    [changed, projectId, show],
  )
  // Other pages keep the session open, so its run goes on; another session doesn't.
  const navigate = useCallback(
    (next: Route): void => {
      if (next.page === "session" && next.sessionId !== sessionId) {
        leave(() => {
          show(next)
        })
      } else {
        show(next)
      }
    },
    [leave, sessionId, show],
  )
  const boot = useCallback((): void => {
    Promise.all([api.launchInfo(), api.getSettings()]).then(
      ([info, settings]) => {
        if (!info.setupDone) {
          setDialog({ kind: "setup", settings })
          return
        }
        leave(() => {
          setDialog({ kind: "launch", info, variant: settings.defaults.variant })
        })
      },
      (failure: unknown) => {
        setError(errorMessage(failure))
      },
    )
  }, [api, leave])
  // Only on mount: boot changes with the open session, which must not reopen the launch window.
  const booted = useRef(false)
  useEffect(() => {
    if (!booted.current) {
      booted.current = true
      boot()
    }
  }, [boot])
  useEffect(
    () =>
      api.onBeforeClose(() => {
        setClosing(true)
      }),
    [api],
  )
  // Stops the run, then lets the window close once it ended or after CLOSE_WAIT_MS.
  const stopAndClose = (): void => {
    let done = false
    const finish = (): void => {
      if (done) {
        return
      }
      done = true
      unsubscribe()
      clearTimeout(timer)
      api.confirmClose(true)
    }
    const unsubscribe = api.onWorkspaceEvent((event) => {
      if (event.type === "run-ended") {
        finish()
      }
    })
    const timer = setTimeout(finish, CLOSE_WAIT_MS)
    api
      .stopAi()
      .then(() => api.aiActive())
      .then(
        (active) => {
          if (active === null) {
            finish()
          }
        },
        (failure: unknown) => {
          setError(errorMessage(failure))
        },
      )
  }
  return (
    <ApiContext.Provider value={api}>
      <ErrorContext.Provider value={setError}>
        <div className="shell">
          <Menu
            route={route}
            projectId={projectId}
            sessionId={sessionId}
            revision={revision}
            onNavigate={navigate}
            onOpenSession={openSession}
            onOpenProject={(id) => {
              leave(() => {
                showProject(id).catch((failure: unknown) => {
                  setError(errorMessage(failure))
                })
              })
            }}
          />
          <main className="shell-main">
            <ErrorLine message={error} />
            <Page
              route={route}
              sessionId={sessionId}
              onNavigate={navigate}
              actions={{
                onOpenSession: openSession,
                onNewSession: startSession,
                onDeleted: deleted,
                onChanged: changed,
              }}
            />
          </main>
          {dialog.kind === "setup" ? <SetupDialog initial={dialog.settings} onDone={boot} /> : null}
          {dialog.kind === "launch" ? (
            <LaunchDialog
              info={dialog.info}
              defaultVariant={dialog.variant}
              onContinue={() => {
                const current = dialog.info.continueSession
                if (current !== null) {
                  showSession(current.projectId, current.id)
                }
                setDialog({ kind: "none" })
                return Promise.resolve()
              }}
              onOpenProject={async (id) => {
                await showProject(id)
                setDialog({ kind: "none" })
              }}
              onNewSession={async (id) => {
                showSession(id, await api.newSession(id))
                setDialog({ kind: "none" })
              }}
              onCreateProject={async (name, variant) => {
                const created = await api.createProject(name, variant)
                showSession(created.id, await api.newSession(created.id))
                setDialog({ kind: "none" })
              }}
              onClose={() => {
                setDialog({ kind: "none" })
              }}
            />
          ) : null}
          {leaving === null ? null : (
            <ConfirmDialog
              {...STOP_RUN}
              onConfirm={() => {
                setLeaving(null)
                api.stopAi().catch((failure: unknown) => {
                  setError(errorMessage(failure))
                })
                leaving.proceed()
              }}
              onCancel={() => {
                setLeaving(null)
              }}
            />
          )}
          {closing ? (
            <ConfirmDialog
              {...STOP_RUN}
              onConfirm={() => {
                setClosing(false)
                stopAndClose()
              }}
              onCancel={() => {
                setClosing(false)
                api.confirmClose(false)
              }}
            />
          ) : null}
        </div>
      </ErrorContext.Provider>
    </ApiContext.Provider>
  )
}

const STOP_RUN = {
  title: "Stop the AI run?",
  body: "Honya is translating this session. Stopping keeps the lines already done.",
  confirmLabel: "Stop",
  cancelLabel: "Keep translating",
}

function Page({
  route,
  sessionId,
  onNavigate,
  actions,
}: {
  route: Route
  sessionId: string | null
  onNavigate: (route: Route) => void
  actions: ProfileActions
}): React.JSX.Element {
  switch (route.page) {
    case "session":
      return <SessionPage sessionId={route.sessionId} />
    case "stats":
      return <StatsPage sessionId={sessionId} />
    case "projects":
      return (
        <ProjectsPage
          onOpen={(id) => {
            onNavigate({ page: "project", id })
          }}
        />
      )
    case "project":
      return <ProfilePage owner={{ kind: "project", id: route.id }} {...actions} />
    case "style":
      return <ProfilePage owner={{ kind: "style", variant: route.variant }} {...actions} />
    case "settings":
      return <SettingsPage />
  }
}
