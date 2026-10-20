import { describe, expect, it } from "vitest"
import type { DialogueCue } from "../../src/core/ass/script"
import { alreadyPortuguese } from "../../src/core/session/detect"

function cues(texts: string[]): DialogueCue[] {
  return texts.map((visible, index) => ({
    index,
    style: "Default",
    name: "",
    startMs: index * 1000,
    endMs: index * 1000 + 900,
    raw: visible,
    visible,
  }))
}

const ids = (set: ReadonlySet<number>): number[] => [...set].sort((a, b) => a - b)

describe("finding lines already in Portuguese", () => {
  it("finds a script translated in place up to a point", () => {
    const script = cues([
      "Então, é por isso, Mickey.",
      "Para isso, preciso da Noiva, \\Ncuste o que custar!",
      "Ela?",
      "Tocas maravilhosamente, Mickey.",
      "A Mitsuko e as outras devem gostar dele.",
      "Hoje estás a tocar muito bem.",
      "Your technique's intensity isn't\\Nas overpowering as it tends to be.",
      "Mickey!",
      'What do they mean\\Nby "shining thing"?!',
    ])
    expect(ids(alreadyPortuguese(script))).toEqual([0, 1, 2, 3, 4, 5])
  })

  it("finds nothing in an English script", () => {
    const script = cues([
      "How?",
      "How did this happen?",
      "Nezuko, don't die!",
      "I swear your big brother will save you\\Nno matter what!",
    ])
    expect(ids(alreadyPortuguese(script))).toEqual([])
  })

  it("leaves a short line without clear signs untranslated when its neighbours disagree", () => {
    const script = cues([
      "Obrigada pela atuação na festa.",
      "Mickey!",
      "That's the song you always play.",
    ])
    expect(ids(alreadyPortuguese(script))).toEqual([0])
  })

  it("ignores override tags and line breaks", () => {
    const script = cues(["{\\i1}Não sei do que falam.{\\i0}", "{\\an8}I don't know what you mean."])
    expect(ids(alreadyPortuguese(script))).toEqual([0])
  })
})
