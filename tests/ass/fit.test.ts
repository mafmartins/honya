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
    // 20 characters in 1.12 s is already over 17 per second; 20% more is 24, 5 more is 25.
    expect(charLimit("Thanks for the meal!", 0, 1120, 17)).toBe(25)
    expect(tooLong("Obrigado pela refeição!", "Thanks for the meal!", 0, 1120, 17)).toBe(false)
    // On a long line the 20% wins: 50 characters allow 60.
    const english = "a".repeat(50)
    expect(charLimit(english, 0, 1000, 17)).toBe(60)
    expect(tooLong("b".repeat(61), english, 0, 1000, 17)).toBe(true)
  })

  it("does not count note blocks as visible characters", () => {
    expect(charactersPerSecond("Olá.{note: dúvida}", 0, 1000)).toBe(4)
  })

  it("appends a note outside the words", () => {
    expect(appendNote("Olá.", "linha longa para o cue")).toBe("Olá. {note: linha longa para o cue}")
  })
})
