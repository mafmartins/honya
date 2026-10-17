import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { compileCard, emptyBase } from "../../src/core/library/card"
import { createFileStore } from "../../src/core/library/fileStore"
import { workspaceHandlers } from "../../src/main/ipc/workspace"
import { workspaceChannel } from "../../src/shared/api"
import { createModelStore } from "../../src/main/modelStore"
import { createSettingsStore } from "../../src/main/settingsStore"
import { createAiService, type WorkspaceEvent } from "../../src/main/workspace/ai"
import { createExportService } from "../../src/main/workspace/export"
import { createProjectService } from "../../src/main/workspace/projects"
import { createWorkSessions, type WorkSessions } from "../../src/main/workspace/sessions"

const SCRIPT = [
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello there.",
].join("\n")

function setup(
  keys: string[] = [],
  gate: Promise<never> | null = null,
  picked: string | null = null,
) {
  const root = mkdtempSync(join(tmpdir(), "honya-ws-ipc-"))
  const scriptPath = join(root, "ep01.ass")
  writeFileSync(scriptPath, SCRIPT, "utf8")
  const store = createFileStore(join(root, "profiles"))
  const settings = createSettingsStore({ read: () => null, write: () => {} })
  const projects = createProjectService(
    store,
    (id) => sessions.countFor(id),
    () => settings.get(),
  )
  const series = (id: string) => {
    for (const variant of ["pt-pt", "pt-br"] as const) {
      const found = store.listSeries(variant).find((item) => item.id === id)
      if (found !== undefined) return found
    }
    throw new Error("That project no longer exists.")
  }
  const sessions: WorkSessions = createWorkSessions(join(root, "sessions"), {
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    projectName: (id) => series(id).name,
    projectExists: (id) => {
      try {
        series(id)
        return true
      } catch {
        return false
      }
    },
    card: (id) => compileCard(emptyBase(series(id).variant), series(id)),
    readScript: () => SCRIPT,
    settings: () => settings.get(),
    project: (id) => ({ preset: "save", frameSetting: "none", variant: series(id).variant }),
  })
  const ai = createAiService({
    sessions,
    completerFor: () => () => gate ?? Promise.reject(new Error("offline")),
    grabFrame: () => Promise.resolve(null),
    emit: () => undefined,
    knownRules: () => [],
  })
  const exporter = createExportService({
    sessions,
    completerFor: () => () => Promise.reject(new Error("offline")),
    knownRules: () => [],
    addCorrections: () => undefined,
    addRule: () => undefined,
    writeFile: () => undefined,
    now: () => Date.now(),
  })
  const revealed: string[] = []
  const events: WorkspaceEvent[] = []
  const handlers = workspaceHandlers({
    settings,
    secrets: { hasKey: (provider) => keys.includes(provider) },
    models: createModelStore({ read: () => null, write: () => {} }),
    projects,
    sessions,
    ai,
    exporter,
    open: () => Promise.resolve(scriptPath),
    saveFile: () => Promise.resolve(picked),
    testKey: () => Promise.resolve({ ok: true }),
    revealLog: () => undefined,
    reveal: (path) => {
      revealed.push(path)
    },
    emit: (event) => {
      events.push(event)
    },
  })
  return { handlers, projects, ai, revealed, root, events }
}

