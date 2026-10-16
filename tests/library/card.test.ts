import { describe, expect, it } from "vitest"
import { compileCard, emptyBase, importExample, saveRule } from "../../src/core/library/card"
import { createMemoryStore } from "../../src/core/library/store"

describe("style card", () => {
  it("keeps variants apart and recompiles after a series rule", () => {
    const pt = importExample(emptyBase("pt-pt"), "ep01.ass", "Olá.")
    const br = emptyBase("pt-br")
    const series = { id: "frieren", variant: "pt-pt" as const, name: "Frieren", rules: [] }
    const saved = saveRule(
      pt,
      series,
      { kind: "glossary", source: "Himmel", pt: "Himmel" },
      "series",
    )
    const card = compileCard(saved.base, saved.series)
    const other = compileCard(br, { ...series, variant: "pt-br", rules: [] })
    expect(card.rules).toEqual([{ kind: "glossary", source: "Himmel", pt: "Himmel" }])
    expect(other.rules).toEqual([])
    expect(card.voice).toContain("Olá.")
    expect(saved.base.cardRevision).toBe(pt.cardRevision + 1)
  })

  it("keeps each example's name and joins their text into the voice", () => {
    const base = importExample(
      importExample(emptyBase("pt-pt"), "ep01.ass", "Olá."),
      "ep02.ass",
      "Adeus.",
    )
    expect(base.examples).toEqual([
      { name: "ep01.ass", text: "Olá." },
      { name: "ep02.ass", text: "Adeus." },
    ])
    const card = compileCard(base, { id: "s", variant: "pt-pt", name: "S", rules: [] })
    expect(card.voice).toBe("Olá.\nAdeus.")
  })

  it("compiles an empty profile", () => {
    const card = compileCard(emptyBase("pt-pt"), {
      id: "new",
      variant: "pt-pt",
      name: "New",
      rules: [],
    })
    expect(card.voice).toBe("")
    expect(card.cpsLimit).toBe(17)
  })

  it("does not write secrets into the card", () => {
    const store = createMemoryStore()
    store.saveBase(emptyBase("pt-pt"))
    expect(JSON.stringify(store.loadCard("pt-pt", "missing"))).not.toContain("sk-")
  })
})
