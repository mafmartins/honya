// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiContext } from "../../src/renderer/api"
import { ProfilePage, type ProfileActions } from "../../src/renderer/workspace/pages/ProfilePage"
import { ProjectsPage } from "../../src/renderer/workspace/pages/ProjectsPage"
import type { Owner } from "../../src/shared/api"
import { fakeApi, type FakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function actions(): ProfileActions {
  return {
    onOpenSession: vi.fn(),
    onNewSession: vi.fn(),
    onDeleted: vi.fn(),
    onChanged: vi.fn(),
  }
}

function renderProfile(api: FakeApi, owner: Owner, given = actions()): ProfileActions {
  render(
    <ApiContext.Provider value={api}>
      <ProfilePage owner={owner} {...given} />
    </ApiContext.Provider>,
  )
  return given
}

function region(name: string): HTMLElement {
  return screen.getByRole("region", { name })
}

// Picks return ep01.pt-pt.ass, ep02.pt-pt.ass, … with one dialogue style; only Gemini has a key.
function learningApi(): FakeApi {
  let picks = 0
  return fakeApi({
    pickExample: () => {
      picks += 1
      return Promise.resolve({
        name: `ep0${String(picks)}.pt-pt.ass`,
        text: `x${String(picks)}`,
        styles: [{ name: "Default", guess: "dialogue" }],
      })
    },
    hasKey: (provider) => Promise.resolve(provider === "gemini"),
  })
}

describe("projects page", () => {
  it("lists projects with language, sessions and last activity, and opens one", async () => {
    const api = fakeApi()
    const frieren = await api.createProject("Frieren", "pt-br")
    await api.createProject("Akira", "pt-pt")
    await api.newSession(frieren.id)
    const onOpen = vi.fn()
    render(
      <ApiContext.Provider value={api}>
        <ProjectsPage onOpen={onOpen} />
      </ApiContext.Provider>,
    )
    const row = (await screen.findByText("Frieren")).closest("tr")
    expect(row).not.toBeNull()
    if (row === null) {
      return
    }
    expect(within(row).getByText("PT-BR (Brasil)")).toBeTruthy()
    expect(within(row).getByText("1")).toBeTruthy()
    expect(within(row).getByText("17 Oct 2026")).toBeTruthy()
    const names = screen.getAllByRole("row").map((item) => item.textContent)
    expect(names[1]).toContain("Akira")
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith(frieren.id)
  })

  it("creates a project and opens its page", async () => {
    const api = fakeApi()
    const onOpen = vi.fn()
    render(
      <ApiContext.Provider value={api}>
        <ProjectsPage onOpen={onOpen} />
      </ApiContext.Provider>,
    )
    expect(await screen.findByText("No projects yet.")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "New project" })[0] ?? document.body)
    const dialog = await screen.findByRole("dialog", { name: "New project" })
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Dandadan" } })
    fireEvent.change(within(dialog).getByLabelText("Portuguese"), { target: { value: "pt-br" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }))
    await waitFor(() => {
      expect(onOpen).toHaveBeenCalled()
    })
    const created = await api.listProjects()
    expect(created.map((item) => [item.name, item.variant])).toEqual([["Dandadan", "pt-br"]])
    expect(onOpen).toHaveBeenCalledWith(created[0]?.id)
  })
})

