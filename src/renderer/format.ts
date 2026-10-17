import type { Rule } from "../shared/api"

export function formatRule(rule: Rule): string {
  return rule.kind === "prose" ? rule.text : `${rule.source} → ${rule.pt}`
}

// A cue's start as m:ss.cc, the way subtitle editors show it.
export function formatCueTime(ms: number): string {
  const centiseconds = Math.max(0, Math.floor(ms / 10))
  const minutes = Math.floor(centiseconds / 6000)
  const seconds = Math.floor(centiseconds / 100) % 60
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${String(minutes)}:${pad(seconds)}.${pad(centiseconds % 100)}`
}

// A stored ISO time as a short date, like 17 Oct 2026.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
