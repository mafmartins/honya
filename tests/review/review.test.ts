import { describe, expect, it } from "vitest"
import {
  acceptFlag,
  applyLineEdit,
  applyProposal,
  canExport,
  openFlags,
  proposeStructural,
} from "../../src/core/review/review"

function at<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`missing item ${String(index)}`)
  }
  return item
}

const lines = [
  { eventIndex: 0, words: "Olá. {note: dúvida}", note: "dúvida", english: "Hello." },
  { eventIndex: 1, words: "Himmel.", note: null, english: "Himmel." },
]

describe("review", () => {
  it("blocks export until the flag is accepted and keeps the note", () => {
    const flags = openFlags(lines)
    expect(canExport(flags)).toBe(false)
    const accepted = acceptFlag(flags, 0)
    expect(canExport(accepted)).toBe(true)
    expect(at(lines, 0).words).toContain("{note: dúvida}")
  })

  it("keeps the edited line when the rule is declined", () => {
    const edited = applyLineEdit(lines, 1, "Himmel ficou.")
    const next = applyProposal(edited, {
      siblings: [{ eventIndex: 0, words: "Olá, Himmel." }],
      rule: { kind: "glossary", source: "Himmel", pt: "Himmel" },
    }, "decline-rule")
    expect(at(next.lines, 1).words).toBe("Himmel ficou.")
    expect(at(next.lines, 0).words).toBe("Olá. {note: dúvida}")
    expect(next.rule).toBeNull()
  })

  it("applies sibling words and returns a rule without changing lines", () => {
    const proposal = {
      siblings: [{ eventIndex: 0, words: "Olá, Himmel." }],
      rule: { kind: "glossary" as const, source: "Himmel", pt: "Himmel" },
    }
    const withSiblings = applyProposal(lines, proposal, "siblings")
    expect(at(withSiblings.lines, 0).words).toBe("Olá, Himmel.")
    expect(at(withSiblings.lines, 1).words).toBe("Himmel.")
    expect(withSiblings.rule).toEqual(proposal.rule)

    const ruled = applyProposal(lines, proposal, "rule")
    expect(at(ruled.lines, 0).words).toBe("Olá. {note: dúvida}")
    expect(at(ruled.lines, 1).words).toBe("Himmel.")
    expect(ruled.rule).toEqual(proposal.rule)
  })

  it("parses a structural proposal from the reply text", async () => {
    let prompt = ""
    const proposal = await proposeStructural(
      { eventIndex: 1, before: "Himmel.", after: "Himmel ficou." },
      lines,
      (asked) => {
        prompt = asked
        return Promise.resolve({
          text: JSON.stringify({
            structural: true,
            siblings: [{ eventIndex: 0, words: "Olá, Himmel." }],
            rule: { kind: "prose", text: "Keep Himmel." },
          }),
        })
      },
    )
    expect(prompt).toContain(
      '{ "structural": boolean, "siblings": [{ "eventIndex", "words" }], "rule": null | { "kind": "prose", "text" } | { "kind": "glossary", "source", "pt" } }',
    )
    expect(proposal).toEqual({
      siblings: [{ eventIndex: 0, words: "Olá, Himmel." }],
      rule: { kind: "prose", text: "Keep Himmel." },
    })
  })

  it("returns an empty proposal when the edit is not structural", async () => {
    const proposal = await proposeStructural(
      { eventIndex: 1, before: "Himmel.", after: "Himmel ficou." },
      lines,
      () =>
        Promise.resolve({
          text: JSON.stringify({
            structural: false,
            siblings: [{ eventIndex: 0, words: "Olá, Himmel." }],
            rule: { kind: "glossary", source: "Himmel", pt: "Himmel" },
          }),
        }),
    )
    expect(proposal).toEqual({ siblings: [], rule: null })
  })

  it("returns null when the structural check is refused, invalid, or throws", async () => {
    const edit = { eventIndex: 1, before: "Himmel.", after: "Himmel ficou." }
    await expect(proposeStructural(edit, lines, () => Promise.resolve({ refused: true }))).resolves.toBeNull()
    await expect(proposeStructural(edit, lines, () => Promise.resolve({ text: "not json" }))).resolves.toBeNull()
    await expect(
      proposeStructural(edit, lines, () => {
        throw new Error("offline")
      }),
    ).resolves.toBeNull()
  })
})