describe("project page", () => {
  it("shows inherited rules greyed and edits the project's own", async () => {
    const api = fakeApi()
    const project = await api.createProject("Frieren", "pt-pt")
    const owner: Owner = { kind: "project", id: project.id }
    await api.addRule({ kind: "style", variant: "pt-pt" }, { kind: "prose", text: "Use tu." })
    await api.addRule(
      { kind: "style", variant: "pt-pt" },
      { kind: "glossary", source: "Mage", pt: "Maga" },
    )
    await api.addRule(owner, { kind: "prose", text: "Keep -san." })
    renderProfile(api, owner)
    const rules = await screen.findByRole("region", { name: "Rules and glossary" })
    const inherited = (await within(rules).findByText("Use tu.")).closest("li")
    expect(inherited?.className).toContain("inherited")
    expect(inherited?.textContent).toContain("from PT-PT style")
    expect(within(rules).queryByRole("button", { name: "Edit “Use tu.”" })).toBeNull()
    expect(within(rules).getByText("Maga").closest("li")?.className).toContain("inherited")

    fireEvent.click(within(rules).getByRole("button", { name: "Edit “Keep -san.”" }))
    const field = within(rules).getByLabelText("Rule")
    expect(field instanceof HTMLInputElement && field.value).toBe("Keep -san.")
    fireEvent.change(field, { target: { value: "Keep -san and -sama." } })
    fireEvent.click(within(rules).getByRole("button", { name: "Save" }))
    expect(await within(rules).findByText("Keep -san and -sama.")).toBeTruthy()

    fireEvent.change(within(rules).getByLabelText("New glossary English"), {
      target: { value: "Demon" },
    })
    fireEvent.change(within(rules).getByLabelText("New glossary Portuguese"), {
      target: { value: "Demónio" },
    })
    fireEvent.click(within(rules).getByRole("button", { name: "Add to glossary" }))
    expect(await within(rules).findByText("Demónio")).toBeTruthy()
    await waitFor(async () => {
      expect((await api.getProject(project.id)).rules.own).toEqual([
        { kind: "prose", text: "Keep -san and -sama." },
        { kind: "glossary", source: "Demon", pt: "Demónio" },
      ])
    })

    fireEvent.change(within(rules).getByLabelText("Search rules and glossary"), {
      target: { value: "dem" },
    })
    expect(within(rules).queryByText("Use tu.")).toBeNull()
    expect(within(rules).queryByText("Keep -san and -sama.")).toBeNull()
    expect(within(rules).getByText("Demónio")).toBeTruthy()
    fireEvent.change(within(rules).getByLabelText("Search rules and glossary"), {
      target: { value: "" },
    })

    fireEvent.click(within(rules).getByRole("button", { name: "Delete “Keep -san and -sama.”" }))
    await waitFor(async () => {
      expect((await api.getProject(project.id)).rules.own).toEqual([
        { kind: "glossary", source: "Demon", pt: "Demónio" },
      ])
    })
  })

  it("switches characters per second to the style's value and back", async () => {
    const api = fakeApi()
    const project = await api.createProject("Frieren", "pt-pt")
    await api.updateProject(project.id, { cpsLimit: 20 })
    renderProfile(api, { kind: "project", id: project.id })
    const settings = await screen.findByRole("region", { name: "Project settings" })
    // The field starts over after each save, so it is looked up again each time.
    const input = (): HTMLInputElement => {
      const found = within(settings).getByLabelText("Characters per second")
      if (!(found instanceof HTMLInputElement)) {
        throw new Error("No characters per second field.")
      }
      return found
    }
    const inherit = (): HTMLElement =>
      within(settings).getByLabelText("Use the PT-PT style's value (17)")
    await waitFor(() => {
      expect(input().value).toBe("20")
    })
    const box = inherit()
    expect(box instanceof HTMLInputElement && box.checked).toBe(false)
    fireEvent.click(inherit())
    await waitFor(async () => {
      expect((await api.getProject(project.id)).cpsLimit).toBeNull()
    })
    await waitFor(() => {
      expect(input().disabled && input().value).toBe("17")
    })

    fireEvent.click(inherit())
    await waitFor(() => {
      expect(input().disabled).toBe(false)
    })
    expect((await api.getProject(project.id)).cpsLimit).toBe(17)
    fireEvent.change(input(), { target: { value: "61" } })
    expect(within(settings).getByText("Use a whole number from 1 to 60.")).toBeTruthy()
    const save = within(settings).getByRole("button", { name: "Save characters per second" })
    expect(save instanceof HTMLButtonElement && save.disabled).toBe(true)
    fireEvent.change(input(), { target: { value: "15" } })
    fireEvent.click(save)
    await waitFor(async () => {
      expect((await api.getProject(project.id)).cpsLimit).toBe(15)
    })
  })

  it("locks the language once the project has sessions", async () => {
    const api = fakeApi()
    const open = await api.createProject("Frieren", "pt-pt")
    renderProfile(api, { kind: "project", id: open.id })
    const language = await screen.findByLabelText("Portuguese")
    expect(language instanceof HTMLSelectElement && language.disabled).toBe(false)
    fireEvent.change(language, { target: { value: "pt-br" } })
    await waitFor(async () => {
      expect((await api.getProject(open.id)).summary.variant).toBe("pt-br")
    })
    cleanup()

    const locked = await api.createProject("Akira", "pt-pt")
    await api.newSession(locked.id)
    renderProfile(api, { kind: "project", id: locked.id })
    const select = await screen.findByLabelText("Portuguese")
    await waitFor(() => {
      expect(select instanceof HTMLSelectElement && select.disabled).toBe(true)
    })
    expect(screen.getByText("Fixed once the project has sessions.")).toBeTruthy()
  })

  it("saves the preset and frames for the project's sessions", async () => {
    const api = fakeApi()
    const project = await api.createProject("Frieren", "pt-pt")
    renderProfile(api, { kind: "project", id: project.id })
    fireEvent.change(await screen.findByLabelText("Quality"), { target: { value: "best" } })
    await waitFor(async () => {
      expect((await api.getProject(project.id)).preset).toBe("best")
    })
    fireEvent.change(screen.getByLabelText("Video frames"), { target: { value: "marked" } })
    await waitFor(async () => {
      expect((await api.getProject(project.id)).frameSetting).toBe("marked")
    })
  })

  it("opens sessions, starts new ones and marks them finished or reopens them", async () => {
    const api = fakeApi()
    const project = await api.createProject("Frieren", "pt-pt")
    const first = await api.newSession(project.id)
    await api.pickScriptForSession(first)
    const given = renderProfile(api, { kind: "project", id: project.id })
    const sessions = await screen.findByRole("region", { name: "Sessions" })
    const row = (await within(sessions).findByText("ep01.ass")).closest("tr")
    if (row === null) {
      throw new Error("No session row.")
    }
    expect(within(row).getByText("0 of 4 lines")).toBeTruthy()
    fireEvent.click(within(row).getByRole("button", { name: "Open" }))
    expect(given.onOpenSession).toHaveBeenCalledWith(project.id, first)
    fireEvent.click(within(sessions).getByRole("button", { name: "New session" }))
    expect(given.onNewSession).toHaveBeenCalledWith(project.id)

    fireEvent.click(within(row).getByRole("button", { name: "Mark finished" }))
    expect(await within(row).findByRole("button", { name: "Reopen" })).toBeTruthy()
    expect(within(row).getByText("Finished")).toBeTruthy()
    expect((await api.projectSessions(project.id))[0]?.finished).toBe(true)
    fireEvent.click(within(row).getByRole("button", { name: "Reopen" }))
    expect(await within(row).findByRole("button", { name: "Mark finished" })).toBeTruthy()
    expect((await api.projectSessions(project.id))[0]?.finished).toBe(false)
  })

  it("renames the project and deletes it after confirming", async () => {
    const api = fakeApi()
    const project = await api.createProject("Frieren", "pt-pt")
    await api.newSession(project.id)
    await api.newSession(project.id)
    const given = renderProfile(api, { kind: "project", id: project.id })
    expect(await screen.findByRole("heading", { level: 1, name: "Frieren" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Rename" }))
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Sousou no Frieren" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save name" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Sousou no Frieren" })).toBeTruthy()
    expect(given.onChanged).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    const dialog = await screen.findByRole("dialog", { name: "Delete Sousou no Frieren?" })
    expect(within(dialog).getByText("This also deletes its 2 sessions.")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }))
    await waitFor(() => {
      expect(given.onDeleted).toHaveBeenCalledWith(project.id)
    })
    expect(await api.listProjects()).toEqual([])
  })

  it("learns from each reference added, and saves kept suggestions where chosen", async () => {
    const api = learningApi()
    const learn = vi.spyOn(api, "learnFromScript")
    const project = await api.createProject("Kimetsu", "pt-pt")
    const owner: Owner = { kind: "project", id: project.id }
    renderProfile(api, owner)
    await screen.findByRole("region", { name: "Reference translations" })
    expect(
      within(region("Reference translations")).getByText("No reference translations yet."),
    ).toBeTruthy()

    // The styles chosen for the first file are reused for later ones.
    const addAndLearn = async (askStyles: boolean): Promise<void> => {
      const refs = region("Reference translations")
      fireEvent.click(
        await within(refs).findByRole("button", { name: "Add reference translations…" }),
      )
      if (askStyles) {
        fireEvent.click(await within(refs).findByRole("button", { name: "Use these styles" }))
      }
      await waitFor(() => {
        const select = within(refs).getByLabelText("Provider")
        expect(select instanceof HTMLSelectElement && select.value).toBe("gemini")
      })
      fireEvent.click(within(refs).getByRole("button", { name: "Learn" }))
      await within(refs).findByText(
        "Suggestions from 250 matched lines. Untick what you don't want.",
      )
    }

    await addAndLearn(true)
    const refs = region("Reference translations")
    expect(learn).toHaveBeenLastCalledWith(
      owner,
      "gemini",
      { text: "x1", dialogueStyles: ["Default"] },
      null,
    )
    expect(await within(refs).findByText("ep01.pt-pt.ass")).toBeTruthy()
    fireEvent.change(within(refs).getByLabelText("Save “Keep -san and -sama.” to"), {
      target: { value: "style" },
    })
    fireEvent.click(within(refs).getByRole("button", { name: "Save 2 suggestions" }))
    await waitFor(async () => {
      expect((await api.getProject(project.id)).rules.own).toEqual([
        { kind: "glossary", source: "Hashira", pt: "Pilar" },
      ])
    })
    expect((await api.getStyle("pt-pt")).rules).toEqual([
      { kind: "prose", text: "Keep -san and -sama." },
    ])

    await addAndLearn(false)
    expect(learn).toHaveBeenCalledTimes(2)
    expect(await within(region("Reference translations")).findByText("ep02.pt-pt.ass")).toBeTruthy()
    expect((await api.getProject(project.id)).references.map((item) => item.name)).toEqual([
      "ep01.pt-pt.ass",
      "ep02.pt-pt.ass",
    ])
  })

  it("learns from several episodes at once and ticks what more than one shows", async () => {
    const api = learningApi()
    const learn = vi.spyOn(api, "learnFromScript")
    const project = await api.createProject("Kimetsu", "pt-pt")
    renderProfile(api, { kind: "project", id: project.id })
    const refs = await screen.findByRole("region", { name: "Reference translations" })
    fireEvent.click(within(refs).getByRole("button", { name: "Add reference translations…" }))
    fireEvent.click(await within(refs).findByRole("button", { name: "Use these styles" }))
    // The second file has the same styles, so it is added without asking again.
    fireEvent.click(await within(refs).findByRole("button", { name: "Add another episode…" }))
    await within(refs).findByText("ep02.pt-pt.ass")
    await waitFor(() => {
      const select = within(refs).getByLabelText("Provider")
      expect(select instanceof HTMLSelectElement && select.value).toBe("gemini")
    })
    fireEvent.click(within(refs).getByRole("button", { name: "Learn from 2 episodes" }))
    expect(
      await within(refs).findByText(
        "Suggestions from 2 episodes (500 matched lines). Ones seen in more than one episode are ticked.",
      ),
    ).toBeTruthy()
    expect(learn).toHaveBeenCalledTimes(2)
    const rule = within(refs).getByLabelText("Keep -san and -sama.")
    expect(rule instanceof HTMLInputElement && rule.checked).toBe(false)
    fireEvent.click(within(refs).getByRole("button", { name: "Save 1 suggestion" }))
    await waitFor(async () => {
      expect((await api.getProject(project.id)).rules.own).toEqual([
        { kind: "glossary", source: "Hashira", pt: "Pilar" },
      ])
    })
  })
})

describe("language style page", () => {
  it("shows who uses it, edits its rules and characters per second", async () => {
    const api = fakeApi()
    await api.createProject("Frieren", "pt-pt")
    await api.createProject("Akira", "pt-pt")
    await api.createProject("Dandadan", "pt-br")
    const given = renderProfile(api, { kind: "style", variant: "pt-pt" })
    expect(await screen.findByRole("heading", { level: 1, name: "PT-PT style" })).toBeTruthy()
    expect(await screen.findByText("Used by 2 projects: Akira, Frieren.")).toBeTruthy()
    expect(screen.queryByText("from PT-PT style")).toBeNull()
    expect(screen.queryByLabelText("Portuguese")).toBeNull()
    expect(screen.queryByRole("region", { name: "Sessions" })).toBeNull()

    const rules = region("Rules and glossary")
    fireEvent.change(within(rules).getByLabelText("New rule"), { target: { value: "Use tu." } })
    fireEvent.click(within(rules).getByRole("button", { name: "Add rule" }))
    await waitFor(async () => {
      expect((await api.getStyle("pt-pt")).rules).toEqual([{ kind: "prose", text: "Use tu." }])
    })
    expect(within(rules).getByRole("button", { name: "Edit “Use tu.”" })).toBeTruthy()

    const input = screen.getByLabelText("Characters per second")
    expect(screen.queryByLabelText(/Use the PT-PT style's value/)).toBeNull()
    fireEvent.change(input, { target: { value: "15" } })
    fireEvent.click(screen.getByRole("button", { name: "Save characters per second" }))
    await waitFor(async () => {
      expect((await api.getStyle("pt-pt")).cpsLimit).toBe(15)
    })
    expect(given.onDeleted).not.toHaveBeenCalled()
  })

  it("saves learned suggestions to the style", async () => {
    const api = learningApi()
    const learn = vi.spyOn(api, "learnFromScript")
    renderProfile(api, { kind: "style", variant: "pt-pt" })
    const refs = await screen.findByRole("region", { name: "Reference translations" })
    fireEvent.click(within(refs).getByRole("button", { name: "Add reference translations…" }))
    fireEvent.click(await within(refs).findByRole("button", { name: "Use these styles" }))
    await waitFor(() => {
      const select = within(refs).getByLabelText("Provider")
      expect(select instanceof HTMLSelectElement && select.value).toBe("gemini")
    })
    fireEvent.click(within(refs).getByRole("button", { name: "Learn" }))
    await within(refs).findByText("Suggestions from 250 matched lines. Untick what you don't want.")
    expect(learn).toHaveBeenCalledWith(
      { kind: "style", variant: "pt-pt" },
      "gemini",
      { text: "x1", dialogueStyles: ["Default"] },
      null,
    )
    expect(within(refs).queryByLabelText(/^Save “/)).toBeNull()
    fireEvent.click(within(refs).getByRole("button", { name: "Save 2 suggestions" }))
    await waitFor(async () => {
      expect((await api.getStyle("pt-pt")).rules).toHaveLength(2)
    })
    expect((await api.getStyle("pt-pt")).references.map((item) => item.name)).toEqual([
      "ep01.pt-pt.ass",
    ])
  })
})
