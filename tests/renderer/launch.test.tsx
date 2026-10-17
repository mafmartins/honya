// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LaunchDialog } from "../../src/renderer/workspace/LaunchDialog"
import { Shell } from "../../src/renderer/workspace/Shell"
import { fakeApi, FAKE_SCRIPT_NAME, type FakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

async function ready(api: FakeApi): Promise<void> {
  await api.updateSettings({ setupDone: true })
}

describe("launch dialog", () => {
  it("offers Continue with progress, project rows and a new project form", async () => {
    const api = fakeApi()
    const project = await api.createProject("Frieren", "pt-br")
    const id = await api.newSession(project.id)
    await api.pickScriptForSession(id)
    const info = await api.launchInfo()
    const handlers = {
      onContinue: vi.fn(() => Promise.resolve()),
      onOpenProject: vi.fn(() => Promise.resolve()),
      onNewSession: vi.fn(() => Promise.resolve()),
      onCreateProject: vi.fn(() => Promise.resolve()),
      onClose: vi.fn(),
    }
    render(<LaunchDialog info={info} defaultVariant="pt-br" {...handlers} />)
    const dialog = screen.getByRole("dialog", { name: "What are we working on?" })
    expect(within(dialog).getByText(/ep01\.ass/)).toBeTruthy()
    expect(within(dialog).getByText(/lines/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue session" }))
    expect(handlers.onContinue).toHaveBeenCalledWith(id)
    await act(() => Promise.resolve())
    fireEvent.click(within(dialog).getByRole("button", { name: /Frieren/ }))
    expect(handlers.onOpenProject).toHaveBeenCalledWith(project.id)
    await act(() => Promise.resolve())
    fireEvent.click(within(dialog).getByRole("button", { name: "New session" }))
    expect(handlers.onNewSession).toHaveBeenCalledWith(project.id)
    await act(() => Promise.resolve())
    expect(within(dialog).getByLabelText<HTMLSelectElement>("Portuguese").value).toBe("pt-br")
    const create = within(dialog).getByRole("button", { name: "Create" })
    expect((create as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText("Series name"), {
      target: { value: "Dandadan" },
    })
    fireEvent.click(create)
    expect(handlers.onCreateProject).toHaveBeenCalledWith("Dandadan", "pt-br")
  })

  it("closes with Esc and the close button, and keeps Tab inside", () => {
    const onClose = vi.fn()
    const noop = (): Promise<void> => Promise.resolve()
    render(
      <LaunchDialog
        info={{ setupDone: true, continueSession: null, projects: [] }}
        defaultVariant="pt-pt"
        onContinue={noop}
        onOpenProject={noop}
        onNewSession={noop}
        onCreateProject={noop}
        onClose={onClose}
      />,
    )
    const dialog = screen.getByRole("dialog")
    expect(screen.queryByRole("button", { name: "Continue session" })).toBeNull()
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Series name"))
    const close = within(dialog).getByRole("button", { name: "Close" })
    close.focus()
    fireEvent.keyDown(close, { key: "Tab" })
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Series name"))
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe("shell boot", () => {
  it("shows setup first, then the launch window", async () => {
    const api = fakeApi()
    render(<Shell api={api} />)
    expect(await screen.findByRole("dialog", { name: "Welcome to Honya" })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "sk-good" } })
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    await screen.findByText("✓ Claude answered")
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }))
    expect(await screen.findByRole("dialog", { name: "What are we working on?" })).toBeTruthy()
  })

  it("continues a session from the launch window", async () => {
    const api = fakeApi()
    await ready(api)
    const project = await api.createProject("Frieren", "pt-pt")
    const id = await api.newSession(project.id)
    await api.pickScriptForSession(id)
    render(<Shell api={api} />)
    fireEvent.click(await screen.findByRole("button", { name: "Continue session" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    await waitFor(() => {
      expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Project" }).value).toBe(
        project.id,
      )
    })
    expect(await screen.findByRole("heading", { level: 1, name: FAKE_SCRIPT_NAME })).toBeTruthy()
  })

  it("opens a project on its latest unfinished session, or a new one", async () => {
    const api = fakeApi()
    await ready(api)
    const project = await api.createProject("Frieren", "pt-pt")
    const done = await api.newSession(project.id)
    await api.pickScriptForSession(done)
    await api.setFinished(done, true)
    const open = await api.newSession(project.id)
    const other = await api.createProject("Dandadan", "pt-br")
    render(<Shell api={api} />)
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: /Frieren/ }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    await waitFor(async () => {
      expect((await api.projectSessions(project.id)).length).toBe(2)
    })
    await waitFor(() => {
      expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Project" }).value).toBe(
        project.id,
      )
    })
    // The menu switcher opens a project without sessions on a new empty one.
    fireEvent.change(screen.getByRole("combobox", { name: "Project" }), {
      target: { value: other.id },
    })
    await waitFor(async () => {
      expect((await api.projectSessions(other.id)).length).toBe(1)
    })
    expect(open).toBeTruthy()
  })

  it("creates a project and lands on its empty session", async () => {
    const api = fakeApi()
    await ready(api)
    render(<Shell api={api} />)
    const dialog = await screen.findByRole("dialog", { name: "What are we working on?" })
    fireEvent.change(within(dialog).getByLabelText("Series name"), {
      target: { value: "Dandadan" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    const projects = await api.listProjects()
    expect(projects.map((item) => item.name)).toEqual(["Dandadan"])
    const sessions = await api.projectSessions(projects[0]?.id ?? "")
    expect(sessions).toHaveLength(1)
    await waitFor(() => {
      expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Project" }).value).toBe(
        projects[0]?.id,
      )
    })
  })

  it("closes the launch window with Esc", async () => {
    const api = fakeApi()
    await ready(api)
    render(<Shell api={api} />)
    const dialog = await screen.findByRole("dialog")
    fireEvent.keyDown(dialog, { key: "Escape" })
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
  })
})