describe("workspace ipc handlers", () => {
  it("names channels honya:ws-<kebab-name>", () => {
    expect(workspaceChannel("pickScriptForSession")).toBe("honya:ws-pick-script-for-session")
    expect(workspaceChannel("aiActive")).toBe("honya:ws-ai-active")
  })

  it("rejects malformed arguments before they reach a service", () => {
    const { handlers } = setup()
    expect(() => handlers.openSession(["not-a-session"])).toThrow("Invalid session id.")
    const id = "00000000-0000-4000-8000-000000000001"
    expect(() => handlers.editLine([id, 1.5, "Olá"])).toThrow("Invalid line number.")
    expect(() => handlers.editLine([id, -1, "Olá"])).toThrow("Invalid line number.")
    expect(() =>
      handlers.addRule([
        { kind: "series", id: "x" },
        { kind: "prose", text: "a" },
      ]),
    ).toThrow("Invalid rule owner.")
    expect(() =>
      handlers.saveRules([{ kind: "style", variant: "pt-pt" }, [{ kind: "x" }]]),
    ).toThrow("Invalid rules.")
    expect(() => handlers.updateSettings([{ eurRate: "1" }])).toThrow("Invalid euro rate.")
    expect(() => handlers.setFinished([id, "yes"])).toThrow("Invalid choice.")
  })

  it("counts setup as done once any key exists", () => {
    expect(setup().handlers.launchInfo([])).toMatchObject({ setupDone: false })
    expect(setup(["mistral"]).handlers.launchInfo([])).toMatchObject({ setupDone: true })
  })

  it("lists a project's sessions newest first and loads a picked script", async () => {
    const { handlers, projects } = setup()
    const one = projects.createProject("Frieren", "pt-pt")
    const other = projects.createProject("Dandadan", "pt-pt")
    const first = handlers.newSession([one.id])
    handlers.newSession([other.id])
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = handlers.newSession([one.id])
    expect(handlers.projectSessions([one.id])).toMatchObject([{ id: second }, { id: first }])
    const view = await handlers.pickScriptForSession([first])
    expect(view).toMatchObject({ scriptName: "ep01.ass", lines: [{ english: "Hello there." }] })
  })

  it("deletes a project's sessions with it", async () => {
    const { handlers, projects } = setup()
    const gone = projects.createProject("Frieren", "pt-pt")
    const kept = projects.createProject("Dandadan", "pt-pt")
    const first = handlers.newSession([gone.id])
    await handlers.pickScriptForSession([first])
    handlers.newSession([gone.id])
    const other = handlers.newSession([kept.id])
    handlers.deleteProject([gone.id])
    expect(handlers.listProjects([])).toMatchObject([{ id: kept.id }])
    expect(handlers.recentSessions([])).toMatchObject([{ id: other }])
    expect(handlers.launchInfo([])).toMatchObject({ continueSession: { id: other } })
    expect(() => handlers.openSession([first])).toThrow("This session was not found.")
  })

  it("refuses to delete a project while the AI runs one of its sessions", async () => {
    let release: (reason: Error) => void = () => undefined
    const gate = new Promise<never>((_resolve, reject) => {
      release = reject
    })
    const { handlers, projects, ai } = setup([], gate)
    const project = projects.createProject("Frieren", "pt-pt")
    const id = handlers.newSession([project.id])
    await handlers.pickScriptForSession([id])
    await handlers.runAi([id])
    expect(() => handlers.deleteProject([project.id])).toThrow(
      "Stop the AI run before deleting this project.",
    )
    expect(handlers.projectSessions([project.id])).toHaveLength(1)
    release(new Error("stopped"))
    await ai.idle()
    handlers.deleteProject([project.id])
    expect(handlers.projectSessions([project.id])).toHaveLength(0)
  })

  it("refuses to change the video while the AI runs the session", async () => {
    let release: (reason: Error) => void = () => undefined
    const gate = new Promise<never>((_resolve, reject) => {
      release = reject
    })
    const { handlers, projects, ai } = setup([], gate)
    const project = projects.createProject("Frieren", "pt-pt")
    const id = handlers.newSession([project.id])
    await handlers.pickScriptForSession([id])
    await handlers.runAi([id])
    const refusal = "Stop the AI run before changing the video."
    await expect(handlers.pickVideoForSession([id])).rejects.toThrow(refusal)
    expect(() => handlers.detachVideo([id])).toThrow(refusal)
    release(new Error("stopped"))
    await ai.idle()
    expect(handlers.detachVideo([id])).toMatchObject({ videoName: null })
  })

  it("tells the page when an edit, Accept, options or an export saved a session", async () => {
    const { handlers, projects, events } = setup()
    const project = projects.createProject("Frieren", "pt-pt")
    const id = handlers.newSession([project.id])
    await handlers.pickScriptForSession([id])
    handlers.editLine([id, 0, "Olá."])
    handlers.acceptLine([id, 0])
    handlers.setSessionOptions([id, { preset: "best" }])
    const preview = await handlers.exportPreview([id])
    handlers.exportWrite([id, isPreview(preview) ? preview.defaultPath : "", []])
    await expect(handlers.draftRule([id, 0])).rejects.toThrow()
    expect(events).toEqual(Array(6).fill({ type: "session-changed", sessionId: id }))
  })

  it("writes and shows only the paths Honya handed out", async () => {
    const chosen = join(tmpdir(), "chosen.pt-pt.ass")
    const { handlers, projects, revealed, root } = setup([], null, chosen)
    const project = projects.createProject("Frieren", "pt-pt")
    const id = handlers.newSession([project.id])
    await handlers.pickScriptForSession([id])
    const stray = join(root, "elsewhere.ass")
    expect(() => handlers.exportWrite([id, stray, []])).toThrow("Choose where to save with Change…")
    const preview = await handlers.exportPreview([id])
    const defaultPath = isPreview(preview) ? preview.defaultPath : ""
    expect(handlers.exportWrite([id, defaultPath, []])).toEqual({ path: defaultPath })
    expect(() => handlers.revealPath([stray])).toThrow("Honya can only show the file it exported.")
    handlers.revealPath([defaultPath])
    expect(await handlers.pickExportPath([defaultPath])).toBe(chosen)
    expect(handlers.exportWrite([id, chosen, []])).toEqual({ path: chosen })
    expect(() => handlers.revealPath([defaultPath])).toThrow(
      "Honya can only show the file it exported.",
    )
    handlers.revealPath([chosen])
    expect(revealed).toEqual([defaultPath, chosen])
  })
})

function isPreview(value: unknown): value is { defaultPath: string } {
  return typeof value === "object" && value !== null && "defaultPath" in value
}
