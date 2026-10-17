import { costOf, type Cost } from "../providers/prices"
import type { WorkSession } from "./types"

// One model's share of the session's requests; usd is null when its price isn't known.
export interface ModelCost {
  model: string
  requests: number
  input: number
  output: number
  usd: number | null
}

export interface SessionStats {
  lines: { ai: number; manual: number; untranslated: number; total: number }
  flags: { open: number; accepted: number; edited: number; retranslated: number }
  strongLines: number
  retranslatedLines: number
  cost: Cost
  models: ModelCost[]
  activeMs: number
  framesGrabbed: number
}

export function sessionStats(session: WorkSession): SessionStats {
  const count = (test: (line: WorkSession["lines"][number]) => boolean): number =>
    session.lines.filter(test).length
  return {
    lines: {
      ai: count((line) => line.words !== null && line.origin === "ai"),
      manual: count((line) => line.words !== null && line.origin === "manual"),
      untranslated: count((line) => line.words === null),
      total: session.lines.length,
    },
    flags: {
      open: count((line) => line.flag !== null),
      accepted: count((line) => line.resolution === "accepted"),
      edited: count((line) => line.resolution === "edited"),
      retranslated: count((line) => line.resolution === "retranslated"),
    },
    strongLines: count((line) => line.strong),
    retranslatedLines: count((line) => line.retranslated > 0),
    cost: costOf(session.spend),
    models: session.spend.map((entry) => ({
      model: entry.model,
      requests: entry.requests,
      input: entry.input,
      output: entry.output,
      usd: costOf([entry]).usd,
    })),
    activeMs: session.activeMs,
    framesGrabbed: session.framesGrabbed,
  }
}
