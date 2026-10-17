import { useCallback, useRef, useState } from "react"
import type { Preset, ProviderId, SessionView } from "../../../shared/api"
import { useAction } from "../../action"
import { useApi } from "../../api"
import { StyleChecklist } from "../../components/StyleChecklist"
import { PageHeader } from "../PageHeader"
import { Filters, filterLines, type LineFilter } from "./Filters"
import { LineList } from "./LineList"
import { TopBar } from "./TopBar"
import { SaveStatusContext, useAiRun, useSaveStatus, useSession } from "./useSession"

const NOT_WORKING: ReadonlySet<number> = new Set()

// The session page: the empty state until a script is loaded, then the top bar, the
// filters, the line list and the selected line's panel.
export function SessionPage({ sessionId }: { sessionId: string | null }): React.JSX.Element {
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
  return <OpenSession key={sessionId} id={sessionId} />
}

function OpenSession({ id }: { id: string }): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const { view, setView, reload } = useSession(api, id)
  const { run, start } = useAiRun(api, id, reload)
  const { saving, status } = useSaveStatus()
  const [stopping, setStopping] = useState(false)
  const [filter, setFilter] = useState<LineFilter>("all")
  const [search, setSearch] = useState("")
  const [chosen, setChosen] = useState<number | null>(null)
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
          onRun={() => {
            setStopping(false)
            start()
          }}
          onStop={() => {
            setStopping(true)
            act(() => api.stopAi())
          }}
        />
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
            working={NOT_WORKING}
            onSelect={setChosen}
            onEdit={() => {
              panelRef.current?.querySelector("textarea")?.focus()
            }}
            focusRef={listRef}
          />
          {/* The line panel (frame, editor, actions) takes this slot. */}
          <aside ref={panelRef} className="line-panel" aria-label="Line">
            {selectedLine === undefined ? null : (
              <p className="line-panel-meta">{`Line ${String(selectedLine.index + 1)}`}</p>
            )}
          </aside>
        </div>
      </section>
    </SaveStatusContext.Provider>
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
