import { costOf, type Cost } from "../providers/prices"
import type { WorkSession } from "./types"

export interface SessionStats {
  lines: { ai: number; manual: number; untranslated: number; total: number }
  flags: { open: number; accepted: number; edited: number; retranslated: number }
  strongLines: number
  retranslatedLines: number
  cost: Cost
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
    activeMs: session.activeMs,
    framesGrabbed: session.framesGrabbed,
  }
}
