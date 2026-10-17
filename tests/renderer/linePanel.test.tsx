// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiContext } from "../../src/renderer/api"
import { SessionPage } from "../../src/renderer/workspace/session/SessionPage"
import { fakeApi, FAKE_FLAGGED_LINE, type FakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

// A session where the AI translated lines 0, 2 and 3 (2 flagged) and you wrote line 1.
async function translatedSession(api: FakeApi): Promise<{ id: string; projectId: string }> {
  const project = await api.createProject("Demon Slayer", "pt-pt")
  const id = await api.newSession(project.id)
  await api.pickScriptForSession(id)
  await api.editLine(id, 1, "Onde vamos?")
  await api.runAi(id)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { id, projectId: project.id }
}

function open(api: FakeApi, id: string): void {
  render(
    <ApiContext.Provider value={api}>
      <SessionPage sessionId={id} />
    </ApiContext.Provider>,
  )
}

function grid(): HTMLElement {
  return screen.getByRole("grid", { name: "Lines" })
}

function panel(): HTMLElement {
  return screen.getByRole("complementary", { name: "Line" })
}

function editor(): HTMLTextAreaElement {
  return within(panel()).getByRole<HTMLTextAreaElement>("textbox", { name: "Portuguese" })
}

// Clicks a row once the list shows it.
async function select(text: string): Promise<void> {
  const list = await screen.findByRole("grid", { name: "Lines" })
  fireEvent.click(await within(list).findByText(text))
}

describe("line panel", () => {
  it("shows the line's meta, English and Portuguese", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    open(api, id)
    await select("pt: Hello.")
    expect(within(panel()).getByText("Line 1 · Tanjiro · 1.12 s · 20 characters max")).toBeTruthy()
    expect(within(panel()).getByText("Hello.")).toBeTruthy()
    expect(editor().value).toBe("pt: Hello.")
    await select("Run!")
    expect(
      within(panel()).getByText("Line 4 · no speaker · 0.80 s · 20 characters max"),
    ).toBeTruthy()
  })

  it("saves the edit after typing stops and updates the row", async () => {
    const api = fakeApi()
    const edit = vi.spyOn(api, "editLine")
    const { id } = await translatedSession(api)
    edit.mockClear()
    open(api, id)
    await select("pt: Hello.")
    fireEvent.change(editor(), { target: { value: "Olá" } })
    fireEvent.change(editor(), { target: { value: "Olá!" } })
    expect(edit).not.toHaveBeenCalled()
    await waitFor(
      () => {
        expect(edit).toHaveBeenCalledWith(id, 0, "Olá!")
      },
      { timeout: 2000 },
    )
    expect(edit).toHaveBeenCalledTimes(1)
    expect(await within(grid()).findByText("Olá!")).toBeTruthy()
    expect(editor().value).toBe("Olá!")
  })

  it("saves on blur without waiting", async () => {
    const api = fakeApi()
    const edit = vi.spyOn(api, "editLine")
    const { id } = await translatedSession(api)
    edit.mockClear()
    open(api, id)
    await select("pt: Hello.")
    fireEvent.change(editor(), { target: { value: "Olá." } })
    fireEvent.blur(editor())
    expect(edit).toHaveBeenCalledWith(id, 0, "Olá.")
    expect(await within(grid()).findByText("Olá.")).toBeTruthy()
  })

  it("keeps what you type while a save is in flight", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    const real = api.editLine.bind(api)
    let release: () => void = () => undefined
    api.editLine = (session, index, words) =>
      new Promise((resolve, reject) => {
        release = () => {
          real(session, index, words).then(resolve, reject)
        }
      })
    open(api, id)
    await select("pt: Hello.")
    fireEvent.change(editor(), { target: { value: "Olá" } })
    fireEvent.blur(editor())
    fireEvent.change(editor(), { target: { value: "Olá, amigo" } })
    await act(async () => {
      release()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(editor().value).toBe("Olá, amigo")
  })

  it("keeps a trailing space through a save, so you can keep typing", async () => {
    const api = fakeApi()
    const edit = vi.spyOn(api, "editLine")
    const { id } = await translatedSession(api)
    edit.mockClear()
    open(api, id)
    await select("pt: Hello.")
    fireEvent.change(editor(), { target: { value: "Olá " } })
    await waitFor(
      () => {
        expect(edit).toHaveBeenCalledWith(id, 0, "Olá ")
      },
      { timeout: 2000 },
    )
    expect(await within(grid()).findByText("Olá")).toBeTruthy()
    expect(editor().value).toBe("Olá ")
    fireEvent.change(editor(), { target: { value: `${editor().value}mundo` } })
    fireEvent.blur(editor())
    expect(await within(grid()).findByText("Olá mundo")).toBeTruthy()
    expect(editor().value).toBe("Olá mundo")
  })

  it("saves a pending edit when the window is about to close", async () => {
    const api = fakeApi()
    const edit = vi.spyOn(api, "editLine")
    const { id } = await translatedSession(api)
    edit.mockClear()
    open(api, id)
    await select("pt: Hello.")
    fireEvent.change(editor(), { target: { value: "Olá." } })
    expect(edit).not.toHaveBeenCalled()
    fireEvent(window, new Event("beforeunload"))
    expect(edit).toHaveBeenCalledWith(id, 0, "Olá.")
  })

  it("saves a pending edit when the page goes away", async () => {
    const api = fakeApi()
    const edit = vi.spyOn(api, "editLine")
    const { id } = await translatedSession(api)
    edit.mockClear()
    open(api, id)
    await select("pt: Hello.")
    fireEvent.change(editor(), { target: { value: "Olá." } })
    cleanup()
    expect(edit).toHaveBeenCalledWith(id, 0, "Olá.")
  })

  it("counts the visible characters and marks the count over the budget", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    open(api, id)
    await select("pt: Hello.")
    fireEvent.change(editor(), { target: { value: "{\\i1}Olá{\\i0}\\Nmundo" } })
    const count = within(panel()).getByText("8 / 20")
    expect(count.className).not.toContain("over")
    fireEvent.change(editor(), { target: { value: "x".repeat(21) } })
    const over = within(panel()).getByText("21 / 20")
    expect(over.className).toContain("over")
    expect(over.getAttribute("aria-live")).toBe("polite")
  })

  it("accepts a flagged line and clears the flag", async () => {
    const api = fakeApi()
    const accept = vi.spyOn(api, "acceptLine")
    const { id } = await translatedSession(api)
    open(api, id)
    await select("pt: Damn it!")
    expect(within(panel()).getByText("⚑ Check the tone.")).toBeTruthy()
    fireEvent.click(within(panel()).getByRole("button", { name: "Accept" }))
    await waitFor(() => {
      expect(within(panel()).queryByText("⚑ Check the tone.")).toBeNull()
    })
    expect(accept).toHaveBeenCalledWith(id, FAKE_FLAGGED_LINE)
    expect(within(grid()).queryByText("⚑")).toBeNull()
  })

  it("asks AI again with the hint, confirming first on a line you wrote", async () => {
    const api = fakeApi()
    const retranslate = vi.spyOn(api, "retranslate")
    const { id } = await translatedSession(api)
    open(api, id)
    await select("Onde vamos?")
    fireEvent.change(within(panel()).getByRole("textbox", { name: "Hint (optional)" }), {
      target: { value: "casual" },
    })
    fireEvent.click(within(panel()).getByRole("button", { name: "Ask AI again" }))
    expect(within(panel()).getByText("This replaces your translation. Ask anyway?")).toBeTruthy()
    fireEvent.click(within(panel()).getByRole("button", { name: "Cancel" }))
    expect(retranslate).not.toHaveBeenCalled()
    fireEvent.click(within(panel()).getByRole("button", { name: "Ask AI again" }))
    fireEvent.click(within(panel()).getByRole("button", { name: "Ask" }))
    expect(retranslate).toHaveBeenCalledWith(id, 1, "casual")
    await waitFor(() => {
      expect(editor().value).toBe("pt: Where are we going? (casual)")
    })
    expect(within(grid()).getByText("pt: Where are we going? (casual)")).toBeTruthy()
  })

  it("confirms before asking again after you edit an AI line, even once saved", async () => {
    const api = fakeApi()
    const retranslate = vi.spyOn(api, "retranslate")
    const { id } = await translatedSession(api)
    open(api, id)
    await select("pt: Hello.")
    fireEvent.change(editor(), { target: { value: "Olá." } })
    fireEvent.blur(editor())
    fireEvent.click(within(panel()).getByRole("button", { name: "Ask AI again" }))
    expect(within(panel()).getByText("This replaces your translation. Ask anyway?")).toBeTruthy()
    expect(retranslate).not.toHaveBeenCalled()
  })

  it("says Saving… from the first keystroke until the edit is saved", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    open(api, id)
    await select("pt: Hello.")
    expect(screen.getByText("Saved")).toBeTruthy()
    fireEvent.change(editor(), { target: { value: "Olá" } })
    expect(await screen.findByText("Saving…")).toBeTruthy()
    await waitFor(
      () => {
        expect(screen.getByText("Saved")).toBeTruthy()
      },
      { timeout: 2000 },
    )
  })

  it("asks AI again on an AI line without confirming", async () => {
    const api = fakeApi()
    const retranslate = vi.spyOn(api, "retranslate")
    const { id } = await translatedSession(api)
    open(api, id)
    await select("pt: Hello.")
    fireEvent.click(within(panel()).getByRole("button", { name: "Ask AI again" }))
    expect(retranslate).toHaveBeenCalledWith(id, 0, "")
    expect(within(panel()).queryByText("This replaces your translation. Ask anyway?")).toBeNull()
  })

  it("locks the editor while asking and says when your edit was kept", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    let answer: () => void = () => undefined
    api.retranslate = (session, index) =>
      new Promise((resolve) => {
        answer = () => {
          void api.editLine(session, index, "Mudei.").then((line) => {
            resolve({ line, keptEdit: true })
          })
        }
      })
    open(api, id)
    await select("pt: Hello.")
    fireEvent.click(within(panel()).getByRole("button", { name: "Ask AI again" }))
    expect(editor().disabled).toBe(true)
    await act(async () => {
      answer()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(editor().disabled).toBe(false)
    expect(editor().value).toBe("Mudei.")
    expect(
      within(panel()).getByText("Kept your edit; the AI's suggestion was not applied."),
    ).toBeTruthy()
  })

  it("shows a failed request in the panel", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    api.retranslate = () => Promise.reject(new Error("The provider is busy. Try again."))
    open(api, id)
    await select("pt: Hello.")
    fireEvent.click(within(panel()).getByRole("button", { name: "Ask AI again" }))
    expect(await within(panel()).findByText("The provider is busy. Try again.")).toBeTruthy()
  })

  it("drafts a rule, lets you edit it and saves it to the project", async () => {
    const api = fakeApi()
    const add = vi.spyOn(api, "addRule")
    const { id, projectId } = await translatedSession(api)
    open(api, id)
    await select("pt: Hello.")
    fireEvent.click(within(panel()).getByRole("button", { name: "Make a rule…" }))
    const dialog = await screen.findByRole("dialog", { name: "Make a rule" })
    const text = within(dialog).getByRole<HTMLTextAreaElement>("textbox", { name: "Rule" })
    expect(text.value).toBe('Translate "Hello." as "pt: Hello.".')
    expect(
      within(dialog).getByRole<HTMLInputElement>("radio", { name: "This project" }).checked,
    ).toBe(true)
    fireEvent.change(text, { target: { value: "Greet with Olá." } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(add).toHaveBeenCalledWith(
        { kind: "project", id: projectId },
        { kind: "prose", text: "Greet with Olá." },
      )
    })
    expect(await within(panel()).findByText("Rule saved")).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("saves a glossary entry to the language style", async () => {
    const api = fakeApi()
    const add = vi.spyOn(api, "addRule")
    const { id } = await translatedSession(api)
    open(api, id)
    await select("pt: Hello.")
    fireEvent.click(within(panel()).getByRole("button", { name: "Make a rule…" }))
    const dialog = await screen.findByRole("dialog", { name: "Make a rule" })
    fireEvent.click(within(dialog).getByRole("radio", { name: "Glossary entry" }))
    fireEvent.change(within(dialog).getByRole("textbox", { name: "English" }), {
      target: { value: "Hello" },
    })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Portuguese" }), {
      target: { value: "Olá" },
    })
    fireEvent.click(within(dialog).getByRole("radio", { name: "PT-PT style" }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(add).toHaveBeenCalledWith(
        { kind: "style", variant: "pt-pt" },
        { kind: "glossary", source: "Hello", pt: "Olá" },
      )
    })
  })

  it("closes the rule dialog on Escape without leaving the panel", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    open(api, id)
    await select("pt: Hello.")
    fireEvent.click(within(panel()).getByRole("button", { name: "Make a rule…" }))
    const dialog = await screen.findByRole("dialog", { name: "Make a rule" })
    fireEvent.keyDown(within(dialog).getByRole("textbox", { name: "Rule" }), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).not.toBe(grid())
  })

  it("returns to the list on Escape in the editor and saves", async () => {
    const api = fakeApi()
    const edit = vi.spyOn(api, "editLine")
    const { id } = await translatedSession(api)
    edit.mockClear()
    open(api, id)
    await select("pt: Hello.")
    editor().focus()
    fireEvent.change(editor(), { target: { value: "Olá." } })
    fireEvent.keyDown(editor(), { key: "Escape" })
    expect(document.activeElement).toBe(grid())
    expect(edit).toHaveBeenCalledWith(id, 0, "Olá.")
  })

  it("asks for a video when the session has none", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    open(api, id)
    await select("pt: Hello.")
    expect(await within(panel()).findByText("Attach a video to see frames")).toBeTruthy()
    expect(within(panel()).queryByRole("img")).toBeNull()
  })

  it("shows the line's frame once a video is attached", async () => {
    const api = fakeApi()
    const frame = vi.spyOn(api, "lineFrame")
    const { id } = await translatedSession(api)
    await api.pickVideoForSession(id)
    open(api, id)
    await select("pt: Hello.")
    expect(await within(panel()).findByRole("img", { name: "Frame for line 1" })).toBeTruthy()
    await select("pt: Run!")
    expect(await within(panel()).findByRole("img", { name: "Frame for line 4" })).toBeTruthy()
    await select("pt: Hello.")
    expect(await within(panel()).findByRole("img", { name: "Frame for line 1" })).toBeTruthy()
    expect(frame.mock.calls.filter(([, index]) => index === 0)).toHaveLength(1)
  })

  it("says when the video has no frame for the line", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    await api.pickVideoForSession(id)
    api.lineFrame = () => Promise.resolve(null)
    open(api, id)
    await select("pt: Hello.")
    expect(await within(panel()).findByText("Couldn't get the frame for this line.")).toBeTruthy()
    expect(within(panel()).queryByText("Attach a video to see frames")).toBeNull()
  })

  it("asks for a failed frame again when you come back to the line", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    await api.pickVideoForSession(id)
    const real = api.lineFrame.bind(api)
    let fail = true
    api.lineFrame = (session, index) =>
      fail ? Promise.reject(new Error("ffmpeg could not read the video.")) : real(session, index)
    open(api, id)
    await select("pt: Hello.")
    expect(await within(panel()).findByText("ffmpeg could not read the video.")).toBeTruthy()
    fail = false
    await select("pt: Run!")
    await select("pt: Hello.")
    expect(await within(panel()).findByRole("img", { name: "Frame for line 1" })).toBeTruthy()
  })

  it("says it is getting the frame while it loads", async () => {
    const api = fakeApi()
    const { id } = await translatedSession(api)
    await api.pickVideoForSession(id)
    api.lineFrame = () => new Promise(() => undefined)
    open(api, id)
    await select("pt: Hello.")
    expect(await within(panel()).findByText("Getting the frame…")).toBeTruthy()
  })
})
