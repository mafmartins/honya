import { describe, expect, it } from "vitest"
import type { CompletionRequest } from "../../src/core/pipeline/run"
import { createLearner } from "../../src/main/learn"

const PT = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Mano!
`
const EN = PT.replace("Mano!", "Big brother!")
const EN_ELSEWHERE = EN.replace("0:00:01.00,0:00:02.00", "0:05:01.00,0:05:02.00")

function learner(
  reply: unknown,
  requests: CompletionRequest[] = [],
): ReturnType<typeof createLearner> {
  return createLearner({
    knownRules: () => [{ kind: "prose", text: "Keep -san." }],
    completerFor: () => (request) => {
      requests.push(request)
      return Promise.resolve(reply === null ? { refused: true, reason: "busy" } : { value: reply })
    },
  })
}

const script = (text: string): { text: string; dialogueStyles: string[] } => ({
  text,
  dialogueStyles: ["Default"],
})

describe("learning from a translated episode", () => {
  it("asks the strong model once and returns the proposals", async () => {
    const requests: CompletionRequest[] = []
    const learned = await learner(
      { glossary: [{ source: "Big brother", pt: "Mano" }], rules: ["Keep -san.", "Use tu."] },
      requests,
    ).learn("pt-pt", "s", "gemini", script(PT), script(EN))
    expect(requests.map((r) => [r.tier, r.schema.name])).toEqual([["strong", "learned_style"]])
    expect(requests[0]?.prompt).toContain("Big brother! => Mano!")
    expect(learned).toEqual({
      glossary: [{ kind: "glossary", source: "Big brother", pt: "Mano" }],
      rules: [{ kind: "prose", text: "Use tu." }],
      pairs: 1,
    })
  })

  it("explains scripts that can't be used", async () => {
    const ok = learner({ glossary: [], rules: [] })
    await expect(
      ok.learn("pt-pt", "s", "gemini", { text: PT, dialogueStyles: ["Sign"] }, null),
    ).rejects.toThrow("None of the chosen styles has dialogue in the translated script.")
    await expect(
      ok.learn("pt-pt", "s", "gemini", script(PT), script(EN_ELSEWHERE)),
    ).rejects.toThrow("no lines at the same times")
    await expect(learner(null).learn("pt-pt", "s", "gemini", script(PT), null)).rejects.toThrow(
      "The model's reply couldn't be used (busy). Try again.",
    )
  })

  it("combines episodes, merging rules with one cheap request", async () => {
    const requests: CompletionRequest[] = []
    const combined = await learner(
      { rules: [{ text: "Keep honorifics like -san.", episodes: 2 }] },
      requests,
    ).combine("gemini", [
      {
        glossary: [{ kind: "glossary", source: "Hashira", pt: "Pilar" }],
        rules: [{ kind: "prose", text: "Keep -san." }],
        pairs: 5,
      },
      { glossary: [], rules: [{ kind: "prose", text: "Keep honorifics." }], pairs: 7 },
    ])
    expect(requests.map((r) => [r.tier, r.schema.name])).toEqual([["cheap", "merged_rules"]])
    expect(combined).toEqual({
      suggestions: [
        {
          rule: { kind: "prose", text: "Keep honorifics like -san." },
          episodes: 2,
          alternatives: [],
        },
        {
          rule: { kind: "glossary", source: "Hashira", pt: "Pilar" },
          episodes: 1,
          alternatives: [],
        },
      ],
      episodes: 2,
      pairs: 12,
    })
  })

  it("falls back to merging identical rules when the merge request fails", async () => {
    const requests: CompletionRequest[] = []
    const combined = await learner(null, requests).combine("gemini", [
      {
        glossary: [],
        rules: [
          { kind: "prose", text: "Use tu." },
          { kind: "prose", text: "Keep -san." },
        ],
        pairs: 0,
      },
      { glossary: [], rules: [{ kind: "prose", text: "Use tu." }], pairs: 0 },
    ])
    expect(combined.suggestions.map((s) => s.episodes)).toEqual([2, 1])
  })

  it("needs no model call for a single episode", async () => {
    const requests: CompletionRequest[] = []
    await learner({}, requests).combine("gemini", [
      {
        glossary: [],
        rules: [
          { kind: "prose", text: "a" },
          { kind: "prose", text: "b" },
        ],
        pairs: 0,
      },
    ])
    expect(requests).toEqual([])
  })
})
