import { describe, expect, it } from "vitest"
import {
  charactersPerSecond,
  charLimit,
  exceedsLimit,
  tooLong,
  DEFAULT_CPS_LIMIT,
} from "../../src/core/ass/fit"
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

  it("allows the reading-speed budget, or about the english length when that is longer", () => {
    expect(charLimit("Hi.", 0, 2000, 17)).toBe(34)
    // "Wait, wait, wait!" is 17 characters in half a second: far over 17 per second.
    expect(charLimit("Wait, wait, wait!", 0, 500, 17)).toBe(19)
    expect(tooLong("Espera, espera, espera!", "Wait, wait, wait!", 0, 500, 17)).toBe(true)
    expect(tooLong("Espera, espera!", "Wait, wait, wait!", 0, 500, 17)).toBe(false)
    expect(tooLong("Calma, calma, já!", "Wait, wait, wait!", 0, 500, 17)).toBe(false)
  })

  it("does not count note blocks as visible characters", () => {
    expect(charactersPerSecond("Olá.{note: dúvida}", 0, 1000)).toBe(4)
  })

  it("appends a note outside the words", () => {
    expect(appendNote("Olá.", "linha longa para o cue")).toBe("Olá. {note: linha longa para o cue}")
  })
})
