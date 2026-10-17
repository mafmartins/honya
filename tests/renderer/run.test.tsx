// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ErrorContext } from "../../src/renderer/action"
import { ApiContext } from "../../src/renderer/api"
import { SessionPage } from "../../src/renderer/workspace/session/SessionPage"
import { Shell } from "../../src/renderer/workspace/Shell"
import type { WorkspaceEvent } from "../../src/shared/api"
import { fakeApi, FAKE_SCRIPT, FAKE_SCRIPT_NAME, type FakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function loadedSession(api: FakeApi, project = "Demon Slayer"): Promise<string> {
  const created = await api.createProject(project, "pt-pt")
  const id = await api.newSession(created.id)
  await api.pickScriptForSession(id)
  return id
}

function openPage(api: FakeApi, id: string): void {
  render(
    <ApiContext.Provider value={api}>
      <SessionPage sessionId={id} />
    </ApiContext.Provider>,
  )
}

type RunProgressEvent = Extract<WorkspaceEvent, { type: "run-progress" }>

function grid(): HTMLElement {
  return screen.getByRole("grid", { name: "Lines" })
}

function menu(): HTMLElement {
  return screen.getByRole("navigation", { name: "Menu" })
}

function progress(id: string, indexes: number[]): RunProgressEvent {
  return {
    type: "run-progress",
    sessionId: id,
    index: 1,
    total: 2,
    linesDone: 0,
    lineTotal: FAKE_SCRIPT.length,
    activity: "Translating batch 1 of 2",
    indexes,
  }
}

// Boots the shell past the launch window and opens the Demon Slayer session from
// Recent sessions; the run is reported as going in it.
async function runningShell(api: FakeApi): Promise<{ running: string; other: string }> {
  const other = await loadedSession(api, "Frieren")
  const running = await loadedSession(api)
  await api.updateSettings({ setupDone: true })
  render(<Shell api={api} />)
  fireEvent.click(await screen.findByRole("button", { name: "Close" }))
  fireEvent.click(await within(menu()).findByRole("button", { name: /Demon Slayer/ }))
  await screen.findByRole("grid", { name: "Lines" })
  api.aiActive = () => Promise.resolve(running)
  return { running, other }
}

function confirmDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "Stop the AI run?" })
}

describe("running the AI from the session", () => {
  it("fills the lines live and shows the run's progress", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    openPage(api, id)
    fireEvent.click(await screen.findByRole("button", { name: "Translate with AI" }))
    expect(await screen.findByRole("button", { name: "Stop" })).toBeTruthy()
    for (const entry of FAKE_SCRIPT) {
      expect(await within(grid()).findByText(`pt: ${entry.english}`)).toBeTruthy()
    }
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
    })
  })

  it("marks the lines of the batch being translated", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    api.aiActive = () => Promise.resolve(id)
    openPage(api, id)
    await screen.findByRole("button", { name: "Stop" })
    act(() => {
      api.emitWorkspace(progress(id, [1, 2]))
    })
    const rows = within(grid()).getAllByRole("row").slice(1)
    expect(rows.map((row) => row.getAttribute("aria-busy"))).toEqual([null, "true", "true", null])
    expect(within(grid()).getAllByText("Translating…")).toHaveLength(2)
    expect(screen.getByText("Batch 1 of 2 · 0 of 4 lines")).toBeTruthy()
    act(() => {
      api.emitWorkspace({ ...progress(id, []), index: 2 })
    })
    expect(within(grid()).queryByText("Translating…")).toBeNull()
  })

  it("explains a failed run, keeps the finished lines and offers to try again", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    await api.editLine(id, 0, "Olá.")
    api.aiActive = () => Promise.resolve(id)
    const errors: (string | null)[] = []
    render(
      <ApiContext.Provider value={api}>
        <ErrorSink errors={errors}>
          <SessionPage sessionId={id} />
        </ErrorSink>
      </ApiContext.Provider>,
    )
    await screen.findByRole("button", { name: "Stop" })
    act(() => {
      api.emitWorkspace({
        type: "run-ended",
        sessionId: id,
        outcome: "failed",
        message: "Gemini rejected the key.",
      })
    })
    expect(
      await screen.findByText(
        "The AI run stopped: Gemini rejected the key. Finished lines are saved.",
      ),
    ).toBeTruthy()
    expect(errors).toContain("Gemini rejected the key.")
    expect(within(grid()).getByText("Olá.")).toBeTruthy()
    api.aiActive = () => Promise.resolve(null)
    const run = vi.spyOn(api, "runAi")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(run).toHaveBeenCalledWith(id)
    expect(screen.queryByText(/The AI run stopped/)).toBeNull()
    expect(await within(grid()).findByText(`pt: ${FAKE_SCRIPT[1]?.english ?? ""}`)).toBeTruthy()
  })

  it("says a stopped run kept its batches, until dismissed", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    api.aiActive = () => Promise.resolve(id)
    openPage(api, id)
    await screen.findByRole("button", { name: "Stop" })
    act(() => {
      api.emitWorkspace({ type: "run-ended", sessionId: id, outcome: "stopped", message: null })
    })
    expect(await screen.findByText("Stopped. Finished batches are saved.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByText("Stopped. Finished batches are saved.")).toBeNull()
  })

  it("doesn't show a run that ended before aiActive answered", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    let answer: (value: string | null) => void = () => undefined
    api.aiActive = () =>
      new Promise((resolve) => {
        answer = resolve
      })
    openPage(api, id)
    await screen.findByRole("button", { name: "Translate with AI" })
    act(() => {
      api.emitWorkspace({ type: "run-ended", sessionId: id, outcome: "done", message: null })
    })
    await act(async () => {
      answer(id)
      await Promise.resolve()
    })
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
    expect(screen.queryByText("Starting…")).toBeNull()
  })
})

