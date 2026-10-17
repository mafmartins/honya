import { describe, expect, it } from "vitest"
import {
  draftRuleRequest,
  readDraftedRule,
  readSuggestions,
  suggestionsRequest,
} from "../../src/core/library/suggest"
import type { Rule } from "../../src/core/library/types"

const known: Rule[] = [
  { kind: "prose", text: "Keep -san." },
  { kind: "glossary", source: "Hokage", pt: "Hokage" },
]

describe("draftRuleRequest", () => {
  it("shows the line and its neighbours and names known rules", () => {
    const { system, prompt, schema } = draftRuleRequest(
      { en: "Nice to meet you.", before: "Hi.", after: "Prazer." },
      known,
    )
    expect(system).toContain("habits")
    expect(prompt).toContain("Nice to meet you.")
    expect(prompt).toContain("Hi.")
    expect(prompt).toContain("Prazer.")
    expect(prompt).toContain("Keep -san.")
    expect(schema.schema).toMatchObject({
      required: ["kind", "text", "source", "pt"],
      additionalProperties: false,
    })
  })
})

describe("readDraftedRule", () => {
  it("reads a prose rule", () => {
    expect(readDraftedRule({ kind: "prose", text: " Use tu. ", source: "", pt: "" })).toEqual({
      kind: "prose",
      text: "Use tu.",
    })
  })

  it("reads a glossary rule", () => {
    expect(readDraftedRule({ kind: "glossary", text: "", source: "Chakra", pt: "chakra" })).toEqual(
      { kind: "glossary", source: "Chakra", pt: "chakra" },
    )
  })

  it("rejects empty or malformed replies", () => {
    expect(readDraftedRule({ kind: "prose", text: " ", source: "", pt: "" })).toBeNull()
    expect(readDraftedRule({ kind: "glossary", text: "", source: "A", pt: "" })).toBeNull()
    expect(readDraftedRule({ kind: "other", text: "x", source: "", pt: "" })).toBeNull()
    expect(readDraftedRule("nope")).toBeNull()
  })
})

describe("suggestions", () => {
  const edits = [{ index: 3, en: "Hi.", draft: "Olá.", final: "Oi." }]

  it("asks about the edits", () => {
    const { prompt, schema } = suggestionsRequest(edits, known)
    expect(prompt).toContain("Hi.")
    expect(prompt).toContain("Olá.")
    expect(prompt).toContain("Oi.")
    expect(prompt).toContain("[3]")
    expect(schema.schema).toMatchObject({ required: ["suggestions"] })
  })

  it("reads both kinds and drops known rules", () => {
    const value = {
      suggestions: [
        { kind: "prose", text: "keep -san.", source: "", pt: "", lines: [1] },
        { kind: "glossary", source: "hokage", pt: "Hokage", text: "", lines: [2] },
        { kind: "glossary", source: "Chakra", pt: "chakra", text: "", lines: [3, 4.5, "x"] },
        { kind: "prose", text: "Use tu between friends.", source: "", pt: "", lines: [5] },
        { kind: "prose", text: "Use tu between friends.", source: "", pt: "", lines: [6] },
        { kind: "prose", text: "", source: "", pt: "", lines: [7] },
      ],
    }
    expect(readSuggestions(value, known)).toEqual([
      { rule: { kind: "glossary", source: "Chakra", pt: "chakra" }, lines: [3] },
      { rule: { kind: "prose", text: "Use tu between friends." }, lines: [5] },
    ])
  })

  it("keeps at most 8", () => {
    const suggestions = Array.from({ length: 12 }, (_, i) => ({
      kind: "prose",
      text: `Rule ${String(i)}`,
      source: "",
      pt: "",
      lines: [i],
    }))
    expect(readSuggestions({ suggestions }, [])).toHaveLength(8)
    expect(readSuggestions(null, [])).toEqual([])
  })
})
