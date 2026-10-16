import { useEffect, useState } from "react"
import type { BaseProfile, PickedExample, Variant } from "../../shared/api"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"
import { RuleEditor } from "./RuleEditor"
import { RuleList } from "./RuleList"
import { StyleChecklist } from "./StyleChecklist"

export function BaseSection({ variant }: { variant: Variant }): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [base, setBase] = useState<BaseProfile | null>(null)
  const [cps, setCps] = useState("")
  const [example, setExample] = useState<PickedExample | null>(null)

  useEffect(() => {
    let current = true
    api.loadBase(variant).then(
      (loaded) => {
        if (!current) {
          return
        }
        setBase(loaded.base)
        setCps(String(loaded.base.cpsLimit))
        if (loaded.problems.length > 0) {
          report(loaded.problems.join(" "))
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
  }, [api, variant, report])

  if (base === null) {
    return <section aria-label="base profile" />
  }

  const save = (next: BaseProfile): void => {
    act(async () => {
      try {
        const saved = await api.saveBase(next)
        setBase(saved)
        setCps(String(saved.cpsLimit))
      } catch (error) {
        setCps(String(base.cpsLimit))
        throw error
      }
    })
  }

  return (
    <section aria-label="base profile">
      <p>{`base · ${variant}`}</p>
      <label>
        <span>characters per second</span>
        <input
          type="number"
          aria-label="characters per second"
          value={cps}
          onChange={(event) => {
            setCps(event.target.value)
          }}
          onBlur={() => {
            if (cps !== String(base.cpsLimit)) {
              save({ ...base, cpsLimit: Number(cps) })
            }
          }}
        />
      </label>
      <p>rules</p>
      <RuleList
        rules={base.rules}
        onDelete={(index) => {
          save({ ...base, rules: base.rules.filter((_, at) => at !== index) })
        }}
      />
      <RuleEditor
        onAdd={(rule) => {
          save({ ...base, rules: [...base.rules, rule] })
        }}
      />
      <p>example scripts</p>
      <ul className="examples">
        {base.examples.map((item, index) => (
          <li key={`${String(index)}-${item.name}`}>
            <span>{item.name}</span>{" "}
            <button
              type="button"
              aria-label={`Remove example ${item.name}`}
              onClick={() => {
                save({ ...base, examples: base.examples.filter((_, at) => at !== index) })
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {example === null ? (
        <button
          type="button"
          onClick={() => {
            act(async () => {
              setExample(await api.pickExample())
            })
          }}
        >
          Import example…
        </button>
      ) : (
        <StyleChecklist
          styles={example.styles}
          onCancel={() => {
            setExample(null)
          }}
          onConfirm={(styles) => {
            act(async () => {
              setBase(await api.importExample(variant, example.name, example.text, styles))
              setExample(null)
            })
          }}
        />
      )}
    </section>
  )
}
