import { describe, expect, it } from "vitest"
import { charactersPerSecond, exceedsLimit, DEFAULT_CPS_LIMIT } from "../../src/core/ass/fit"
import { appendNote } from "../../src/core/ass/notes"

describe("fit and notes", () => {
  it("marks a line over 17 characters per second", () => {
    expect(DEFAULT_CPS_LIMIT).toBe(17)
    const cps = charactersPerSecond("a".repeat(35), 0, 1000)
    expect(cps).toBe(35)
    expect(exceedsLimit(cps, DEFAULT_CPS_LIMIT)).toBe(true)
  })

  it("does not count tags or newline codes as visible characters", () => {
    expect(charactersPerSecond("ab\\Ncd", 0, 1000)).toBe(4)
  })

  it("appends a note outside the words", () => {
    expect(appendNote("Olá.", "linha longa para o cue")).toBe("Olá. {note: linha longa para o cue}")
  })
})
