import { describe, expect, it } from "vitest"
import { applyAiLines, editLine } from "../../src/core/session/lines"
import { sessionStats } from "../../src/core/session/stats"
import { costOf } from "../../src/core/providers/prices"
import { makeSession } from "./fixture"

describe("session stats", () => {
  it("counts lines, flags and cost", () => {
    const spend = [{ model: "gemini-3.8-flash", input: 1000, output: 500, cached: 0, requests: 2 }]
    let session = { ...makeSession(), spend, activeMs: 5000, framesGrabbed: 3 }
    session = applyAiLines(session, [
      { index: 0, words: "Droga!", flag: "forma brasileira", strong: true },
      { index: 1, words: "Olá.", flag: null, strong: false },
    ])
    session = editLine(session, 0, "Raios!")
    const stats = sessionStats(session)
    expect(stats.lines).toEqual({ ai: 1, manual: 1, untranslated: 1, total: 3 })
    expect(stats.flags).toEqual({ open: 0, accepted: 0, edited: 1, retranslated: 0 })
    expect(stats.strongLines).toBe(1)
    expect(stats.retranslatedLines).toBe(0)
    expect(stats.cost).toEqual(costOf(spend))
    expect(stats.cost.usd).not.toBeNull()
    expect(stats.activeMs).toBe(5000)
    expect(stats.framesGrabbed).toBe(3)
  })
})
