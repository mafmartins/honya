// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ApiContext } from "../../src/renderer/api"
import { ProfilePage } from "../../src/renderer/workspace/pages/ProfilePage"
import { Shell } from "../../src/renderer/workspace/Shell"
import { fakeApi, FAKE_SCRIPT, FAKE_SCRIPT_NAME, type FakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

function menu(): HTMLElement {
  return screen.getByRole("navigation", { name: "Menu" })
}

async function withSession(api: FakeApi): Promise<{ projectId: string; sessionId: string }> {
  const project = await api.createProject("Demon Slayer", "pt-pt")
  const sessionId = await api.newSession(project.id)
  await api.pickScriptForSession(sessionId)
  return { projectId: project.id, sessionId }
}

// Boots past setup and closes the launch window, leaving the bare workspace.
async function renderShell(api: FakeApi): Promise<void> {
  await api.updateSettings({ setupDone: true })
  render(<Shell api={api} />)
  fireEvent.click(await screen.findByRole("button", { name: "Close" }))
}

describe("workspace shell", () => {
  it("shows the menu and switches pages", async () => {
    await renderShell(fakeApi())
    const nav = menu()
    expect(within(nav).getByText("Honya")).toBeTruthy()
    expect(within(nav).getByRole("combobox", { name: "Project" })).toBeTruthy()
    for (const name of [
      "Session",
      "Session stats",
      "Projects",
      "PT-PT style",
      "PT-BR style",
      "Settings",
    ]) {
      expect(within(nav).getByRole("button", { name })).toBeTruthy()
    }
    fireEvent.click(within(nav).getByRole("button", { name: "Settings" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeTruthy()
    expect(within(nav).getByRole("button", { name: "Settings" }).getAttribute("aria-current")).toBe(
      "page",
    )
    fireEvent.click(within(nav).getByRole("button", { name: "PT-BR style" }))
    expect(await screen.findByRole("heading", { level: 1, name: "PT-BR style" })).toBeTruthy()
    fireEvent.click(within(nav).getByRole("button", { name: "Session stats" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Session stats" })).toBeTruthy()
    fireEvent.click(within(nav).getByRole("button", { name: "Session" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Session" })).toBeTruthy()
  })

  it("lists projects in the switcher and opens Projects from Manage projects", async () => {
    const api = fakeApi()
    const project = await api.createProject("Frieren", "pt-br")
    await renderShell(api)
    const select = within(menu()).getByRole("combobox", { name: "Project" })
    expect(await within(select).findByRole("option", { name: "Frieren" })).toBeTruthy()
    fireEvent.change(select, { target: { value: project.id } })
    await waitFor(() => {
      expect((select as HTMLSelectElement).value).toBe(project.id)
    })
    fireEvent.change(select, { target: { value: "manage" } })
    expect(await screen.findByRole("heading", { level: 1, name: "Projects" })).toBeTruthy()
    expect((select as HTMLSelectElement).value).toBe(project.id)
  })

  it("opens a recent session and shows its summary, refreshed by AI events", async () => {
    const api = fakeApi()
    const { projectId, sessionId } = await withSession(api)
    await renderShell(api)
    const nav = menu()
    expect(within(nav).queryByRole("heading", { name: "This session" })).toBeNull()
    fireEvent.click(await within(nav).findByRole("button", { name: /ep01\.ass/ }))
    expect(await screen.findByRole("heading", { level: 1, name: FAKE_SCRIPT_NAME })).toBeTruthy()
    const box = await within(nav).findByRole("region", { name: "This session" })
    expect(
      await within(box).findByText(`0 of ${String(FAKE_SCRIPT.length)} lines translated`),
    ).toBeTruthy()
    expect(within(box).getByText("0 open flags")).toBeTruthy()
    expect(within(nav).getByRole<HTMLSelectElement>("combobox", { name: "Project" }).value).toBe(
      projectId,
    )
    await api.runAi(sessionId)
    expect(
      await within(box).findByText(
        `${String(FAKE_SCRIPT.length)} of ${String(FAKE_SCRIPT.length)} lines translated`,
      ),
    ).toBeTruthy()
    expect(within(box).getByText("1 open flag")).toBeTruthy()
    // $0.01 at the fake's 0.92 rate.
    expect(within(box).getByText("≈ €0.01 so far")).toBeTruthy()
    // The summary stays while another page is shown.
    fireEvent.click(within(nav).getByRole("button", { name: "Settings" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeTruthy()
    expect(within(nav).getByRole("region", { name: "This session" })).toBeTruthy()
    expect(within(nav).getByRole("button", { name: new RegExp(FAKE_SCRIPT_NAME) })).toBeTruthy()
  })

  it("starts a new session in the chosen project from Recent sessions", async () => {
    const api = fakeApi()
    const { projectId, sessionId } = await withSession(api)
    await api.setFinished(sessionId, true)
    await renderShell(api)
    const nav = menu()
    expect(within(nav).queryByRole("button", { name: "+ New" })).toBeNull()
    fireEvent.click(await within(nav).findByRole("button", { name: /ep01\.ass/ }))
    expect(await screen.findByRole("heading", { level: 1, name: FAKE_SCRIPT_NAME })).toBeTruthy()
    fireEvent.click(within(nav).getByRole("button", { name: "+ New" }))
    expect(await screen.findByRole("button", { name: "Load script" })).toBeTruthy()
    const sessions = await api.projectSessions(projectId)
    expect(sessions).toHaveLength(2)
  })

  it("refreshes the session summary when an edit saves the session", async () => {
    const api = fakeApi()
    const { sessionId } = await withSession(api)
    await renderShell(api)
    const nav = menu()
    fireEvent.click(await within(nav).findByRole("button", { name: /ep01\.ass/ }))
    const box = await within(nav).findByRole("region", { name: "This session" })
    expect(
      await within(box).findByText(`0 of ${String(FAKE_SCRIPT.length)} lines translated`),
    ).toBeTruthy()
    await act(async () => {
      await api.editLine(sessionId, 0, "Olá.")
    })
    expect(
      await within(box).findByText(`1 of ${String(FAKE_SCRIPT.length)} lines translated`),
    ).toBeTruthy()
  })

  it("goes to Projects after deleting the open session's project", async () => {
    const api = fakeApi()
    const { projectId } = await withSession(api)
    await renderShell(api)
    fireEvent.click(await within(menu()).findByRole("button", { name: /Demon Slayer/ }))
    expect(await within(menu()).findByRole("heading", { name: "This session" })).toBeTruthy()
    const select = within(menu()).getByRole("combobox", { name: "Project" })
    expect((select as HTMLSelectElement).value).toBe(projectId)
    fireEvent.click(within(menu()).getByRole("button", { name: "Projects" }))
    fireEvent.click(await screen.findByRole("button", { name: "Demon Slayer" }))
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }))
    const dialog = await screen.findByRole("dialog", { name: "Delete Demon Slayer?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }))
    expect(await screen.findByText("No projects yet.")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 1, name: "Projects" })).toBeTruthy()
    expect(within(menu()).queryByRole("heading", { name: "This session" })).toBeNull()
    await waitFor(() => {
      expect(within(select).queryByRole("option", { name: "Demon Slayer" })).toBeNull()
    })
  })

  it("titles a project's page with its name", async () => {
    const api = fakeApi()
    const project = await api.createProject("Frieren", "pt-br")
    render(
      <ApiContext.Provider value={api}>
        <ProfilePage
          owner={{ kind: "project", id: project.id }}
          onOpenSession={() => undefined}
          onNewSession={() => undefined}
          onDeleted={() => undefined}
          onChanged={() => undefined}
        />
      </ApiContext.Provider>,
    )
    expect(await screen.findByRole("heading", { level: 1, name: "Frieren" })).toBeTruthy()
  })
})
