import { describe, expect, it } from "vitest"
import { readAss } from "../../src/core/ass/script"

const FIXTURE = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,Frieren,0,0,0,,{\\i1}Hello.{\\i0}
Dialogue: 0,0:00:04.00,0:00:05.00,Signs,,0,0,0,,Shop
`

describe("readAss", () => {
  it("reads timing, style, and the original text from ass-compiler", () => {
    const cues = readAss(FIXTURE)
    expect(cues.map((c) => c.style)).toEqual(["Default", "Signs"])
    const cue = cues[0]
    if (cue === undefined) {
      throw new Error("missing cue")
    }
    expect(cue.startMs).toBe(1000)
    expect(cue.endMs).toBe(3000)
    expect(cue.name).toBe("Frieren")
    expect(cue.raw).toBe("{\\i1}Hello.{\\i0}")
    expect(cue.visible).toBe("Hello.")
  })
})
