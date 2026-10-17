import { describe, expect, it } from "vitest"
import {
  addCorrections,
  compileCard,
  emptyBase,
  importExample,
  projectFrames,
  projectPreset,
  saveRule,
} from "../../src/core/library/card"
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

describe("corrections", () => {
  const series = { id: "s", variant: "pt-pt" as const, name: "S", rules: [] }

  it("keeps real changes, newest last, replacing an older correction of the same line", () => {
    const once = addCorrections(series, [
      { en: "Damn!", draft: "Droga!", final: "Raios!" },
      { en: "Hi.", draft: "Olá.", final: "Olá." },
    ])
    const twice = addCorrections(once, [{ en: "Damn!", draft: "Raios!", final: "Bolas!" }])
    expect(twice.corrections).toEqual([{ en: "Damn!", draft: "Raios!", final: "Bolas!" }])
    expect(addCorrections(series, [])).toBe(series)
  })

  it("keeps the last sixty and gives the card the last twenty", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({
      en: `line ${String(i)}`,
      draft: "a",
      final: "b",
    }))
    const kept = addCorrections(series, many)
    expect(kept.corrections).toHaveLength(60)
    const card = compileCard(emptyBase("pt-pt"), kept)
    expect(card.corrections).toHaveLength(20)
    expect(card.corrections?.at(-1)?.en).toBe("line 69")
    expect(compileCard(emptyBase("pt-pt"), series)).not.toHaveProperty("corrections")
  })

  it("a project's glossary entry wins over the style's for the same term", () => {
    const base = {
      ...emptyBase("pt-pt"),
      rules: [
        { kind: "glossary" as const, source: "Hashira", pt: "Hashira" },
        { kind: "prose" as const, text: "Use tu." },
      ],
    }
    const series = {
      id: "s",
      variant: "pt-pt" as const,
      name: "S",
      rules: [{ kind: "glossary" as const, source: "hashira", pt: "Pilar" }],
    }
    expect(compileCard(base, series).rules).toEqual([
      { kind: "prose", text: "Use tu." },
      { kind: "glossary", source: "hashira", pt: "Pilar" },
    ])
  })

  it("a project's characters per second overrides the style's", () => {
    const base = { ...emptyBase("pt-pt"), cpsLimit: 17 }
    const series = { id: "s", variant: "pt-pt" as const, name: "S", rules: [] }
    expect(compileCard(base, { ...series, cpsLimit: 20 }).cpsLimit).toBe(20)
    expect(compileCard(base, series).cpsLimit).toBe(17)
  })

  it("falls back to the style's preset and frames when the project sets none", () => {
    const series = { id: "s", variant: "pt-pt" as const, name: "S", rules: [] }
    expect(projectPreset(series, "balanced")).toBe("balanced")
    expect(projectPreset({ ...series, preset: "best" }, "balanced")).toBe("best")
    expect(projectFrames(series, "none")).toBe("none")
    expect(projectFrames({ ...series, frameSetting: "every" }, "none")).toBe("every")
  })

  it("keeps project settings when a rule is saved", () => {
    const series = { id: "s", variant: "pt-pt" as const, name: "S", rules: [], cpsLimit: 20 }
    const saved = saveRule(emptyBase("pt-pt"), series, { kind: "prose", text: "Use tu." }, "series")
    expect(saved.series.cpsLimit).toBe(20)
  })
})
