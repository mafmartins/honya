import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { emptyBase } from "../../src/core/library/card"
import { createFileStore } from "../../src/core/library/fileStore"
import { createProfileHandlers } from "../../src/main/ipc/profiles"

const SCRIPT = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,Frieren,0,0,0,,Hello.
Dialogue: 0,0:00:04.00,0:00:05.00,Signs,,0,0,0,,Shop
`

function handlers(): ReturnType<typeof createProfileHandlers> {
  let next = 0
  const store = createFileStore(mkdtempSync(join(tmpdir(), "honya-handlers-")))
  return createProfileHandlers(store, () => {
    next += 1
    return `id-${String(next)}`
  })
}

describe("profile handlers", () => {
  it("creates, lists, renames and deletes a series", () => {
    const profiles = handlers()
    const created = profiles.createSeries("pt-pt", "  Frieren ")
    expect(created).toEqual({ id: "id-1", name: "Frieren", ruleCount: 0 })
    expect(profiles.listSeries("pt-pt")).toEqual({ series: [created], problems: [] })
    expect(profiles.listSeries("pt-br").series).toEqual([])
    expect(profiles.renameSeries("pt-pt", "id-1", "Sousou no Frieren").name).toBe(
      "Sousou no Frieren",
    )
    profiles.deleteSeries("pt-pt", "id-1")
    expect(profiles.listSeries("pt-pt").series).toEqual([])
  })

  it("refuses an empty name and a name that differs only by case or spaces", () => {
    const profiles = handlers()
    profiles.createSeries("pt-pt", "Frieren")
    expect(() => profiles.createSeries("pt-pt", "   ")).toThrow("Give the series a name.")
    expect(() => profiles.createSeries("pt-pt", " frieren ")).toThrow(
      "A series called frieren already exists for pt-pt.",
    )
    expect(profiles.createSeries("pt-br", "Frieren").name).toBe("Frieren")
  })

  it("allows renaming a series to its own name in a different case", () => {
    const profiles = handlers()
    profiles.createSeries("pt-pt", "frieren")
    profiles.createSeries("pt-pt", "Mushishi")
    expect(profiles.renameSeries("pt-pt", "id-1", "Frieren").name).toBe("Frieren")
    expect(() => profiles.renameSeries("pt-pt", "id-1", "MUSHISHI")).toThrow(
      "A series called MUSHISHI already exists for pt-pt.",
    )
    expect(() => profiles.renameSeries("pt-pt", "nope", "X")).toThrow(
      "That series no longer exists.",
    )
  })

  it("saves series rules and bumps the base revision", () => {
    const profiles = handlers()
    profiles.createSeries("pt-pt", "Frieren")
    const before = profiles.loadBase("pt-pt").base.cardRevision
    profiles.saveSeriesRules("pt-pt", "id-1", [
      { kind: "glossary", source: "Himmel", pt: "Himmel" },
    ])
    expect(profiles.loadSeriesRules("pt-pt", "id-1")).toHaveLength(1)
    expect(profiles.listSeries("pt-pt").series[0]?.ruleCount).toBe(1)
    expect(profiles.loadBase("pt-pt").base.cardRevision).toBe(before + 1)
  })

  it("starts from an empty base and saves a valid characters-per-second limit", () => {
    const profiles = handlers()
    expect(profiles.loadBase("pt-br")).toEqual({ base: emptyBase("pt-br"), problems: [] })
    const saved = profiles.saveBase({ ...emptyBase("pt-br"), cpsLimit: 20, cardRevision: 99 })
    expect(saved.cpsLimit).toBe(20)
    expect(saved.cardRevision).toBe(1)
  })

  it("refuses a limit that is not a whole number from 1 to 60", () => {
    const profiles = handlers()
    for (const cpsLimit of [0, 61, 17.5]) {
      expect(() => profiles.saveBase({ ...emptyBase("pt-pt"), cpsLimit })).toThrow(
        "Characters per second must be a whole number from 1 to 60.",
      )
    }
    expect(profiles.loadBase("pt-pt").base.cpsLimit).toBe(17)
  })

  it("imports the dialogue of the chosen styles under the file name", () => {
    const profiles = handlers()
    const base = profiles.importExample("pt-pt", "ep01.ass", SCRIPT, ["Default"])
    expect(base.examples).toEqual([{ name: "ep01.ass", text: "Hello." }])
    expect(() => profiles.importExample("pt-pt", "ep01.ass", SCRIPT, ["Title"])).toThrow(
      "None of the chosen styles has dialogue in this script.",
    )
  })
})
