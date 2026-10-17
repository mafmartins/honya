import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { StyleCard } from "../../../src/core/library/types"
import { createWorkSessions } from "../../../src/main/workspace/sessions"
import { createSettingsStore } from "../../../src/main/settingsStore"

const HEAD = [
  "[Script Info]",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize",
  "Style: Default,Arial,20",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
]
const SCRIPT = [
  ...HEAD,
  "Dialogue: 0,0:00:01.00,0:00:02.00,Default,Ana,0,0,0,,Hello there.",
  "Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Goodbye.",
].join("\n")
const AMBIGUOUS = [...HEAD, "Dialogue: 0,0:00:01.00,0:00:02.00,Zorp,,0,0,0,,Hello there."].join(
  "\n",
)
const NO_DIALOGUE = [...HEAD, "Dialogue: 0,0:00:01.00,0:00:02.00,Sign,,0,0,0,,Shop"].join("\n")

const CARD: StyleCard = {
  variant: "pt-pt",
  seriesId: "p1",
  revision: 1,
  cpsLimit: 17,
  voice: "",
  rules: [],
}

function v2Session(id: string) {
  return {
    version: 2,
    id,
    startedAt: "2025-05-05T00:00:00.000Z",
    phase: "review",
    scriptPath: "/x/old.ass",
    scriptName: "old.ass",
    scriptText: SCRIPT,
    seriesId: "p9",
    seriesName: "Old",
    variant: "pt-pt",
    provider: "claude",
    preset: "save",
    frameSetting: "none",
    videoPath: null,
    outputPath: "",
    dialogueStyles: ["Default"],
    dialogueLines: 2,
    totalBatches: 1,
    saved: {
      completedBatches: 1,
      results: [["0", { id: "0", words: "Olá.", mark: "clean" }]],
      glossary: [],
      brief: "",
      hardIds: [],
      frameIds: [],
      strongIds: [],
    },
    review: { edits: {}, accepted: [], rules: [] },
    frameNotes: [],
    framesUsed: 0,
    elapsedMs: 5,
    error: null,
  }
}

function setup(failWrites = { on: false }) {
  const dir = mkdtempSync(join(tmpdir(), "honya-sessions-"))
  const files = new Map<string, string>()
  let clock = Date.parse("2026-01-01T00:00:00Z")
  let n = 0
  const settings = createSettingsStore({ read: () => null, write: () => {} })
  const store = createWorkSessions(
    dir,
    {
      now: () => (clock += 1000),
      newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
      projectName: (id) => `Project ${id}`,
      card: () => CARD,
      readScript: (path) => {
        const text = files.get(path)
        if (text === undefined) throw new Error("missing file")
        return text
      },
      settings: () => settings.get(),
      project: () => ({ preset: "balanced", frameSetting: "marked", variant: "pt-br" }),
    },
    {
      writeFile: (path, data) => {
        if (failWrites.on) throw new Error("disk full")
        writeFileSync(path, data, "utf8")
      },
    },
  )
  return { dir, files, store }
}

