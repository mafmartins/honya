import { useCallback, useEffect, useState } from "react"
import { PROVIDERS, type ProviderId } from "../../shared/api"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"
import { KeyField } from "./KeyField"

export function KeysSection(): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [saved, setSaved] = useState<Map<ProviderId, boolean>>(new Map())
  const [replacing, setReplacing] = useState<ProviderId | null>(null)

  const load = useCallback(
    async () =>
      new Map(
        await Promise.all(
          PROVIDERS.map(async (provider) => [provider, await api.hasKey(provider)] as const),
        ),
      ),
    [api],
  )

  const refresh = useCallback(async () => {
    setSaved(await load())
  }, [load])

  useEffect(() => {
    let current = true
    load().then(
      (entries) => {
        if (current) {
          setSaved(entries)
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
  }, [load, report])

  return (
    <section aria-label="provider keys">
      <p>provider keys</p>
      <ul>
        {PROVIDERS.map((provider) => (
          <li key={provider}>
            <span>{`${provider}: ${saved.get(provider) === true ? "saved" : "missing"}`}</span>{" "}
            {replacing === provider ? (
              <KeyField
                provider={provider}
                onSaved={() => {
                  setReplacing(null)
                  act(refresh)
                }}
              />
            ) : (
              <button
                type="button"
                aria-label={`Replace ${provider} key`}
                onClick={() => {
                  setReplacing(provider)
                }}
              >
                Replace
              </button>
            )}
            {saved.get(provider) === true ? (
              <button
                type="button"
                aria-label={`Remove ${provider} key`}
                onClick={() => {
                  act(async () => {
                    await api.removeKey(provider)
                    await refresh()
                  })
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
