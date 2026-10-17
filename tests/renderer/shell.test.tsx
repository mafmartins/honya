// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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

  it("titles a project's page with its name", async () => {
    const api = fakeApi()
    const project = await api.createProject("Frieren", "pt-br")
    render(
      <ApiContext.Provider value={api}>
        <ProfilePage owner={{ kind: "project", id: project.id }} />
      </ApiContext.Provider>,
    )
    expect(await screen.findByRole("heading", { level: 1, name: "Frieren" })).toBeTruthy()
  })
})
