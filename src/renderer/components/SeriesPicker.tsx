import { useEffect, useEffectEvent, useState } from "react"
import type { SeriesSummary, Variant } from "../../shared/api"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"

const NEW = "__new__"

export function SeriesPicker(props: {
  variant: Variant
  seriesId: string | null
  onSelect: (id: string | null) => void
}): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [series, setSeries] = useState<SeriesSummary[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [reload, setReload] = useState(0)

  const forgetMissing = useEffectEvent((list: SeriesSummary[]): void => {
    if (props.seriesId !== null && !list.some((item) => item.id === props.seriesId)) {
      props.onSelect(null)
    }
  })

  useEffect(() => {
    let current = true
    api.listSeries(props.variant).then(
      (list) => {
        if (!current) {
          return
        }
        setSeries(list.series)
        forgetMissing(list.series)
        if (list.problems.length > 0) {
          report(list.problems.join(" "))
        }
      },
      (error: unknown) => {
        if (current) {
          report(errorMessage(error))
        }
      },
    )
    return () => {
      current = false
    }
  }, [api, props.variant, reload, report])

  if (creating) {
    return (
      <div className="picked">
        <input
          aria-label="new series name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
        <button
          type="button"
          className="action"
          onClick={() => {
            act(async () => {
              const created = await api.createSeries(props.variant, name)
              setCreating(false)
              setName("")
              setReload((count) => count + 1)
              props.onSelect(created.id)
            })
          }}
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false)
            setName("")
          }}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <select
      aria-label="series"
      value={props.seriesId ?? ""}
      onChange={(event) => {
        const value = event.target.value
        if (value === NEW) {
          setCreating(true)
          return
        }
        props.onSelect(value === "" ? null : value)
      }}
    >
      <option value="">Choose a series…</option>
      {series.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
      <option value={NEW}>New series…</option>
    </select>
  )
}