describe("leaving a session while the AI runs", () => {
  it("asks before switching sessions and only switches on Stop", async () => {
    const api = fakeApi()
    await runningShell(api)
    const stop = vi.spyOn(api, "stopAi")
    fireEvent.click(within(menu()).getByRole("button", { name: /Frieren/ }))
    const dialog = await screen.findByRole("dialog", { name: "Stop the AI run?" })
    expect(
      within(dialog).getByText(
        "Honya is translating this session. Stopping keeps the lines already done.",
      ),
    ).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep translating" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(stop).not.toHaveBeenCalled()
    expect(
      within(menu())
        .getByRole("button", { name: /Demon Slayer/ })
        .getAttribute("aria-current"),
    ).toBe("true")

    fireEvent.click(within(menu()).getByRole("button", { name: /Frieren/ }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Stop" }))
    expect(stop).toHaveBeenCalled()
    await waitFor(() => {
      expect(
        within(menu())
          .getByRole("button", { name: /Frieren/ })
          .getAttribute("aria-current"),
      ).toBe("true")
    })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("asks before choosing another project", async () => {
    const api = fakeApi()
    await runningShell(api)
    const projects = await api.listProjects()
    const frieren = projects.find((item) => item.name === "Frieren")
    const select = within(menu()).getByRole<HTMLSelectElement>("combobox", { name: "Project" })
    const before = select.value
    fireEvent.change(select, { target: { value: frieren?.id } })
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep translating" }),
    )
    expect(select.value).toBe(before)
    fireEvent.change(select, { target: { value: frieren?.id } })
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Stop" }))
    await waitFor(() => {
      expect(select.value).toBe(frieren?.id)
    })
  })

  it("asks before a project page opens or starts another session", async () => {
    const api = fakeApi()
    await runningShell(api)
    const frieren = (await api.listProjects()).find((item) => item.name === "Frieren")
    fireEvent.click(within(menu()).getByRole("button", { name: "Projects" }))
    fireEvent.click(await screen.findByRole("button", { name: "Frieren" }))
    const sessions = await screen.findByRole("region", { name: "Sessions" })
    fireEvent.click(within(sessions).getByRole("button", { name: "New session" }))
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep translating" }),
    )
    expect(await api.projectSessions(frieren?.id ?? "")).toHaveLength(1)

    fireEvent.click(await within(sessions).findByRole("button", { name: "Open" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Stop" }))
    await waitFor(() => {
      expect(
        within(menu())
          .getByRole("button", { name: /Frieren/ })
          .getAttribute("aria-current"),
      ).toBe("true")
    })
    expect(screen.getByRole("heading", { level: 1, name: FAKE_SCRIPT_NAME })).toBeTruthy()
  })

  it("lets other pages open while the run goes on", async () => {
    const api = fakeApi()
    await runningShell(api)
    const stop = vi.spyOn(api, "stopAi")
    fireEvent.click(within(menu()).getByRole("button", { name: "Settings" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(within(menu()).getByRole("button", { name: "Session" }))
    expect(await screen.findByRole("heading", { level: 1, name: FAKE_SCRIPT_NAME })).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(stop).not.toHaveBeenCalled()
  })

  it("switches without asking when no run is going", async () => {
    const api = fakeApi()
    await runningShell(api)
    api.aiActive = () => Promise.resolve(null)
    fireEvent.click(within(menu()).getByRole("button", { name: /Frieren/ }))
    await waitFor(() => {
      expect(
        within(menu())
          .getByRole("button", { name: /Frieren/ })
          .getAttribute("aria-current"),
      ).toBe("true")
    })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("asks before the window closes and closes once the run has stopped", async () => {
    const api = fakeApi()
    const { running } = await runningShell(api)
    const stop = vi.spyOn(api, "stopAi")
    act(() => {
      api.emitBeforeClose()
    })
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Keep translating" }))
    expect(api.closeAnswers).toEqual([false])
    expect(screen.queryByRole("dialog")).toBeNull()

    act(() => {
      api.emitBeforeClose()
    })
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Stop" }))
    expect(stop).toHaveBeenCalled()
    await act(async () => {
      await Promise.resolve()
    })
    expect(api.closeAnswers).toEqual([false])
    act(() => {
      api.emitWorkspace({
        type: "run-ended",
        sessionId: running,
        outcome: "stopped",
        message: null,
      })
    })
    await waitFor(() => {
      expect(api.closeAnswers).toEqual([false, true])
    })
  })

  it("closes after five seconds when the run doesn't end", async () => {
    const api = fakeApi()
    await runningShell(api)
    vi.useFakeTimers()
    act(() => {
      api.emitBeforeClose()
    })
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Stop" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4900)
    })
    expect(api.closeAnswers).toEqual([])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(api.closeAnswers).toEqual([true])
  })
})

function ErrorSink({
  errors,
  children,
}: {
  errors: (string | null)[]
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <ErrorContext.Provider
      value={(message) => {
        errors.push(message)
      }}
    >
      {children}
    </ErrorContext.Provider>
  )
}