describe("work sessions", () => {
  it("creates an empty session from the project and settings", () => {
    const { store } = setup()
    const id = store.create("p1")
    const session = store.get(id)
    expect(session).toMatchObject({
      version: 3,
      projectId: "p1",
      variant: "pt-br",
      preset: "balanced",
      frameSetting: "marked",
      provider: "claude",
      scriptPath: "",
      scriptName: "",
      scriptText: "",
      lines: [],
    })
    expect(store.view(id).scriptName).toBeNull()
  })

  it("loads a script, confirms classified styles and round-trips edits", () => {
    const { store, files } = setup()
    files.set("/x/ep1.ass", SCRIPT)
    const id = store.create("p1")
    const view = store.loadScript(id, "/x/ep1.ass")
    expect(view.needsStyles).toBeNull()
    expect(view.scriptName).toBe("ep1.ass")
    expect(view.lines).toEqual([
      expect.objectContaining({ index: 0, start: 1000, speaker: "Ana", english: "Hello there." }),
      expect.objectContaining({ index: 1, start: 3000, speaker: "", english: "Goodbye." }),
    ])
    expect(view.lines[0]?.budget).toBe(17)
    const line = store.edit(id, 0, "Olá.")
    expect(line).toMatchObject({ words: "Olá.", origin: "manual" })
    store.accept(id, 1)
    expect(store.get(id).lines[0]?.words).toBe("Olá.")
    expect(store.view(id).stats.lines.manual).toBe(1)
  })

  it("asks for styles when ambiguous, then confirms", () => {
    const { store, files } = setup()
    files.set("/x/a.ass", AMBIGUOUS)
    const id = store.create("p1")
    const view = store.loadScript(id, "/x/a.ass")
    expect(view.needsStyles).toEqual([{ name: "Zorp", guess: "ambiguous" }])
    expect(view.lines).toEqual([])
    const done = store.confirmStyles(id, ["Zorp"])
    expect(done.needsStyles).toBeNull()
    expect(done.lines).toHaveLength(1)
  })

  it("refuses a script with no dialogue lines", () => {
    const { store, files } = setup()
    files.set("/x/s.ass", NO_DIALOGUE)
    const id = store.create("p1")
    expect(() => store.loadScript(id, "/x/s.ass")).toThrow(
      "This script has no dialogue lines in the chosen styles.",
    )
  })

  it("keeps working after the script file is deleted", () => {
    const { store, files } = setup()
    files.set("/x/ep1.ass", SCRIPT)
    const id = store.create("p1")
    store.loadScript(id, "/x/ep1.ass")
    files.delete("/x/ep1.ass")
    expect(store.view(id).lines).toHaveLength(2)
    expect(store.edit(id, 1, "Adeus.").words).toBe("Adeus.")
  })

  it("sets options, video and finished", () => {
    const { store, files } = setup()
    files.set("/x/ep1.ass", SCRIPT)
    const id = store.create("p1")
    store.loadScript(id, "/x/ep1.ass")
    expect(store.setOptions(id, { provider: "gpt", preset: "best" })).toMatchObject({
      provider: "gpt",
      preset: "best",
    })
    expect(store.attachVideo(id, "/v/ep1.mkv").videoName).toBe("ep1.mkv")
    expect(store.attachVideo(id, null).videoName).toBeNull()
    expect(store.setFinished(id, true).finished).toBe(true)
    expect(store.setFinished(id, null).finished).toBe(false)
  })

  it("orders recent and latestUnfinished by updatedAt and counts per project", () => {
    const { store } = setup()
    const a = store.create("p1")
    const b = store.create("p1")
    const c = store.create("p2")
    store.setFinished(c, true)
    store.setOptions(a, { preset: "best" })
    expect(store.recent(2).map((s) => s.id)).toEqual([a, c])
    expect(store.list()).toHaveLength(3)
    expect(store.latestUnfinished()?.id).toBe(a)
    expect(store.countFor("p1").count).toBe(2)
    expect(store.countFor("p1").last).toBe(store.get(a).updatedAt)
    expect(store.countFor("none")).toEqual({ count: 0, last: null })
    store.remove(b)
    expect(store.countFor("p1").count).toBe(1)
  })

  it("stores frames per session", () => {
    const { store } = setup()
    const id = store.create("p1")
    expect(store.readFrame(id, "3")).toBeNull()
    store.writeFrame(id, "3", new Uint8Array([1, 2]))
    expect(Array.from(store.readFrame(id, "3") ?? [])).toEqual([1, 2])
    expect(() => store.readFrame(id, "../x")).toThrow()
    expect(() => {
      store.clearFrames("..")
    }).toThrow()
    store.clearFrames(id)
    expect(store.readFrame(id, "3")).toBeNull()
  })

  it("migrates v2 files, keeps originals and skips damaged ones", () => {
    const { store, dir } = setup()
    const id = "11111111-1111-4111-8111-111111111111"
    const v2 = v2Session(id)
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(v2))
    const bad = "22222222-2222-4222-8222-222222222222"
    writeFileSync(join(dir, `${bad}.json`), "{nope")
    const result = store.migrate()
    expect(result.migrated).toBe(1)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]).toMatch(new RegExp(`^${bad}\\.json: .+`))
    expect(existsSync(join(dir, `${id}.v2.json`))).toBe(true)
    expect(readFileSync(join(dir, `${bad}.json`), "utf8")).toBe("{nope")
    expect(store.get(id)).toMatchObject({ version: 3, projectId: "p9" })
    expect(store.get(id).lines[0]?.words).toBe("Olá.")
    expect(readdirSync(dir).sort()).toEqual([`${id}.json`, `${id}.v2.json`, `${bad}.json`].sort())
    expect(store.migrate()).toEqual({ migrated: 0, skipped: [`${bad}.json: not valid JSON`] })
  })

  it("leaves a v2 file untouched and reports it when the swap fails", () => {
    const failWrites = { on: false }
    const { store, dir } = setup(failWrites)
    const id = "33333333-3333-4333-8333-333333333333"
    const original = JSON.stringify(v2Session(id))
    writeFileSync(join(dir, `${id}.json`), original)
    failWrites.on = true
    const result = store.migrate()
    expect(result.migrated).toBe(0)
    expect(result.skipped).toHaveLength(1)
    expect(readFileSync(join(dir, `${id}.json`), "utf8")).toBe(original)
    expect(result.skipped[0]).toMatch(new RegExp(`^${id}\\.json: disk full`))
    expect(readdirSync(dir)).toEqual([`${id}.json`])
  })

  it("refuses to load a script over an existing one or confirm styles twice", () => {
    const { store, files } = setup()
    files.set("/x/ep1.ass", SCRIPT)
    files.set("/x/a.ass", AMBIGUOUS)
    const id = store.create("p1")
    store.loadScript(id, "/x/ep1.ass")
    store.edit(id, 0, "Olá.")
    expect(() => store.loadScript(id, "/x/ep1.ass")).toThrow("This session already has a script.")
    expect(() => store.confirmStyles(id, ["Default"])).toThrow("This session already has a script.")
    expect(store.get(id).lines[0]?.words).toBe("Olá.")
    const second = store.create("p1")
    store.loadScript(second, "/x/a.ass")
    store.confirmStyles(second, ["Zorp"])
    expect(() => store.confirmStyles(second, ["Zorp"])).toThrow(
      "This session already has a script.",
    )
  })
})
