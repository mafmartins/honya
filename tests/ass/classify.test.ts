import { describe, expect, it } from "vitest"
import { classifyStyle } from "../../src/core/ass/classify"

describe("classifyStyle", () => {
  it("treats known dialogue names as dialogue", () => {
    for (const name of ["Default", "Dialogue", "Main", "Alt", "Italic", "Thought", "Flashback", "Narration", "Main Dialogue"]) {
      expect(classifyStyle(name)).toBe("dialogue")
    }
  })

  it("copies signs, songs, and karaoke through", () => {
    for (const name of ["Signs", "Sign", "Song", "Songs", "Karaoke", "OP", "ED", "Title", "Opening Credits"]) {
      expect(classifyStyle(name)).toBe("skip")
    }
  })

  it("asks when the name is unknown or matches both lists", () => {
    expect(classifyStyle("Weird")).toBe("ambiguous")
    expect(classifyStyle("Dialogue Signs")).toBe("ambiguous")
  })
})
