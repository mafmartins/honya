import { useEffect, useId, useState } from "react"
import { toEuros } from "../../../core/providers/prices"
import type { SessionStats } from "../../../shared/api"
import { useReport } from "../../action"
import { errorMessage, useApi } from "../../api"
import { PageHeader } from "../PageHeader"

// The open session's numbers: lines, flags, work done and what it cost.
export function StatsPage({ sessionId }: { sessionId: string | null }): React.JSX.Element {
  return (
    <section className="page">
      <PageHeader title="Session stats" />
      {sessionId === null ? (
        <div className="page-body">
          <div className="empty-state">
            <p>Open a session to see its stats.</p>
          </div>
        </div>
      ) : (
        <StatsBody key={sessionId} sessionId={sessionId} />
      )}
    </section>
  )
}

// Refreshed as the AI writes lines and the session is saved, like the menu's summary.
function StatsBody({ sessionId }: { sessionId: string }): React.JSX.Element {
  const api = useApi()
  const report = useReport()
  const [loaded, setLoaded] = useState<{ stats: SessionStats; rate: number } | null>(null)
  useEffect(() => {
    let live = true
    const load = (): void => {
      Promise.all([api.sessionStats(sessionId), api.getSettings()]).then(
        ([stats, settings]) => {
          if (live) {
            setLoaded({ stats, rate: settings.eurRate })
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
      if (event.sessionId === sessionId && event.type !== "run-progress") {
        load()
      }
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [api, report, sessionId])
  if (loaded === null) {
    return <div className="page-body" />
  }
  const { stats, rate } = loaded
  return (
    <div className="page-body">
      <div className="stat-grid">
        <StatTile
          title="Lines"
          rows={[
            ["Translated by the AI", count(stats.lines.ai)],
            ["Translated by you", count(stats.lines.manual)],
            ["Still untranslated", count(stats.lines.untranslated)],
            ["Total", count(stats.lines.total)],
          ]}
        />
        <StatTile
          title="Flags"
          rows={[
            ["Open", count(stats.flags.open)],
            ["Accepted", count(stats.flags.accepted)],
            ["Edited", count(stats.flags.edited)],
            ["Retranslated", count(stats.flags.retranslated)],
          ]}
        />
        <StatTile
          title="Work"
          rows={[
            ["Lines sent to the strong model", count(stats.strongLines)],
            ["Lines retranslated on request", count(stats.retranslatedLines)],
            ["Time spent", duration(stats.activeMs)],
            ["Frames grabbed", count(stats.framesGrabbed)],
          ]}
        />
      </div>
      <CostArea stats={stats} rate={rate} />
    </div>
  )
}

function StatTile({
  title,
  rows,
}: {
  title: string
  rows: [label: string, value: string][]
}): React.JSX.Element {
  const titleId = useId()
  return (
    <section className="tile" aria-labelledby={titleId}>
      <h2 className="tile-label" id={titleId}>
        {title}
      </h2>
      <dl className="stat-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function CostArea({ stats, rate }: { stats: SessionStats; rate: number }): React.JSX.Element {
  const titleId = useId()
  const { cost } = stats
  return (
    <section className="page-section" aria-labelledby={titleId}>
      <h2 className="section-title" id={titleId}>
        Cost
      </h2>
      <p className="stat-headline">{headline(stats, rate)}</p>
      {cost.requests === 0 ? null : (
        <p className="hint tabular">
          {`${plural(cost.requests, "request", "requests")} · ${count(cost.input)} tokens in · ${count(cost.output)} tokens out`}
        </p>
      )}
      {stats.models.length === 0 ? null : (
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col" className="num">
                Requests
              </th>
              <th scope="col" className="num">
                Tokens in
              </th>
              <th scope="col" className="num">
                Tokens out
              </th>
              <th scope="col" className="num">
                €
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.models.map((model) => (
              <tr key={model.model}>
                <td>{model.model}</td>
                <td className="num">{count(model.requests)}</td>
                <td className="num">{count(model.input)}</td>
                <td className="num">{count(model.output)}</td>
                <td className="num">{model.usd === null ? "Unknown" : euros(model.usd, rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">Costs are estimates from list prices.</p>
      {cost.unpriced.length === 0 ? null : (
        <p className="hint">{`Not in the total: ${cost.unpriced.join(", ")}, whose prices aren't known.`}</p>
      )}
    </section>
  )
}

function headline(stats: SessionStats, rate: number): string {
  const { usd, requests } = stats.cost
  if (usd === null) {
    return requests === 0 ? "No cost yet" : "Cost unknown"
  }
  return `≈ ${euros(usd, rate)} ($${usd.toFixed(2)} at ${String(rate)})`
}

function euros(usd: number, rate: number): string {
  const value = toEuros(usd, rate)
  return value > 0 && value < 0.005 ? "< €0.01" : `€${value.toFixed(2)}`
}

function count(value: number): string {
  return value.toLocaleString("en-GB")
}

function plural(value: number, one: string, many: string): string {
  return `${count(value)} ${value === 1 ? one : many}`
}

// Active time as "12 min 5 s".
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  return `${String(Math.floor(seconds / 60))} min ${String(seconds % 60)} s`
}
