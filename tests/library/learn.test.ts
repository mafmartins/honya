import { describe, expect, it } from "vitest"
import type { DialogueCue } from "../../src/core/ass/script"
import {
  combineGlossary,
  combineRulesExactly,
  dialogueOf,
  learnRequest,
  mergeRequest,
  pairLines,
  rankSuggestions,
  readLearned,
  readMerged,
} from "../../src/core/library/learn"

function cue(index: number, startMs: number, visible: string): DialogueCue {
  return {
    index,
    style: "Default",
    name: "",
    startMs,
    endMs: startMs + 1000,
    raw: visible,
    visible,
  }
}

const english = [
  cue(0, 1000, "Big brother!"),
  cue(1, 3000, "The Hashira are here."),
  cue(2, 9000, "Run!"),
]
const portuguese = [
  cue(0, 1040, "Mano!"),
  cue(1, 2980, "Os Pilares\\Nchegaram."),
  cue(2, 6000, "Sign text"),
]

describe("pairing lines", () => {
  it("matches lines that start within a few frames and uses each once", () => {
    expect(pairLines(english, portuguese)).toEqual([
      { en: "Big brother!", pt: "Mano!" },
      { en: "The Hashira are here.", pt: "Os Pilares chegaram." },
    ])
  })

  it("reads only the chosen dialogue styles", () => {
    const script = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Mano!
Dialogue: 0,0:00:01.00,0:00:02.00,Sign,,0,0,0,,PLACA
`
    expect(dialogueOf({ text: script, dialogueStyles: ["Default"] }).map((c) => c.visible)).toEqual(
      ["Mano!"],
    )
  })
})

describe("the learning request", () => {
  it("sends english => portuguese pairs when the english is given", () => {
    const request = learnRequest("pt-pt", portuguese, english, [])
    expect(request.pairs).toBe(2)
    expect(request.system).toContain("European Portuguese (PT-PT)")
    expect(request.system).toContain("each English line with the translator's Portuguese")
    expect(request.prompt).toBe(
      "The lines, English => Portuguese:\nBig brother! => Mano!\nThe Hashira are here. => Os Pilares chegaram.",
    )
  })

  it("asks only for certain terms from portuguese alone, and lists existing rules", () => {
    const request = learnRequest("pt-br", portuguese, null, [
      { kind: "glossary", source: "Nezuko", pt: "Nezuko" },
      { kind: "prose", text: "Keep -san." },
    ])
    expect(request.pairs).toBe(0)
    expect(request.system).toContain("Only list a term when its English form is certain")
    expect(request.prompt).toContain("Existing rules:\n- Nezuko = Nezuko\n- Keep -san.")
    expect(request.prompt).toContain("The lines:\nMano!\nOs Pilares chegaram.\nSign text")
  })
})

describe("reading what was learned", () => {
  it("keeps well-formed proposals the profile doesn't already have", () => {
    expect(
      readLearned(
        {
          glossary: [
            { source: "Hashira", pt: "Pilar" },
            { source: "nezuko", pt: "Nezuko" },
            { source: "Hashira", pt: "Hashira" },
            { source: "", pt: "x" },
            "bad",
          ],
          rules: ["Keep -san.", ' Use "mano" for Nii-san. ', 3],
        },
        [
          { kind: "glossary", source: "Nezuko", pt: "Nezuko" },
          { kind: "prose", text: "Keep -san." },
        ],
        12,
      ),
    ).toEqual({
      glossary: [{ kind: "glossary", source: "Hashira", pt: "Pilar" }],
      rules: [{ kind: "prose", text: 'Use "mano" for Nii-san.' }],
      pairs: 12,
    })
    expect(readLearned([], [], 0)).toBe("the reply is not an object")
  })
})

describe("combining episodes", () => {
  const episode = (glossary: [string, string][], rules: string[], pairs = 10) => ({
    glossary: glossary.map(([source, pt]) => ({ kind: "glossary" as const, source, pt })),
    rules: rules.map((text) => ({ kind: "prose" as const, text })),
    pairs,
  })

  it("keeps the glossary form most episodes used and lists the others", () => {
    expect(
      combineGlossary([
        episode(
          [
            ["Hashira", "Pilar"],
            ["Nichirin", "Nichirin"],
          ],
          [],
        ),
        episode([["hashira", "Pilar"]], []),
        episode([["Hashira", "Hashira"]], []),
      ]),
    ).toEqual([
      {
        rule: { kind: "glossary", source: "Hashira", pt: "Pilar" },
        episodes: 2,
        alternatives: ["Hashira"],
      },
      {
        rule: { kind: "glossary", source: "Nichirin", pt: "Nichirin" },
        episodes: 1,
        alternatives: [],
      },
    ])
  })

  it("counts identical rules once per episode", () => {
    expect(
      combineRulesExactly([episode([], ["Use tu.", "use  TU."]), episode([], ["Use tu."])]),
    ).toEqual([{ rule: { kind: "prose", text: "Use tu." }, episodes: 2, alternatives: [] }])
  })

  it("asks to merge rules episode by episode and reads the counts", () => {
    const request = mergeRequest([episode([], ["Keep -san."]), episode([], [])])
    expect(request.prompt).toBe("Episode 1:\n- Keep -san.\n\nEpisode 2:\n(no rules)")
    expect(
      readMerged(
        {
          rules: [
            { text: "Keep honorifics.", episodes: 9 },
            { text: "x", episodes: 0 },
          ],
        },
        2,
      ),
    ).toEqual([
      { rule: { kind: "prose", text: "Keep honorifics." }, episodes: 2, alternatives: [] },
      { rule: { kind: "prose", text: "x" }, episodes: 1, alternatives: [] },
    ])
  })

  it("ranks by support, glossary first when tied", () => {
    const ranked = rankSuggestions([
      { rule: { kind: "prose", text: "a" }, episodes: 2, alternatives: [] },
      { rule: { kind: "glossary", source: "b", pt: "b" }, episodes: 2, alternatives: [] },
      { rule: { kind: "prose", text: "c" }, episodes: 3, alternatives: [] },
    ])
    expect(ranked.map((s) => (s.rule.kind === "prose" ? s.rule.text : s.rule.source))).toEqual([
      "c",
      "b",
      "a",
    ])
  })
})
