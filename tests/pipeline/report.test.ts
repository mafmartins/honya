import { describe, expect, it } from "vitest"
import { buildReport } from "../../src/core/pipeline/report"
import type { LineResult } from "../../src/core/pipeline/types"

const ass = [
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  "Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,Ok.",
  "Dialogue: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,Hello there.",
  `Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,${"abcdefghij".repeat(6)}`,
  "Dialogue: 0,0:00:06.00,0:00:08.00,Default,,0,0,0,,See you soon.",
  "",
].join("\n")

describe("buildReport", () => {
  it("summarises a finished run", () => {
    const results = new Map<string, LineResult>([
      ["0", { id: "0", words: "Ok.", mark: "clean" }],
      ["1", { id: "1", words: "Hello there.", mark: "doubt", reason: "tradução falhou" }],
      ["2", { id: "2", words: "abcdefghij".repeat(6), mark: "hard-call" }],
      ["3", { id: "3", words: "See you soon.", mark: "clean" }],
    ])
    const report = buildReport({
      ass,
      dialogueStyles: new Set(["Default"]),
      finalWords: new Map([
        [0, "Ok."],
        [1, "Hello there."],
        // Over the reading speed and longer than the English, so over the limit.
        [2, "abcdefghij".repeat(7)],
        [3, "See you soon."],
      ]),
      results,
      strongIds: ["1"],
      cpsLimit: 17,
      flagged: [0, 2],
      edited: [2, 3],
      rules: [{ target: "series" }, { target: "series" }, { target: "base" }],
      framesUsed: 2,
      frameNotes: ["event 1: frame grab failed"],
      writeReport: ["event 3: tags could not be split"],
      elapsedMs: 12345,
      spend: [
        { model: "gemini-3.8-flash", requests: 14, input: 27965, cached: 0, output: 13299 },
        { model: "my-own-model", requests: 1, input: 100, cached: 0, output: 10 },
      ],
      outputPath: "/Users/marciomartins/dev/honya/episode.pt-pt.ass",
    })
    expect(report).toEqual({
      dialogueLines: 4,
      translated: 3,
      strongModel: 1,
      leftInEnglish: 1,
      overLimit: 1,
      flags: 2,
      editedFlags: 1,
      acceptedAsIs: 1,
      rulesSaved: { series: 2, base: 1 },
      framesUsed: 2,
      frameFailures: 1,
      unchanged: 1,
      elapsedMs: 12345,
      cost: {
        usd: expect.closeTo(0.070845, 6) as number,
        unpriced: ["my-own-model"],
        input: 28065,
        output: 13309,
        requests: 15,
      },
      outputPath: "/Users/marciomartins/dev/honya/episode.pt-pt.ass",
    })
  })
})
