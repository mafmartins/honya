import { describe, expect, it } from "vitest"
import { correctionsOf, exportWords } from "../../src/core/session/exportFile"
import type { SessionLine, WorkSession } from "../../src/core/session/types"
import { makeSession } from "./fixture"

function withLine(session: WorkSession, index: number, patch: Partial<SessionLine>): WorkSession {
  return {
    ...session,
    lines: session.lines.map((line) => (line.index === index ? { ...line, ...patch } : line)),
  }
}

describe("exportWords", () => {
  it("writes an open flag as a note, an accepted line clean, and skips untranslated lines", () => {
    let session = withLine(makeSession(), 0, { words: "Raios!", origin: "ai", flag: "forma" })
    session = withLine(session, 1, { words: "Olá.", origin: "ai", flag: null })
    const words = exportWords(session)
    expect(words.get(0)).toBe("Raios! {note: forma}")
    expect(words.get(1)).toBe("Olá.")
    expect(words.has(2)).toBe(false)
  })
})

describe("correctionsOf", () => {
  it("keeps only drafted edits still standing on a manual line", () => {
    let session = withLine(makeSession(), 0, { words: "Raios!", origin: "manual" })
    session = withLine(session, 1, { words: "Outra", origin: "ai" })
    session = withLine(session, 2, { words: "Tchau.", origin: "manual" })
    session = {
      ...session,
      edits: [
        { index: 0, en: "Damn it!", draft: "Droga!", final: "Raios!" },
        { index: 1, en: "Hello.", draft: "Olá.", final: "Oi." },
        { index: 2, en: "Bye.", draft: null, final: "Tchau." },
      ],
    }
    expect(correctionsOf(session)).toEqual([{ en: "Damn it!", draft: "Droga!", final: "Raios!" }])
  })
})
