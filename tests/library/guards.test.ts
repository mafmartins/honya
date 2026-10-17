import { describe, expect, it } from "vitest"
import { emptyBase } from "../../src/core/library/card"
import {
  isRule,
  isVariant,
  readBaseProfile,
  readSeriesProfile,
} from "../../src/core/library/guards"

describe("profile guards", () => {
  it("accepts the two variants only", () => {
    expect(isVariant("pt-pt")).toBe(true)
    expect(isVariant("pt-br")).toBe(true)
    expect(isVariant("en")).toBe(false)
  })

  it("accepts prose and glossary rules only", () => {
    expect(isRule({ kind: "prose", text: "Use tu." })).toBe(true)
    expect(isRule({ kind: "glossary", source: "Himmel", pt: "Himmel" })).toBe(true)
    expect(isRule({ kind: "glossary", source: "Himmel" })).toBe(false)
    expect(isRule({ kind: "other" })).toBe(false)
  })

  it("reads a base profile and rejects a wrong shape", () => {
    const base = { ...emptyBase("pt-pt"), examples: [{ name: "a.ass", text: "Olá." }] }
    expect(readBaseProfile(JSON.parse(JSON.stringify(base)))).toEqual(base)
    expect(readBaseProfile({ ...base, examples: ["Olá."] })).toBeNull()
    expect(readBaseProfile({ ...base, cpsLimit: "17" })).toBeNull()
    expect(readBaseProfile(null)).toBeNull()
  })

  it("reads a series profile and rejects a wrong shape", () => {
    const series = { id: "a1", variant: "pt-br", name: "Frieren", rules: [] }
    expect(readSeriesProfile(series)).toEqual(series)
    expect(readSeriesProfile({ ...series, name: 3 })).toBeNull()
    expect(readSeriesProfile({ ...series, variant: "pt" })).toBeNull()
  })

  it("reads project settings and ignores invalid ones", () => {
    const series = { id: "a1", variant: "pt-br", name: "Frieren", rules: [] }
    const settings = { cpsLimit: 20, preset: "best", frameSetting: "marked" }
    expect(readSeriesProfile({ ...series, ...settings })).toEqual({ ...series, ...settings })
    expect(
      readSeriesProfile({ ...series, cpsLimit: 0, preset: "x", frameSetting: "sometimes" }),
    ).toEqual(series)
    expect(readSeriesProfile({ ...series, cpsLimit: 61 })).toEqual(series)
    expect(readSeriesProfile({ ...series, cpsLimit: 17.5 })).toEqual(series)
  })
})

describe("series references", () => {
  it("reads examples only when well formed", () => {
    const series = { id: "a1", variant: "pt-br", name: "F", rules: [] }
    const examples = [{ name: "a.ass", text: "Oi." }]
    expect(readSeriesProfile({ ...series, examples })).toEqual({ ...series, examples })
    expect(readSeriesProfile(series)).toEqual(series)
    expect(readSeriesProfile({ ...series, examples: [{ name: 1 }] })).toBeNull()
  })
})
