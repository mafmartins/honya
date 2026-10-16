import { useEffect, useState } from "react"
import { PROVIDERS, type ModelPair, type ProviderId } from "../../shared/api"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"

export function ModelsSection(): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [stored, setStored] = useState<Map<ProviderId, ModelPair>>(new Map())
  const [draft, setDraft] = useState<Map<ProviderId, ModelPair>>(new Map())

  useEffect(() => {
    let current = true
    Promise.all(
      PROVIDERS.map(async (provider) => [provider, await api.getModels(provider)] as const),
    )
      .then((entries) => {
        if (current) {
          setStored(new Map(entries))
          setDraft(new Map(entries))
        }
      })
      .catch((error: unknown) => {
        if (current) {
          report(errorMessage(error))
        }
      })
    return () => {
      current = false
    }
  }, [api, report])

  const keep = (provider: ProviderId, pair: ModelPair): void => {
    setStored((current) => new Map(current).set(provider, pair))
    setDraft((current) => new Map(current).set(provider, pair))
  }

  return (
    <section aria-label="model ids">
      <p>model ids</p>
      {PROVIDERS.map((provider) => {
        const pair = draft.get(provider)
        if (pair === undefined) {
          return null
        }
        const commit = (): void => {
          const before = stored.get(provider)
          if (
            before !== undefined &&
            before.cheap === pair.cheap &&
            before.strong === pair.strong
          ) {
            return
          }
          act(async () => {
            try {
              keep(provider, await api.setModels(provider, pair))
            } catch (error) {
              if (before !== undefined) {
                keep(provider, before)
              }
              throw error
            }
          })
        }
        return (
          <div key={provider}>
            <label>
              <span>{`${provider} cheap`}</span>
              <input
                aria-label={`${provider} cheap model`}
                value={pair.cheap}
                onChange={(event) => {
                  setDraft((current) =>
                    new Map(current).set(provider, { ...pair, cheap: event.target.value }),
                  )
                }}
                onBlur={commit}
              />
            </label>
            <label>
              <span>{`${provider} strong`}</span>
              <input
                aria-label={`${provider} strong model`}
                value={pair.strong}
                onChange={(event) => {
                  setDraft((current) =>
                    new Map(current).set(provider, { ...pair, strong: event.target.value }),
                  )
                }}
                onBlur={commit}
              />
            </label>
            <button
              type="button"
              aria-label={`Reset ${provider} models`}
              onClick={() => {
                act(async () => {
                  keep(provider, await api.resetModels(provider))
                })
              }}
            >
              Reset to defaults
            </button>
          </div>
        )
      })}
    </section>
  )
}
