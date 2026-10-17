import { describe, expect, it } from "vitest"
import type { DialogueCue } from "../../src/core/ass/script"
import { dialogueOf, learnRequest, pairLines, readLearned } from "../../src/core/library/learn"

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
