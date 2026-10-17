import { describe, expect, it } from "vitest"
import type { DialogueCue } from "../../src/core/ass/script"
import {
  batchPrompt,
  briefPrompt,
  briefSystem,
  charBudget,
  escalationPrompt,
  translatorSystem,
  voiceSample,
} from "../../src/core/pipeline/prompts"

function cue(index: number, visible: string, name = "Tanjiro", seconds = 2): DialogueCue {
  return { index, style: "Default", name, startMs: 0, endMs: seconds * 1000, raw: visible, visible }
}

const card = {
  variant: "pt-pt" as const,
  seriesId: "s",
  revision: 1,
  cpsLimit: 17,
  voice: "",
  rules: [],
}

describe("translator instructions", () => {
  it("name the target variant and its conventions", () => {
    const pt = translatorSystem(card, "")
    expect(pt).toContain("into European Portuguese (PT-PT")
    expect(pt).toContain('"estar a" + infinitive')
    expect(pt).not.toContain("About this episode")
    const br = translatorSystem({ ...card, variant: "pt-br" }, "")
    expect(br).toContain("into Brazilian Portuguese (PT-BR)")
    expect(br).toContain("The gerund")
  })

  it("put the translator's rules first and show the variant's short-line forms", () => {
    const pt = translatorSystem({ ...card, rules: [{ kind: "prose", text: "Keep -san." }] }, "")
    expect(pt.indexOf("The translator's rules")).toBeLessThan(pt.indexOf("Write natural"))
    expect(pt).toContain("Damn it! => Raios!")
    expect(translatorSystem({ ...card, variant: "pt-br" }, "")).toContain("Damn it! => Droga!")
  })

  it("explain the marks the reply may use", () => {
    const system = translatorSystem(card, "")
    for (const mark of ["- clean:", "- mild:", "- hard-call:", "- doubt:"]) {
      expect(system).toContain(mark)
    }
  })

  it("carry house rules, a voice sample and the brief", () => {
    const system = translatorSystem(
      {
        ...card,
        voice: "Bora lá.\nNem pensar.",
        rules: [
          { kind: "prose", text: "Keep honorifics." },
          { kind: "glossary", source: "Hashira", pt: "Pilar" },
        ],
      },
      "Tanjiro protege a irmã.",
    )
    expect(system).toContain("- Keep honorifics.\n- Hashira = Pilar")
    expect(system).toContain("to match their voice:\nBora lá.\nNem pensar.")
    expect(system).toContain("About this episode:\nTanjiro protege a irmã.")
  })
})

describe("batch prompt", () => {
  it("lists the glossary, context and lines with speaker and character budget", () => {
    const prompt = batchPrompt(
      [cue(4, "Nezuko, don't die!"), cue(5, "Hold on.", "")],
      [{ source: "Nezuko", pt: "Nezuko" }],
      [{ english: "How?", pt: "Como?" }],
      17,
    )
    expect(prompt).toBe(
      [
        "Glossary (use these forms):\nNezuko = Nezuko",
        "The lines just before, already translated (context only):\nHow? => Como?",
        "Translate these lines. Each is [id] (speaker, budget) English:\n[4] (Tanjiro, 34) Nezuko, don't die!\n[5] (?, 34) Hold on.",
      ].join("\n\n"),
    )
  })

  it("leaves out empty sections", () => {
    expect(batchPrompt([cue(0, "Hi.")], [], [], 17)).toBe(
      "Translate these lines. Each is [id] (speaker, budget) English:\n[0] (Tanjiro, 34) Hi.",
    )
  })
})

describe("escalation prompt", () => {
  it("shows the scene with drafts and asks only for the flagged lines", () => {
    const batch = [cue(0, "How?"), cue(1, "Break a leg.")]
    const prompt = escalationPrompt(
      batch,
      new Map([
        ["0", "Como?"],
        ["1", "Parte uma perna."],
      ]),
      [{ cue: cue(1, "Break a leg."), why: "a judgement call (expressão idiomática)" }],
      [],
      17,
    )
    expect(prompt).toContain(
      "[0] (Tanjiro, 34) How? => Como?\n[1] (Tanjiro, 34) Break a leg. => Parte uma perna.",
    )
    expect(prompt.split("\n\n").at(-1)).toBe(
      "Give your own translation of only these lines, fixing what the first pass got wrong:\n[1] a judgement call (expressão idiomática)",
    )
  })
})

describe("brief", () => {
  it("asks for frames only when they are wanted", () => {
    expect(briefSystem("pt-pt", true)).toContain("At most one line in ten")
    expect(briefSystem("pt-pt", false)).toContain("frames: [].")
  })

  it("lists every line with its speaker on one line", () => {
    expect(briefPrompt([cue(0, "How?\\NWhy?"), cue(1, "Hm.", "")])).toBe(
      "The episode, each line as [id] (speaker) English:\n[0] (Tanjiro) How? Why?\n[1] Hm.",
    )
  })
})

describe("helpers", () => {
  it("budgets characters from the cue's time on screen", () => {
    expect(charBudget(cue(0, "x", "", 1.5), 17)).toBe(25)
    expect(charBudget({ ...cue(0, "x"), endMs: 0 }, 17)).toBe(6)
  })

  it("samples a long voice evenly and keeps a short one whole", () => {
    expect(voiceSample("a\n\nb")).toBe("a\nb")
    const long = Array.from({ length: 400 }, (_, i) => `l${String(i)}`).join("\n")
    const sample = voiceSample(long).split("\n")
    expect(sample).toHaveLength(40)
    expect(sample[0]).toBe("l0")
    expect(sample[1]).toBe("l10")
  })
})
