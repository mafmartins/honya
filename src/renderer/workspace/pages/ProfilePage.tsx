import { useEffect, useState } from "react"
import type { Owner } from "../../../shared/api"
import { useReport } from "../../action"
import { errorMessage, useApi } from "../../api"
import { PageHeader } from "../PageHeader"
import { styleName } from "../route"

// A project's or a language style's page. Placeholder body until it is built.
export function ProfilePage({ owner }: { owner: Owner }): React.JSX.Element {
  const api = useApi()
  const report = useReport()
  // Kept with its id, so another project's name never shows while the next loads.
  const [loaded, setLoaded] = useState<{ id: string; name: string } | null>(null)
  const projectId = owner.kind === "project" ? owner.id : null
  useEffect(() => {
    if (projectId === null) {
      return
    }
    let live = true
    api.getProject(projectId).then(
      (view) => {
        if (live) {
          setLoaded({ id: projectId, name: view.summary.name })
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
  }, [api, report, projectId])
  const title =
    owner.kind === "style"
      ? styleName(owner.variant)
      : loaded !== null && loaded.id === owner.id
        ? loaded.name
        : "Project"
  return (
    <section className="page">
      <PageHeader title={title} />
      <div className="page-body" />
    </section>
  )
}
