import { PageHeader } from "../PageHeader"

// Placeholder until the session page is built.
export function SessionPage({ sessionId }: { sessionId: string | null }): React.JSX.Element {
  return (
    <section className="page" data-session={sessionId ?? ""}>
      <PageHeader title="Session" />
      <div className="page-body" />
    </section>
  )
}
