import { describe, expect, it } from "vitest"
import { prepareTranslation } from "../../../src/main/translate/prepare"

const SCRIPT = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello.
Dialogue: 0,0:00:03.00,0:00:04.00,Signs,,0,0,0,,EXIT
`

describe("prepareTranslation", () => {
  it("guesses styles and proposes the output path", () => {
    const prepared = prepareTranslation("/s/subs.ass", "pt-pt", () => SCRIPT)
    expect(prepared.styles).toEqual([
      { name: "Default", guess: "dialogue" },
      { name: "Signs", guess: "skip" },
    ])
    expect(prepared.outputPath).toBe("/s/subs.pt-pt.ass")
    expect(prepared.scriptName).toBe("subs.ass")
  })
})
