import { describe, expect, it } from "vitest"
import { logEntry } from "../../src/main/providerLog"

const PROMPT = "Translate.\n0: How?\n1: How did this happen?"
const base = {
  time: "2026-10-16T17:00:00.000Z",
  provider: "gemini" as const,
  model: "gemini-3.8-flash",
  tier: "cheap" as const,
  prompt: PROMPT,
}

describe("provider log", () => {
  it("records why a reply was unusable, with the start of the reply", () => {
    const entry = logEntry({
      ...base,
      reply: { refused: true, reason: "line 2 is not valid: {}", excerpt: '{"lines":[]}' },
    })
    expect(entry === null ? null : JSON.parse(entry)).toEqual({
      time: base.time,
      provider: "gemini",
      model: "gemini-3.8-flash",
      tier: "cheap",
      problem: "line 2 is not valid: {}",
      excerpt: '{"lines":[]}',
    })
  })

  it("records a reply whose line ids don't match the request", () => {
    const entry = logEntry({
      ...base,
      reply: { lines: [{ id: "0", words: "Como?", mark: "clean" }] },
    })
    expect(entry === null ? null : JSON.parse(entry)).toMatchObject({
      problem: "asked for lines 0, 1 but got 0",
    })
  })

  it("stays quiet about good replies and about the episode brief", () => {
    expect(
      logEntry({
        ...base,
        reply: {
          lines: [
            { id: "0", words: "Como?", mark: "clean" },
            { id: "1", words: "Como é que isto aconteceu?", mark: "clean" },
          ],
        },
      }),
    ).toBeNull()
    expect(
      logEntry({
        ...base,
        prompt: `${PROMPT}\n{ "glossary": [{ "source", "pt" }], "hardIds": string[], "frameIds": string[] }`,
        reply: { lines: [{ id: "brief", words: "x", mark: "clean" }] },
      }),
    ).toBeNull()
  })
})
