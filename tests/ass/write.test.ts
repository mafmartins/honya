import { describe, expect, it } from "vitest"
import { applyTranslations } from "../../src/core/ass/write"

const FIXTURE = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,Frieren,0,0,0,,{\\i1}Hello.{\\i0}
Dialogue: 0,0:00:04.00,0:00:05.00,Signs,,0,0,0,,Shop
Dialogue: 0,0:00:06.00,0:00:07.00,Default,,0,0,0,,{\\broken
`

describe("applyTranslations", () => {
  it("translates dialogue, copies signs, and reports an unsafe line", () => {
    const { text, report } = applyTranslations(
      FIXTURE,
      new Set(["Default"]),
      new Map([[0, "Olá."]]),
    )
    expect(text).toContain("{\\i1}Olá.{\\i0}")
    expect(text).toContain("Shop")
    expect(text).toContain("{\\broken")
    expect(text).toContain("ScriptType: v4.00+")
    expect(report).toEqual(["event 2: tags could not be split"])
  })

  it("leaves a line untouched when translation changes line breaks", () => {
    const fixture = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello.\\NThere.
`
    const { text, report } = applyTranslations(
      fixture,
      new Set(["Default"]),
      new Map([[0, "Olá, tudo bem por aí?"]]),
    )
    expect(text).toContain(",,Olá, tudo\\Nbem por aí?")
    expect(report).toEqual([])
  })
})
