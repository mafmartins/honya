import { describe, expect, it } from "vitest"
import type { WorkspaceEvent } from "../../src/shared/api"
import { FAKE_FLAGGED_LINE, FAKE_SCRIPT, FAKE_SCRIPT_PATH, fakeApi } from "./fakeApi"

describe("fake workspace api", () => {
  it("runs the AI over a picked script and exports elsewhere than the script", async () => {
    const api = fakeApi()
    const events: WorkspaceEvent[] = []
    api.onWorkspaceEvent((event) => events.push(event))
    const project = await api.createProject("Frieren", "pt-pt")
    const id = await api.newSession(project.id)
    await api.pickScriptForSession(id)
    await api.editLine(id, 0, "Olá.")
    await api.runAi(id)
    await expect(api.runAi(id)).rejects.toThrow("Honya is already translating.")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events.map((event) => event.type)).toEqual([
      "session-changed",
      "run-progress",
      "lines",
      "run-ended",
    ])
    const view = await api.openSession(id)
    expect(view.lines[0]).toMatchObject({ words: "Olá.", origin: "manual" })
    expect(view.lines[FAKE_FLAGGED_LINE]?.flag).not.toBeNull()
    expect(view.stats.lines).toEqual({
      ai: 3,
      manual: 1,
      untranslated: 0,
      total: FAKE_SCRIPT.length,
    })
    expect(await api.exportPreview(id)).toMatchObject({ translated: 4, openFlags: 1 })
    await expect(api.exportWrite(id, "/elsewhere.ass", [])).rejects.toThrow(
      "Choose where to save with Change…",
    )
    await api.pickExportPath(FAKE_SCRIPT_PATH)
    await expect(api.exportWrite(id, FAKE_SCRIPT_PATH, [])).rejects.toThrow(
      "Choose a different name",
    )
    const before = events.length
    api.emitWorkspace({ type: "run-ended", sessionId: id, outcome: "stopped", message: null })
    expect(events).toHaveLength(before + 1)
  })

  it("deletes a project's sessions with it, but not during its AI run", async () => {
    const api = fakeApi()
    const project = await api.createProject("Frieren", "pt-pt")
    const id = await api.newSession(project.id)
    await api.pickScriptForSession(id)
    await api.runAi(id)
    await expect(api.deleteProject(project.id)).rejects.toThrow(
      "Stop the AI run before deleting this project.",
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    await api.deleteProject(project.id)
    expect(await api.recentSessions()).toEqual([])
    expect((await api.launchInfo()).continueSession).toBeNull()
    await expect(api.openSession(id)).rejects.toThrow("This session was not found.")
  })
})
