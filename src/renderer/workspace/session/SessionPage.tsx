import { useCallback, useRef, useState } from "react"
import type { Preset, ProviderId, SessionView } from "../../../shared/api"
import { useAction } from "../../action"
import { useApi } from "../../api"
import { StyleChecklist } from "../../components/StyleChecklist"
import { PageHeader } from "../PageHeader"
import { Filters, filterLines, type LineFilter } from "./Filters"
import { ExportDialog } from "./ExportDialog"
import { LineList } from "./LineList"
import { LinePanel } from "./LinePanel"
import { TopBar } from "./TopBar"
import {
  SaveStatusContext,
  useAiRun,
  useSaveStatus,
  useSession,
  type RunEnding,
} from "./useSession"
import { CloseIcon } from "../CloseIcon"

const NOT_WORKING: ReadonlySet<number> = new Set()

// The session page: the empty state until a script is loaded, then the top bar, the
// filters, the line list and the selected line's panel.
export function SessionPage({
  sessionId,
  onBack,
  onNewSession,
}: {
  sessionId: string | null
  // Leaves a session that couldn't be opened for the projects page.
  onBack?: () => void
  // Starts an empty session in a project, offered once an export is saved.
  onNewSession?: (projectId: string) => void
}): React.JSX.Element {
  if (sessionId === null) {
    return (
      <section className="page">
        <PageHeader title="Session" />
        <div className="page-body">
          <div className="empty-state">
            <p>Open a project from the menu to start a session.</p>
          </div>
        </div>
      </section>
    )
  }
  return <OpenSession key={sessionId} id={sessionId} onBack={onBack} onNewSession={onNewSession} />
}

function OpenSession({
  id,
  onBack,
  onNewSession,
}: {
  id: string
  onBack: (() => void) | undefined
  onNewSession: ((projectId: string) => void) | undefined
}): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const { view, failure, setView, setLine, reload } = useSession(api, id)
  const { run, ending, start, dismiss } = useAiRun(api, id, reload)
  const { saving, status } = useSaveStatus()
  const [stopping, setStopping] = useState(false)
  const [filter, setFilter] = useState<LineFilter>("all")
  const [search, setSearch] = useState("")
  const [exporting, setExporting] = useState(false)
  const [chosen, setChosen] = useState<number | null>(null)
  const [seenNoEnglish, setSeenNoEnglish] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const replace = useCallback(
    (next: SessionView | null): void => {
      if (next !== null) {
        setView(next)
      }
    },
    [setView],
  )
  if (view === null && failure !== null) {
    return (
      <section className="page">
        <PageHeader title="Session" />
        <div className="page-body">
          <div className="empty-state" role="alert">
            <p>Couldn't open this session.</p>
            <p className="muted">{failure}</p>
            <div className="line-actions">
              <button type="button" className="primary" onClick={reload}>
                Try again
              </button>
              {onBack === undefined ? null : (
                <button type="button" onClick={onBack}>
                  Back to projects
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }
  if (view === null) {
    return (
      <section className="page">
        <PageHeader title="Session" />
        <div className="page-body">
          <p className="muted">Opening the session…</p>
        </div>
      </section>
    )
  }
  if (view.lines.length === 0) {
    return (
      <EmptySession
        view={view}
        onPick={() => {
          act(async () => {
            replace(await api.pickScriptForSession(id))
          })
        }}
        onStyles={(styles) => {
          act(async () => {
            replace(await api.confirmStyles(id, styles))
          })
        }}
      />
    )
  }
  const lines = filterLines(view.lines, filter, search)
  const selected = chosen ?? view.lines[0]?.index ?? null
  const selectedLine = view.lines.find((line) => line.index === selected)
  const runAi = (): void => {
    setStopping(false)
    start()
  }
  const options = (patch: { provider?: ProviderId; preset?: Preset }): void => {
    act(async () => {
      replace(await api.setSessionOptions(id, patch))
    })
  }
  return (
    <SaveStatusContext.Provider value={status}>
      <section
        className="page session-page"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            listRef.current?.focus()
          }
        }}
      >
        <TopBar
          view={view}
          saving={saving}
          run={run}
          stopping={run !== null && stopping}
          onOptions={options}
          onAttachVideo={() => {
            act(async () => {
              replace(await api.pickVideoForSession(id))
            })
          }}
          onDetachVideo={() => {
            act(async () => {
              replace(await api.detachVideo(id))
            })
          }}
          onExport={() => {
            setExporting(true)
          }}
          onRun={runAi}
          onStop={() => {
            setStopping(true)
            act(() => api.stopAi())
          }}
        />
        {ending === null ? null : <RunNote ending={ending} onRetry={runAi} onDismiss={dismiss} />}
        {seenNoEnglish ? null : (
          <NoEnglishNote
            count={view.lines.filter((line) => line.englishMissing).length}
            onDismiss={() => {
              setSeenNoEnglish(true)
            }}
          />
        )}
        <Filters
          lines={view.lines}
          filter={filter}
          search={search}
          onFilter={setFilter}
          onSearch={setSearch}
        />
        <div className="session-body">
          <LineList
            lines={lines}
            selected={selected}
            working={run === null || run === "starting" ? NOT_WORKING : run.working}
            onSelect={setChosen}
            onEdit={() => {
              panelRef.current?.querySelector("textarea")?.focus()
            }}
            focusRef={listRef}
          />
          <aside ref={panelRef} className="line-panel" aria-label="Line">
            {selectedLine === undefined ? null : (
              <LinePanel
                sessionId={id}
                line={selectedLine}
                video={view.videoName}
                owner={{ kind: "project", id: view.projectId }}
                styleOwner={{ kind: "style", variant: view.variant }}
                onLine={setLine}
                onLeave={() => {
                  listRef.current?.focus()
                }}
              />
            )}
          </aside>
        </div>
        {exporting ? (
          <ExportDialog
            sessionId={id}
            edited={view.lines.some((line) => line.origin === "manual")}
            owner={{ kind: "project", id: view.projectId }}
            styleOwner={{ kind: "style", variant: view.variant }}
            onClose={() => {
              setExporting(false)
              listRef.current?.focus()
            }}
            {...(onNewSession === undefined
              ? {}
              : {
                  onNextEpisode: () => {
                    setExporting(false)
                    onNewSession(view.projectId)
                  },
                })}
          />
        ) : null}
      </section>
    </SaveStatusContext.Provider>
  )
}

