import { describe, expect, it } from "vitest"
import { exampleText } from "../../src/core/library/example"

const SCRIPT = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,Frieren,0,0,0,,{\\i1}Hello.{\\i0}
Dialogue: 0,0:00:04.00,0:00:05.00,Signs,,0,0,0,,Shop
`

describe("example text", () => {
  it("keeps the visible words of the chosen styles", () => {
    expect(exampleText(SCRIPT, ["Default", "Signs"])).toBe("Hello.\nShop")
    expect(exampleText(SCRIPT, ["Default"])).toBe("Hello.")
  })

  it("is empty when no chosen style has dialogue", () => {
    expect(exampleText(SCRIPT, ["Title"])).toBe("")
  })
})
