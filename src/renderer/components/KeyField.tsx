import { useState } from "react"
import type { ProviderId } from "../../shared/api"
import { useAction } from "../action"
import { useApi } from "../api"

export function KeyField(props: { provider: ProviderId; onSaved: () => void }): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const [key, setKey] = useState("")
  const label = `${props.provider} key`
  return (
    <div className="field">
      <span>{label}</span>
      <div className="picked">
        <input
          type="password"
          aria-label={label}
          value={key}
          onChange={(event) => {
            setKey(event.target.value)
          }}
        />
        <button
          type="button"
          className="action"
          disabled={key.trim() === ""}
          onClick={() => {
            act(async () => {
              await api.setKey(props.provider, key.trim())
              setKey("")
              props.onSaved()
            })
          }}
        >
          Save key
        </button>
      </div>
    </div>
  )
}
