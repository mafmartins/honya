import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { emptyBase, importExample } from "../../src/core/library/card"
import { createFileStore } from "../../src/core/library/fileStore"

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "honya-profiles-"))
}

const FRIEREN = { id: "a1", variant: "pt-pt" as const, name: "Frieren", rules: [] }

describe("file profile store", () => {
  it("saves and reloads a base and series across store instances", () => {
    const dir = tempDir()
    const first = createFileStore(dir)
    first.saveBase(importExample(emptyBase("pt-pt"), "ep01.ass", "Olá."))
    first.saveSeries(FRIEREN)
    const second = createFileStore(dir)
    expect(second.loadBase("pt-pt")?.examples).toEqual([{ name: "ep01.ass", text: "Olá." }])
    expect(second.loadSeries("pt-pt", "a1")).toEqual(FRIEREN)
    expect(second.loadBase("pt-br")).toBeNull()
  })

  it("lists series by variant, sorted by name", () => {
    const store = createFileStore(tempDir())
    store.saveSeries({ ...FRIEREN, id: "b2", name: "Mushishi" })
    store.saveSeries(FRIEREN)
    store.saveSeries({ ...FRIEREN, id: "c3", variant: "pt-br" })
    expect(store.listSeries("pt-pt").map((series) => series.name)).toEqual(["Frieren", "Mushishi"])
    expect(store.listSeries("pt-br").map((series) => series.id)).toEqual(["c3"])
  })

  it("renames without changing the id and deletes the file", () => {
    const dir = tempDir()
    const store = createFileStore(dir)
    store.saveSeries(FRIEREN)
    expect(store.renameSeries("pt-pt", "a1", "Sousou no Frieren")?.id).toBe("a1")
    expect(store.loadSeries("pt-pt", "a1")?.name).toBe("Sousou no Frieren")
    expect(store.renameSeries("pt-pt", "missing", "X")).toBeNull()
    expect(store.deleteSeries("pt-pt", "a1")).toBe(true)
    expect(existsSync(join(dir, "series", "pt-pt", "a1.json"))).toBe(false)
    expect(store.deleteSeries("pt-pt", "a1")).toBe(false)
  })

  it("skips an unreadable series file and reports it once", () => {
    const dir = tempDir()
    const store = createFileStore(dir)
    store.saveSeries(FRIEREN)
    writeFileSync(join(dir, "series", "pt-pt", "broken.json"), "{not json")
    expect(store.listSeries("pt-pt").map((series) => series.id)).toEqual(["a1"])
    expect(store.takeProblems()).toEqual(["Couldn't read series file broken.json."])
    expect(store.takeProblems()).toEqual([])
  })

  it("moves an unreadable base aside and starts empty", () => {
    const dir = tempDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "base-pt-pt.json"), JSON.stringify({ variant: "pt-pt" }))
    const store = createFileStore(dir)
    expect(store.loadBase("pt-pt")).toBeNull()
    expect(existsSync(join(dir, "base-pt-pt.json.bad"))).toBe(true)
    expect(existsSync(join(dir, "base-pt-pt.json"))).toBe(false)
    expect(store.takeProblems()).toEqual([
      "base-pt-pt.json couldn't be read and was moved to base-pt-pt.json.bad.",
    ])
  })

  it("keeps the previous file when a write fails", () => {
    const dir = tempDir()
    createFileStore(dir).saveSeries(FRIEREN)
    const failing = createFileStore(dir, {
      writeFile(path) {
        writeFileSync(path, "{half")
        throw new Error("disk full")
      },
    })
    expect(() => {
      failing.saveSeries({ ...FRIEREN, name: "Changed" })
    }).toThrow("disk full")
    const file = join(dir, "series", "pt-pt", "a1.json")
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(FRIEREN)
    expect(readdirSync(join(dir, "series", "pt-pt"))).toEqual(["a1.json"])
  })

  it("refuses a series id that would leave the series folder", () => {
    const store = createFileStore(tempDir())
    expect(() => store.loadSeries("pt-pt", "../../keys")).toThrow("Invalid series id.")
    expect(() => store.deleteSeries("pt-pt", "../base-pt-pt")).toThrow("Invalid series id.")
    expect(() => {
      store.saveSeries({ ...FRIEREN, id: "a/b" })
    }).toThrow("Invalid series id.")
  })
})
