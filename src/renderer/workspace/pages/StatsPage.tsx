import { PageHeader } from "../PageHeader"

// Placeholder until the stats page is built.
export function StatsPage({ sessionId }: { sessionId: string | null }): React.JSX.Element {
  return (
    <section className="page" data-session={sessionId ?? ""}>
      <PageHeader title="Session stats" />
      <div className="page-body" />
    </section>
  )
}
