import { describe, expect, it } from "vitest"
import {
  acceptLine,
  addActivity,
  applyAiLines,
  applyRetranslation,
  editLine,
  isFinished,
  untranslatedIndexes,
} from "../../src/core/session/lines"
import type { SessionLine, WorkSession } from "../../src/core/session/types"
import { makeSession } from "./fixture"

function withLine(session: WorkSession, index: number, patch: Partial<SessionLine>): WorkSession {
  return {
    ...session,
    lines: session.lines.map((line) => (line.index === index ? { ...line, ...patch } : line)),
  }
}

describe("session lines", () => {
  it("adds the time since the last activity, at most two minutes", () => {
    const session = { ...makeSession(), updatedAt: "2026-10-17T10:00:00.000Z", activeMs: 500 }
    const at = Date.parse("2026-10-17T10:00:30.000Z")
    expect(addActivity(session, at).activeMs).toBe(30_500)
    expect(addActivity(session, at + 600_000).activeMs).toBe(120_500)
    expect(addActivity(session, at - 60_000).activeMs).toBe(500)
  })

  it("editing makes a line manual, resolves its flag and records the correction", () => {
    const flagged = withLine(makeSession(), 0, {
      words: "Droga!",
      origin: "ai",
      flag: "forma brasileira",
      aiDraft: "Droga!",
    })
    const edited = editLine(flagged, 0, "Raios!")
    expect(edited.lines[0]).toMatchObject({
      words: "Raios!",
      origin: "manual",
      flag: null,
      resolution: "edited",
    })
    expect(edited.edits).toEqual([{ index: 0, en: "Damn it!", draft: "Droga!", final: "Raios!" }])
    const again = editLine(edited, 0, "Caramba!")
    expect(again.edits).toEqual([{ index: 0, en: "Damn it!", draft: "Droga!", final: "Caramba!" }])
  })

  it("clearing a line makes it untranslated", () => {
    const done = editLine(makeSession(), 1, "Olá.")
    const cleared = editLine(done, 1, "   ")
    expect(cleared.lines[1]).toMatchObject({ words: null, origin: null, flag: null })
    expect(untranslatedIndexes(cleared)).toEqual([0, 1, 2])
  })

  it("accepting clears the flag", () => {
    const flagged = withLine(makeSession(), 0, { words: "x", origin: "ai", flag: "dúvida" })
    expect(acceptLine(flagged, 0).lines[0]).toMatchObject({ flag: null, resolution: "accepted" })
  })

  it("AI results never overwrite a manual or already translated line", () => {
    const manual = editLine(makeSession(), 1, "Olá")
    const next = applyAiLines(manual, [
      { index: 1, words: "Oi", flag: null, strong: false },
      { index: 2, words: "Adeus", flag: null, strong: true },
    ])
    expect(next.lines[1]).toMatchObject({ words: "Olá", origin: "manual" })
    expect(next.lines[2]).toMatchObject({ words: "Adeus", origin: "ai", strong: true })
    const again = applyAiLines(next, [{ index: 2, words: "Tchau", flag: null, strong: false }])
    expect(again.lines[2]?.words).toBe("Adeus")
  })

  it("asking again resolves a flag when the new text is clean", () => {
    const flagged = withLine(makeSession(), 0, {
      words: "Droga!",
      origin: "manual",
      flag: "forma brasileira",
    })
    const next = applyRetranslation(flagged, {
      index: 0,
      words: "Raios!",
      flag: null,
      strong: true,
    })
    expect(next.lines[0]).toMatchObject({
      words: "Raios!",
      origin: "ai",
      flag: null,
      resolution: "retranslated",
      retranslated: 1,
    })
  })

  it("a session is finished once exported with everything translated and no open flags, unless overridden", () => {
    let session = makeSession()
    for (const index of [0, 1, 2]) session = editLine(session, index, "x")
    expect(isFinished(session)).toBe(false)
    const exported = { ...session, exportedAt: "2026-10-17T11:00:00.000Z" }
    expect(isFinished(exported)).toBe(true)
    expect(isFinished(withLine(exported, 0, { flag: "dúvida" }))).toBe(false)
    expect(isFinished({ ...exported, finishedOverride: false })).toBe(false)
    expect(isFinished({ ...makeSession(), finishedOverride: true })).toBe(true)
  })
})
