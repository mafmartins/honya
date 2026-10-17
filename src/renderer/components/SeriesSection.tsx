import { useCallback, useEffect, useState } from "react"
import type { Rule, SeriesList, SeriesSummary, Variant } from "../../shared/api"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"
import { RuleEditor } from "./RuleEditor"
import { LearnPanel } from "./LearnPanel"
import { RuleList } from "./RuleList"

export function SeriesSection({ variant }: { variant: Variant }): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [series, setSeries] = useState<SeriesSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState("")

  const apply = useCallback(
    (list: SeriesList): void => {
      setSeries(list.series)
      if (list.problems.length > 0) {
        report(list.problems.join(" "))
      }
    },
    [report],
  )

  const refresh = useCallback(async () => {
    apply(await api.listSeries(variant))
  }, [api, variant, apply])

  useEffect(() => {
    let current = true
    api.listSeries(variant).then(
      (list) => {
        if (current) {
          apply(list)
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
  }, [api, variant, apply, report])

  const saveRules = (next: Rule[]): void => {
    if (selected === null) {
      return
    }
    act(async () => {
      await api.saveSeriesRules(variant, selected, next)
      setRules(next)
      await refresh()
    })
  }

  return (
    <section aria-label="series">
      <p>{`series · ${variant}`}</p>
      {series.length === 0 ? (
        <p className="muted">No series yet. Create one on the start screen.</p>
      ) : null}
      <ul className="series-list">
        {series.map((item) => (
          <li key={item.id}>
            {renaming === item.id ? (
              <span className="picked">
                <input
                  aria-label="series name"
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
                      await api.renameSeries(variant, item.id, name)
                      setRenaming(null)
                      await refresh()
                    })
                  }}
                >
                  Save name
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(null)
                  }}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    act(async () => {
                      setRules(await api.loadSeriesRules(variant, item.id))
                      setSelected(item.id)
                    })
                  }}
                >
                  {item.name}
                </button>{" "}
                <button
                  type="button"
                  aria-label={`Rename ${item.name}`}
                  onClick={() => {
                    setRenaming(item.id)
                    setName(item.name)
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => {
                    const rules = item.ruleCount === 1 ? "rule" : "rules"
                    if (
                      !window.confirm(
                        `Delete ${item.name} and its ${String(item.ruleCount)} ${rules}?`,
                      )
                    ) {
                      return
                    }
                    act(async () => {
                      await api.deleteSeries(variant, item.id)
                      if (selected === item.id) {
                        setSelected(null)
                        setRules([])
                      }
                      await refresh()
                    })
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {selected === null ? null : (
        <>
          <p>series rules</p>
          <RuleList
            rules={rules}
            onDelete={(index) => {
              saveRules(rules.filter((_, at) => at !== index))
            }}
          />
          <RuleEditor
            onAdd={(rule) => {
              saveRules([...rules, rule])
            }}
          />
          <LearnPanel
            key={selected}
            owner={{ kind: "project", id: selected }}
            variant={variant}
            onChanged={() => {
              act(async () => {
                setRules(await api.loadSeriesRules(variant, selected))
                await refresh()
              })
            }}
          />
        </>
      )}
    </section>
  )
}