// Why the last run ended early, with a way to go on.
function RunNote({
  ending,
  onRetry,
  onDismiss,
}: {
  ending: RunEnding
  onRetry: () => void
  onDismiss: () => void
}): React.JSX.Element {
  const text =
    ending.outcome === "stopped"
      ? "Stopped. Finished batches are saved."
      : ending.message === null
        ? "The AI run stopped. Finished lines are saved."
        : `The AI run stopped: ${ending.message.replace(/\.+$/, "")}. Finished lines are saved.`
  return (
    <div className="session-note" role="status">
      <p>{text}</p>
      {ending.outcome === "failed" ? (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
        <CloseIcon />
      </button>
    </div>
  )
}

// Lines the script came with in Portuguese: they are the translator's, with no English.
function NoEnglishNote({
  count,
  onDismiss,
}: {
  count: number
  onDismiss: () => void
}): React.JSX.Element | null {
  if (count === 0) return null
  const lines = count === 1 ? "1 line was" : `${String(count)} lines were`
  return (
    <div className="session-note" role="status">
      <p>{`${lines} already in Portuguese in the file, so they're marked as yours. Their English isn't in the file.`}</p>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
        <CloseIcon />
      </button>
    </div>
  )
}

function EmptySession({
  view,
  onPick,
  onStyles,
}: {
  view: SessionView
  onPick: () => void
  onStyles: (styles: string[]) => void
}): React.JSX.Element {
  return (
    <section className="page">
      <PageHeader title={view.scriptName ?? "Session"} />
      <div className="page-body">
        {view.needsStyles === null ? (
          <div
            className="empty-state drop-target"
            onDragOver={(event) => {
              event.preventDefault()
            }}
            onDrop={(event) => {
              // The renderer can't read a dropped file's path, so a drop opens the picker.
              event.preventDefault()
              onPick()
            }}
          >
            <p>Drop an .ass file or choose one</p>
            <button type="button" className="primary load-script" onClick={onPick}>
              Load script
            </button>
          </div>
        ) : (
          <div className="session-styles">
            <p>Which styles are dialogue? Honya translates only those.</p>
            <StyleChecklist
              styles={view.needsStyles}
              confirmLabel="Use these styles"
              onConfirm={onStyles}
            />
          </div>
        )}
      </div>
    </section>
  )
}
