import { useEffect, useState } from "react"

// Below this, a step is quick enough that a timer would only flicker.
const SHOW_AFTER_SECONDS = 5

// The current step, with how long it has been running once it takes a while, so a slow
// provider reply never looks like a frozen screen. Give it a `key` of the text so a new
// step starts counting from zero.
export function ActivityLine({ text }: { text: string }): React.JSX.Element {
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(startedAt)
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [])
  const seconds = Math.floor((now - startedAt) / 1000)
  const elapsed =
    seconds < SHOW_AFTER_SECONDS
      ? ""
      : ` · ${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`
  return <p className="muted">{`${text}${elapsed}`}</p>
}
