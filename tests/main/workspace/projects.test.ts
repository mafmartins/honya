import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createFileStore } from "../../../src/core/library/fileStore"
import { createProjectService } from "../../../src/main/workspace/projects"
import { createSettingsStore } from "../../../src/main/settingsStore"

const SCRIPT = [
  "[Script Info]",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize",
  "Style: Default,Arial,20",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello there.",
].join("\n")

function setup(sessions: Record<string, number> = {}, failSaveIn: string | null = null) {
  const files = createFileStore(mkdtempSync(join(tmpdir(), "honya-projects-")))
  const store: typeof files = {
    ...files,
    saveSeries: (series) => {
      if (series.variant === failSaveIn) throw new Error("disk full")
      files.saveSeries(series)
    },
  }
  let n = 0
  const settings = createSettingsStore({ read: () => null, write: () => {} })
  const service = createProjectService(
    store,
    (id) => ({ count: sessions[id] ?? 0, last: sessions[id] ? "2026-01-01" : null }),
    () => settings.get(),
    () => `p${String(++n)}`,
  )
  return { store, service, settings }
}

describe("project service", () => {
  it("creates, lists, renames and deletes projects across variants", () => {
    const { service } = setup()
    const a = service.createProject(" Frieren ", "pt-pt")
    const b = service.createProject("Dandadan", "pt-br")
    expect(service.listProjects().map((p) => p.name)).toEqual(["Dandadan", "Frieren"])
    expect(service.updateProject(b.id, { name: "Dan" }).summary.name).toBe("Dan")
    expect(() => service.createProject("frieren", "pt-pt")).toThrow(/already exists/)
    expect(() => service.createProject(" ", "pt-pt")).toThrow()
    service.deleteProject(a.id)
    expect(service.listProjects().map((p) => p.id)).toEqual([b.id])
    expect(() => service.getProject(a.id)).toThrow(/no longer exists/)
  })

  it("shows inherited rules apart from a project's own", () => {
    const { service } = setup()
    const p = service.createProject("F", "pt-pt")
    service.addRule({ kind: "style", variant: "pt-pt" }, { kind: "prose", text: "Use tu." })
    service.addRule({ kind: "project", id: p.id }, { kind: "prose", text: "Keep names." })
    const view = service.getProject(p.id)
    expect(view.rules.own).toEqual([{ kind: "prose", text: "Keep names." }])
    expect(view.rules.inherited).toEqual([{ kind: "prose", text: "Use tu." }])
    expect(service.knownRules({ kind: "project", id: p.id })).toHaveLength(2)
    expect(service.knownRules({ kind: "style", variant: "pt-pt" })).toHaveLength(1)
    expect(service.getStyle("pt-br").rules).toEqual([])
  })

  it("locks the language when the project has sessions", () => {
    const { service } = setup({ p1: 2 })
    const locked = service.createProject("A", "pt-pt")
    const free = service.createProject("B", "pt-pt")
    expect(service.getProject(locked.id).languageLocked).toBe(true)
    expect(() => service.updateProject(locked.id, { variant: "pt-br" })).toThrow(
      "The language can't change once the project has sessions.",
    )
    const moved = service.updateProject(free.id, { variant: "pt-br" })
    expect(moved.summary.variant).toBe("pt-br")
    expect(service.getStyle("pt-br").usedBy).toEqual(["B"])
    expect(service.getStyle("pt-pt").usedBy).toEqual(["A"])
  })

  it("keeps the project where it was when moving it to the other language fails", () => {
    const { service } = setup({}, "pt-br")
    const p = service.createProject("A", "pt-pt")
    expect(() => service.updateProject(p.id, { variant: "pt-br" })).toThrow("disk full")
    expect(service.getProject(p.id).summary.variant).toBe("pt-pt")
  })

  it("stores project settings and clears the characters-per-second override", () => {
    const { service, store } = setup()
    const p = service.createProject("A", "pt-pt")
    const view = service.updateProject(p.id, {
      cpsLimit: 20,
      preset: "best",
      frameSetting: "every",
    })
    expect(view).toMatchObject({
      cpsLimit: 20,
      styleCps: 17,
      preset: "best",
      frameSetting: "every",
    })
    expect(service.updateProject(p.id, { cpsLimit: null }).cpsLimit).toBeNull()
    expect(store.loadSeries("pt-pt", p.id)?.cpsLimit).toBeUndefined()
    expect(service.getProject(service.createProject("B", "pt-pt").id).preset).toBe("save")
    expect(() => service.updateProject(p.id, { cpsLimit: 0 })).toThrow()
  })

  it("updates a style's characters per second", () => {
    const { service } = setup()
    expect(service.updateStyle("pt-br", { cpsLimit: 15 }).cpsLimit).toBe(15)
    expect(() => service.updateStyle("pt-br", { cpsLimit: 61 })).toThrow()
  })

  it("adds rules and bumps the card revision", () => {
    const { service, store } = setup()
    const p = service.createProject("A", "pt-pt")
    const before = store.loadBase("pt-pt")?.cardRevision ?? 0
    service.saveRules({ kind: "project", id: p.id }, [{ kind: "prose", text: "x" }])
    const mid = store.loadBase("pt-pt")?.cardRevision ?? 0
    expect(mid).toBeGreaterThan(before)
    service.addRule({ kind: "style", variant: "pt-pt" }, { kind: "prose", text: "y" })
    expect(store.loadBase("pt-pt")?.cardRevision).toBeGreaterThan(mid)
  })

  it("stores references on the style and on the project", () => {
    const { service, store } = setup()
    const p = service.createProject("A", "pt-pt")
    service.addReference({ kind: "project", id: p.id }, "ep1.ass", SCRIPT, ["Default"])
    service.addReference({ kind: "style", variant: "pt-pt" }, "ep0.ass", SCRIPT, ["Default"])
    const refs = service.getProject(p.id).references
    expect(refs.map((r) => r.name)).toEqual(["ep1.ass"])
    expect(refs[0]?.text).toContain("Hello there.")
    expect(service.getStyle("pt-pt").references.map((r) => r.name)).toEqual(["ep0.ass"])
    expect(store.loadCard("pt-pt", p.id)?.voice).toContain("Hello there.")
    expect(() => {
      service.addReference({ kind: "style", variant: "pt-pt" }, "e", SCRIPT, ["Sign"])
    }).toThrow("None of the chosen styles has dialogue in this script.")
  })

  it("reports session counts and last activity", () => {
    const { service } = setup({ p1: 3 })
    const p = service.createProject("A", "pt-pt")
    expect(p).toMatchObject({ sessions: 3, lastActivity: "2026-01-01" })
  })
})
