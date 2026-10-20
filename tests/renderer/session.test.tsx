// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiContext } from "../../src/renderer/api"
import { SessionPage } from "../../src/renderer/workspace/session/SessionPage"
import type { LineView, SessionView } from "../../src/shared/api"
import { fakeApi, FAKE_SCRIPT, FAKE_SCRIPT_NAME, type FakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

async function emptySession(api: FakeApi): Promise<string> {
  const project = await api.createProject("Demon Slayer", "pt-pt")
  return api.newSession(project.id)
}

async function loadedSession(api: FakeApi): Promise<string> {
  const id = await emptySession(api)
  await api.pickScriptForSession(id)
  return id
}

function open(api: FakeApi, id: string | null): void {
  render(
    <ApiContext.Provider value={api}>
      <SessionPage sessionId={id} />
    </ApiContext.Provider>,
  )
}

function line(index: number, patch: Partial<LineView> = {}): LineView {
  return {
    index,
    start: index * 1000,
    end: index * 1000 + 800,
    speaker: "Tanjiro",
    english: `English ${String(index)}`,
    englishMissing: false,
    words: null,
    origin: null,
    flag: null,
    budget: 20,
    ...patch,
  }
}

// Serves the session with these lines instead of the fake's script.
async function withLines(api: FakeApi, lines: LineView[]): Promise<string> {
  const id = await loadedSession(api)
  const base = await api.openSession(id)
  const view: SessionView = { ...base, lines }
  api.openSession = () => Promise.resolve(view)
  return id
}

const MIXED: LineView[] = [
  line(0, { english: "Hello.", words: "Olá.", origin: "ai" }),
  line(1, { english: "Where are we going?", words: "Onde vamos?", origin: "manual" }),
  line(2, { english: "Damn it!", words: "Raios!", origin: "ai", flag: "Check the tone." }),
  line(3, { english: "Run!", speaker: "" }),
]

function grid(): HTMLElement {
  return screen.getByRole("grid", { name: "Lines" })
}

// Waits for a row's text in the list (the panel's editor may hold the same words).
async function shown(text: string): Promise<void> {
  await within(await screen.findByRole("grid", { name: "Lines" })).findByText(text)
}

function rows(): HTMLElement[] {
  return within(grid())
    .getAllByRole("row")
    .filter((row) => row.getAttribute("aria-selected") !== null)
}

describe("session page", () => {
  it("shows number, time, English and Portuguese columns, without the speaker", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    open(api, id)
    await screen.findByRole("grid", { name: "Lines" })
    const headers = within(grid())
      .getAllByRole("columnheader")
      .map((header) => header.textContent)
    expect(headers).not.toContain("Speaker")
    expect(headers).toEqual(expect.arrayContaining(["English", "Portuguese"]))
  })

  it("offers to try again or go back when the session can't be opened", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    const real = api.openSession.bind(api)
    let fail = true
    api.openSession = (session) =>
      fail ? Promise.reject(new Error("That project no longer exists.")) : real(session)
    const back = vi.fn()
    render(
      <ApiContext.Provider value={api}>
        <SessionPage sessionId={id} onBack={back} />
      </ApiContext.Provider>,
    )
    expect(await screen.findByText("Couldn't open this session.")).toBeTruthy()
    expect(screen.getByText("That project no longer exists.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Back to projects" }))
    expect(back).toHaveBeenCalledTimes(1)
    fail = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("grid", { name: "Lines" })).toBeTruthy()
  })

  it("offers Load script on an empty session and shows the lines once loaded", async () => {
    const api = fakeApi()
    const id = await emptySession(api)
    open(api, id)
    expect(await screen.findByText("Drop an .ass file or choose one")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Load script" }))
    expect(await screen.findByRole("heading", { level: 1, name: FAKE_SCRIPT_NAME })).toBeTruthy()
    expect(screen.getByText("Demon Slayer · PT-PT")).toBeTruthy()
    for (const entry of FAKE_SCRIPT) {
      expect(within(grid()).getByText(entry.english)).toBeTruthy()
    }
    expect(within(grid()).getByText("0:01.00")).toBeTruthy()
    expect(within(grid()).getAllByLabelText("not translated yet")).toHaveLength(FAKE_SCRIPT.length)
  })

  it("opens the picker when a file is dropped on the empty state", async () => {
    const api = fakeApi()
    const pick = vi.spyOn(api, "pickScriptForSession")
    const id = await emptySession(api)
    open(api, id)
    fireEvent.drop(await screen.findByText("Drop an .ass file or choose one"))
    await waitFor(() => {
      expect(pick).toHaveBeenCalledWith(id)
    })
  })

  it("asks which styles are dialogue when the script needs it", async () => {
    const api = fakeApi()
    const id = await emptySession(api)
    const base = await api.openSession(id)
    api.openSession = () =>
      Promise.resolve({
        ...base,
        scriptName: FAKE_SCRIPT_NAME,
        needsStyles: [{ name: "Signs", guess: "ambiguous" }],
      })
    const confirm = vi.spyOn(api, "confirmStyles").mockResolvedValue({
      ...base,
      scriptName: FAKE_SCRIPT_NAME,
      lines: [line(0)],
    })
    open(api, id)
    fireEvent.click(await screen.findByRole("radio", { name: "Signs skip" }))
    fireEvent.click(screen.getByRole("button", { name: "Use these styles" }))
    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(id, [])
    })
    await shown("English 0")
  })

  it("marks flagged lines and lines you edited", async () => {
    const api = fakeApi()
    const id = await withLines(api, MIXED)
    open(api, id)
    await shown("Olá.")
    const [first, second, third] = rows()
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("Expected three rows.")
    }
    expect(within(second).getByText("you")).toBeTruthy()
    expect(within(first).queryByText("you")).toBeNull()
    expect(within(third).getByText("⚑")).toBeTruthy()
    expect(within(first).queryByText("⚑")).toBeNull()
  })

  it("counts and filters lines, and searches English and Portuguese", async () => {
    const api = fakeApi()
    const id = await withLines(api, MIXED)
    open(api, id)
    await shown("Olá.")
    expect(screen.getByRole("button", { name: "All 4" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Flagged 1" }))
    expect(rows()).toHaveLength(1)
    expect(within(grid()).getByText("Raios!")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Edited by you 1" }))
    expect(within(grid()).getByText("Onde vamos?")).toBeTruthy()
    expect(rows()).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Untranslated 1" }))
    expect(within(grid()).getByText("Run!")).toBeTruthy()
    expect(rows()).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "All 4" }))
    const search = screen.getByRole("searchbox", { name: "Search lines" })
    fireEvent.change(search, { target: { value: "WHERE" } })
    expect(rows()).toHaveLength(1)
    fireEvent.change(search, { target: { value: "raios" } })
    expect(within(grid()).getByText("Damn it!")).toBeTruthy()
    expect(rows()).toHaveLength(1)
  })

  it("translates with AI and hides the button when nothing is left", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    open(api, id)
    fireEvent.click(await screen.findByRole("button", { name: "Translate with AI" }))
    expect(await screen.findByText(`pt: ${FAKE_SCRIPT[0]?.english ?? ""}`)).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Translate/ })).toBeNull()
    })
  })

  it("offers to translate the rest once some lines have Portuguese", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    await api.editLine(id, 0, "Olá.")
    open(api, id)
    expect(await screen.findByRole("button", { name: "Translate the rest with AI" })).toBeTruthy()
  })

  it("shows the run's progress and stops it", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    api.aiActive = () => Promise.resolve(id)
    const stop = vi.spyOn(api, "stopAi")
    const reload = vi.spyOn(api, "openSession")
    open(api, id)
    const stopButton = await screen.findByRole("button", { name: "Stop" })
    expect(screen.queryByRole("button", { name: /Translate/ })).toBeNull()
    act(() => {
      api.emitWorkspace({
        type: "run-progress",
        sessionId: id,
        index: 2,
        total: 5,
        linesDone: 40,
        lineTotal: 120,
        activity: "Translating batch 2 of 5",
        indexes: [],
      })
    })
    expect(screen.getByText("Batch 2 of 5 · 40 of 120 lines")).toBeTruthy()
    expect(screen.getByText("Translating batch 2 of 5")).toBeTruthy()
    fireEvent.click(stopButton)
    expect(stop).toHaveBeenCalled()
    const loads = reload.mock.calls.length
    act(() => {
      api.emitWorkspace({ type: "run-ended", sessionId: id, outcome: "stopped", message: null })
    })
    await waitFor(() => {
      expect(screen.queryByText("Batch 2 of 5 · 40 of 120 lines")).toBeNull()
    })
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
    expect(reload.mock.calls.length).toBeGreaterThan(loads)
  })

  it("ignores progress from another session", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    open(api, id)
    await screen.findByRole("button", { name: "Translate with AI" })
    act(() => {
      api.emitWorkspace({
        type: "run-progress",
        sessionId: "other",
        index: 1,
        total: 1,
        linesDone: 0,
        lineTotal: 1,
        activity: "Translating",
        indexes: [],
      })
    })
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
  })

  it("updates rows from line events", async () => {
    const api = fakeApi()
    const id = await withLines(api, MIXED)
    open(api, id)
    await shown("Olá.")
    act(() => {
      api.emitWorkspace({
        type: "lines",
        sessionId: id,
        lines: [line(3, { english: "Run!", words: "Foge!", origin: "ai" })],
      })
    })
    expect(within(grid()).getByText("Foge!")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Translate/ })).toBeNull()
  })

  it("changes the provider and preset", async () => {
    const api = fakeApi()
    const set = vi.spyOn(api, "setSessionOptions")
    const id = await loadedSession(api)
    open(api, id)
    const provider = await screen.findByRole<HTMLSelectElement>("combobox", { name: "Provider" })
    expect(within(provider).getByRole("option", { name: "Gemini" })).toBeTruthy()
    fireEvent.change(provider, { target: { value: "gemini" } })
    await waitFor(() => {
      expect(set).toHaveBeenCalledWith(id, { provider: "gemini" })
    })
    const preset = screen.getByRole<HTMLSelectElement>("combobox", { name: "Preset" })
    expect(within(preset).getByRole("option", { name: "Balanced" })).toBeTruthy()
    fireEvent.change(preset, { target: { value: "best" } })
    await waitFor(() => {
      expect(set).toHaveBeenCalledWith(id, { preset: "best" })
    })
    expect(provider.value).toBe("gemini")
  })

  it("attaches and detaches a video", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    open(api, id)
    fireEvent.click(await screen.findByRole("button", { name: "Attach video" }))
    expect(await screen.findByText("ep01.mkv")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Detach video" }))
    expect(await screen.findByRole("button", { name: "Attach video" })).toBeTruthy()
    expect(screen.queryByText("ep01.mkv")).toBeNull()
  })

  it("moves the selection with the arrow keys and shows it in the panel slot", async () => {
    const api = fakeApi()
    const id = await withLines(api, MIXED)
    open(api, id)
    await shown("Olá.")
    const list = grid()
    list.focus()
    expect(rows()[0]?.getAttribute("aria-selected")).toBe("true")
    fireEvent.keyDown(list, { key: "ArrowDown" })
    fireEvent.keyDown(list, { key: "ArrowDown" })
    expect(rows()[2]?.getAttribute("aria-selected")).toBe("true")
    expect(rows()[0]?.getAttribute("aria-selected")).toBe("false")
    fireEvent.keyDown(list, { key: "ArrowUp" })
    expect(rows()[1]?.getAttribute("aria-selected")).toBe("true")
    expect(
      within(screen.getByRole("complementary", { name: "Line" })).getByText(/^Line 2 · /),
    ).toBeTruthy()
    fireEvent.click(within(list).getByText("Run!"))
    expect(rows()[3]?.getAttribute("aria-selected")).toBe("true")
  })

  it("returns the focus to the list on Escape", async () => {
    const api = fakeApi()
    const id = await withLines(api, MIXED)
    open(api, id)
    await shown("Olá.")
    const search = screen.getByRole("searchbox", { name: "Search lines" })
    search.focus()
    fireEvent.keyDown(search, { key: "Escape" })
    expect(document.activeElement).toBe(grid())
  })

  it("renders only a window of rows for a long script", async () => {
    const api = fakeApi()
    const many = Array.from({ length: 1000 }, (_, index) => line(index))
    const id = await withLines(api, many)
    open(api, id)
    await shown("English 0")
    expect(rows().length).toBeLessThan(100)
    expect(screen.queryByText("English 999")).toBeNull()
    const list = grid()
    list.focus()
    for (let step = 0; step < 60; step += 1) {
      fireEvent.keyDown(list, { key: "ArrowDown" })
    }
    expect(within(list).getByText("English 60")).toBeTruthy()
    expect(rows().length).toBeLessThan(100)
  })

  it("focuses the line's editor on Enter in the list", async () => {
    const api = fakeApi()
    const id = await withLines(api, MIXED)
    open(api, id)
    await shown("Olá.")
    const list = grid()
    list.focus()
    fireEvent.keyDown(list, { key: "ArrowDown" })
    fireEvent.keyDown(list, { key: "Enter" })
    const panel = screen.getByRole("complementary", { name: "Line" })
    const editor = within(panel).getByRole<HTMLTextAreaElement>("textbox", { name: "Portuguese" })
    expect(document.activeElement).toBe(editor)
    expect(editor.value).toBe("Onde vamos?")
  })

  it("says Saving… in the top bar while an edit is in flight", async () => {
    const api = fakeApi()
    const id = await loadedSession(api)
    const real = api.editLine.bind(api)
    let release: () => void = () => undefined
    api.editLine = (session, index, words) =>
      new Promise((resolve, reject) => {
        release = () => {
          real(session, index, words).then(resolve, reject)
        }
      })
    open(api, id)
    await shown(FAKE_SCRIPT[0]?.english ?? "")
    expect(screen.getByText("Saved")).toBeTruthy()
    const panel = screen.getByRole("complementary", { name: "Line" })
    const editor = within(panel).getByRole("textbox", { name: "Portuguese" })
    fireEvent.change(editor, { target: { value: "Olá." } })
    fireEvent.blur(editor)
    expect(await screen.findByText("Saving…")).toBeTruthy()
    act(() => {
      release()
    })
    expect(await screen.findByText("Saved")).toBeTruthy()
  })

  it("asks for a session when none is open", () => {
    open(fakeApi(), null)
    expect(screen.getByRole("heading", { level: 1, name: "Session" })).toBeTruthy()
    expect(screen.getByText("Open a project from the menu to start a session.")).toBeTruthy()
  })
})
