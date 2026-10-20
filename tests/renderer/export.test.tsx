// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { HonyaApi } from "../../src/shared/api"
import { ApiContext } from "../../src/renderer/api"
import { SessionPage } from "../../src/renderer/workspace/session/SessionPage"
import { fakeApi, FAKE_SCRIPT_PATH, type FakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

async function translatedSession(api: FakeApi): Promise<{ id: string; projectId: string }> {
  const project = await api.createProject("Demon Slayer", "pt-pt")
  const id = await api.newSession(project.id)
  await api.pickScriptForSession(id)
  await api.editLine(id, 1, "Onde vamos?")
  await api.runAi(id)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { id, projectId: project.id }
}

async function openDialog(api: FakeApi, id: string): Promise<HTMLElement> {
  render(
    <ApiContext.Provider value={api}>
      <SessionPage sessionId={id} />
    </ApiContext.Provider>,
  )
  fireEvent.click(await screen.findByRole("button", { name: "Export…" }))
  return screen.findByRole("dialog", { name: "Export" })
}

describe("export dialog", () => {
  it("offers Export… only once a script is loaded", async () => {
    const api = fakeApi()
    const project = await api.createProject("Empty", "pt-pt")
    const id = await api.newSession(project.id)
    render(
      <ApiContext.Provider value={api}>
        <SessionPage sessionId={id} />
      </ApiContext.Provider>,
    )
    await screen.findByText("Load script")
    expect(screen.queryByRole("button", { name: "Export…" })).toBeNull()
  })

  it("enables Export… when the session has a script", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    render(
      <ApiContext.Provider value={api}>
        <SessionPage sessionId={id} />
      </ApiContext.Provider>,
    )
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: "Export…" })
    expect(button.disabled).toBe(false)
  })

  it("summarises the counts and the default save location", async () => {
    const api = fakeApi({
      exportPreview: () =>
        Promise.resolve({
          translated: 288,
          english: 16,
          openFlags: 6,
          defaultPath: "/v/a.pt-pt.ass",
          suggestions: [],
        }),
    })
    const { id } = await translatedSession(api)
    const dialog = await openDialog(api, id)
    expect(
      await within(dialog).findByText(
        "288 translated · 16 still in English · 6 open flags will be written as notes",
      ),
    ).toBeTruthy()
    expect(within(dialog).getByText("/v/a.pt-pt.ass")).toBeTruthy()
  })

  it("says what it is doing while the preview loads", async () => {
    const never = (): Promise<never> => new Promise(() => undefined)
    const edited = fakeApi({ exportPreview: never })
    const { id } = await translatedSession(edited)
    const dialog = await openDialog(edited, id)
    expect(within(dialog).getByText("Looking at your edits…")).toBeTruthy()
    cleanup()
    const plain = fakeApi({ exportPreview: never })
    const project = await plain.createProject("Plain", "pt-pt")
    const other = await plain.newSession(project.id)
    await plain.pickScriptForSession(other)
    const second = await openDialog(plain, other)
    expect(within(second).getByText("Getting the export ready…")).toBeTruthy()
  })

  it("says all lines are translated when nothing is left", async () => {
    const api = fakeApi({
      exportPreview: () =>
        Promise.resolve({
          translated: 304,
          english: 0,
          openFlags: 0,
          defaultPath: "/v/a.pt-pt.ass",
          suggestions: [],
        }),
    })
    const { id } = await translatedSession(api)
    const dialog = await openDialog(api, id)
    expect(await within(dialog).findByText("All 304 lines translated.")).toBeTruthy()
    expect(within(dialog).queryByText("Rule suggestions from your edits")).toBeNull()
  })

  it("omits zero parts and uses the exact format", async () => {
    const api = fakeApi({
      exportPreview: () =>
        Promise.resolve({
          translated: 288,
          english: 16,
          openFlags: 6,
          defaultPath: "/v/a.pt-pt.ass",
          suggestions: [],
        }),
    })
    const { id } = await translatedSession(api)
    const dialog = await openDialog(api, id)
    expect(
      await within(dialog).findByText(
        "288 translated · 16 still in English · 6 open flags will be written as notes",
      ),
    ).toBeTruthy()
  })

  it("sends kept suggestions with their owner and drops unchecked ones", async () => {
    const write = vi.fn<HonyaApi["exportWrite"]>((_id, path) => Promise.resolve({ path }))
    const api = fakeApi({
      exportPreview: () =>
        Promise.resolve({
          translated: 4,
          english: 0,
          openFlags: 0,
          defaultPath: "/v/a.pt-pt.ass",
          suggestions: [
            { rule: { kind: "prose", text: "Keep it short." }, lines: [11, 39] },
            { rule: { kind: "glossary", source: "Hello", pt: "Olá" }, lines: [2] },
          ],
        }),
      exportWrite: write,
    })
    const { id } = await translatedSession(api)
    const dialog = await openDialog(api, id)
    expect(await within(dialog).findByText("from lines 12, 40")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Hello → Olá" }))
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Save “Keep it short.” to" }), {
      target: { value: "style" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Export" }))
    expect(await within(dialog).findByText("Saved to /v/a.pt-pt.ass")).toBeTruthy()
    expect(write).toHaveBeenCalledWith(id, "/v/a.pt-pt.ass", [
      {
        owner: { kind: "style", variant: "pt-pt" },
        rule: { kind: "prose", text: "Keep it short." },
      },
    ])
  })

  it("defaults suggestions to the project", async () => {
    const write = vi.fn<HonyaApi["exportWrite"]>((_id, path) => Promise.resolve({ path }))
    const api = fakeApi({ exportWrite: write })
    const { id, projectId } = await translatedSession(api)
    const dialog = await openDialog(api, id)
    await within(dialog).findByText("Rule suggestions from your edits")
    fireEvent.click(within(dialog).getByRole("button", { name: "Export" }))
    await within(dialog).findByText(/^Saved to/)
    expect(write.mock.calls[0]?.[2]).toEqual([
      {
        owner: { kind: "project", id: projectId },
        rule: { kind: "prose", text: "Keep the translator's wording." },
      },
    ])
  })

  it("shows the refusal of the source path and lets you pick another", async () => {
    const picks = [FAKE_SCRIPT_PATH, "/videos/other.ass"]
    const api = fakeApi()
    const pick = api.pickExportPath.bind(api)
    api.pickExportPath = () => pick(picks.shift() ?? "")
    const { id } = await translatedSession(api)
    const dialog = await openDialog(api, id)
    await within(dialog).findByText("Rule suggestions from your edits")
    fireEvent.click(within(dialog).getByRole("button", { name: "Change…" }))
    await within(dialog).findByText(FAKE_SCRIPT_PATH)
    fireEvent.click(within(dialog).getByRole("button", { name: "Export" }))
    expect((await within(dialog).findByRole("alert")).textContent).toContain("never overwrites")
    fireEvent.click(within(dialog).getByRole("button", { name: "Change…" }))
    await within(dialog).findByText("/videos/other.ass")
    fireEvent.click(within(dialog).getByRole("button", { name: "Export" }))
    expect(await within(dialog).findByText("Saved to /videos/other.ass")).toBeTruthy()
  })

  it("offers Show in Finder after saving and closes on Done", async () => {
    const reveal = vi.fn(() => Promise.resolve())
    const api = fakeApi({ revealPath: reveal })
    const { id } = await translatedSession(api)
    const dialog = await openDialog(api, id)
    await within(dialog).findByText("Rule suggestions from your edits")
    fireEvent.click(within(dialog).getByRole("button", { name: "Export" }))
    fireEvent.click(await within(dialog).findByRole("button", { name: "Show in Finder" }))
    await waitFor(() => {
      expect(reveal).toHaveBeenCalledWith(expect.stringMatching(/\.pt-pt\.ass$/))
    })
    expect(within(dialog).queryByRole("button", { name: "Start the next episode" })).toBeNull()
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }))
    expect(screen.queryByRole("dialog", { name: "Export" })).toBeNull()
  })

  it("offers to start the next episode in the same project once saved", async () => {
    const api = fakeApi()
    const { id, projectId } = await translatedSession(api)
    const next = vi.fn()
    render(
      <ApiContext.Provider value={api}>
        <SessionPage sessionId={id} onNewSession={next} />
      </ApiContext.Provider>,
    )
    fireEvent.click(await screen.findByRole("button", { name: "Export…" }))
    const dialog = await screen.findByRole("dialog", { name: "Export" })
    await within(dialog).findByText("Rule suggestions from your edits")
    expect(within(dialog).queryByRole("button", { name: "Start the next episode" })).toBeNull()
    fireEvent.click(within(dialog).getByRole("button", { name: "Export" }))
    fireEvent.click(await within(dialog).findByRole("button", { name: "Start the next episode" }))
    expect(next).toHaveBeenCalledWith(projectId)
    expect(screen.queryByRole("dialog", { name: "Export" })).toBeNull()
  })

  it("closes on Cancel and on Escape", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    let dialog = await openDialog(api, id)
    fireEvent.click(await within(dialog).findByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog", { name: "Export" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Export…" }))
    dialog = await screen.findByRole("dialog", { name: "Export" })
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Export" })).toBeNull()
  })
})
