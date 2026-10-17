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
import { createAiService } from "../../src/main/workspace/ai"
import { createExportService } from "../../src/main/workspace/export"
import { createProjectService } from "../../src/main/workspace/projects"
import { createWorkSessions, type WorkSessions } from "../../src/main/workspace/sessions"

const SCRIPT = [
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello there.",
].join("\n")

function setup(keys: string[] = [], gate: Promise<never> | null = null) {
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
  const handlers = workspaceHandlers({
    settings,
    secrets: { hasKey: (provider) => keys.includes(provider) },
    models: createModelStore({ read: () => null, write: () => {} }),
    projects,
    sessions,
    ai,
    exporter,
    open: () => Promise.resolve(scriptPath),
    saveFile: () => Promise.resolve(null),
    testKey: () => Promise.resolve({ ok: true }),
    revealLog: () => undefined,
    reveal: () => undefined,
  })
  return { handlers, projects, ai }
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
})
