// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../../src/renderer/App"
import type { SeriesList, Variant } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("start screen", () => {
  it("shows the picked script's name and keeps it after a cancelled pick", async () => {
    let pick: { path: string; name: string; text: string } | null = {
      path: "/s/ep01.ass",
      name: "ep01.ass",
      text: "x",
    }
    render(<App api={fakeApi({ pickScript: () => Promise.resolve(pick) })} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose script…" }))
    expect(await screen.findByText("ep01.ass")).toBeTruthy()
    pick = null
    fireEvent.click(screen.getByRole("button", { name: "Choose script…" }))
    await waitFor(() => {
      expect(screen.getByText("ep01.ass")).toBeTruthy()
    })
  })

  it("shows the error when the script can't be read", async () => {
    const api = fakeApi({
      pickScript: () =>
        Promise.reject(new Error("notes.ass has no dialogue lines. Is it an ASS script?")),
    })
    render(<App api={api} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose script…" }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "notes.ass has no dialogue lines. Is it an ASS script?",
    )
  })

  it("creates a series and selects it", async () => {
    render(<App api={fakeApi()} />)
    const picker = await screen.findByLabelText("series")
    fireEvent.change(picker, { target: { value: "__new__" } })
    fireEvent.change(screen.getByLabelText("new series name"), { target: { value: "Frieren" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    await waitFor(() => {
      const select = screen.getByLabelText("series")
      expect(select instanceof HTMLSelectElement && select.selectedOptions[0]?.text).toBe("Frieren")
    })
  })

  it("shows a refused name in the error line", async () => {
    const api = fakeApi({
      createSeries: () =>
        Promise.reject(new Error("A series called Frieren already exists for pt-pt.")),
    })
    render(<App api={api} />)
    fireEvent.change(await screen.findByLabelText("series"), { target: { value: "__new__" } })
    fireEvent.change(screen.getByLabelText("new series name"), { target: { value: "frieren" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "A series called Frieren already exists for pt-pt.",
    )
  })

  it("reloads series for the new variant and ignores a late reply for the old one", async () => {
    let releasePt: (list: SeriesList) => void = () => undefined
    const api = fakeApi({
      listSeries: (variant: Variant) =>
        variant === "pt-pt"
          ? new Promise<SeriesList>((resolve) => {
              releasePt = resolve
            })
          : Promise.resolve({
              series: [{ id: "b", name: "Mushishi", ruleCount: 0 }],
              problems: [],
            }),
    })
    render(<App api={api} />)
    fireEvent.change(screen.getByLabelText("variant"), { target: { value: "pt-br" } })
    expect(await screen.findByRole("option", { name: "Mushishi" })).toBeTruthy()
    releasePt({ series: [{ id: "a", name: "Frieren", ruleCount: 0 }], problems: [] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole("option", { name: "Frieren" })).toBeNull()
  })

  it("drops the old variant's series as soon as the variant changes", async () => {
    let releaseBr: (list: SeriesList) => void = () => undefined
    const api = fakeApi({
      listSeries: (variant: Variant) =>
        variant === "pt-pt"
          ? Promise.resolve({ series: [{ id: "a", name: "Frieren", ruleCount: 0 }], problems: [] })
          : new Promise<SeriesList>((resolve) => {
              releaseBr = resolve
            }),
    })
    render(<App api={api} />)
    expect(await screen.findByRole("option", { name: "Frieren" })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("variant"), { target: { value: "pt-br" } })
    expect(screen.queryByRole("option", { name: "Frieren" })).toBeNull()
    releaseBr({ series: [{ id: "b", name: "Mushishi", ruleCount: 0 }], problems: [] })
    expect(await screen.findByRole("option", { name: "Mushishi" })).toBeTruthy()
  })

  it("asks for a key only when the provider has none, and hides it after saving", async () => {
    render(<App api={fakeApi()} />)
    const field = await screen.findByLabelText("claude key")
    fireEvent.change(field, { target: { value: "sk-test" } })
    fireEvent.click(screen.getByRole("button", { name: "Save key" }))
    await waitFor(() => {
      expect(screen.queryByLabelText("claude key")).toBeNull()
    })
    fireEvent.change(screen.getByLabelText("provider"), { target: { value: "gpt" } })
    expect(await screen.findByLabelText("gpt key")).toBeTruthy()
  })

  it("clears the typed key when the provider changes", async () => {
    render(<App api={fakeApi()} />)
    fireEvent.change(await screen.findByLabelText("claude key"), { target: { value: "sk-claude" } })
    fireEvent.change(screen.getByLabelText("provider"), { target: { value: "gpt" } })
    const field = await screen.findByLabelText("gpt key")
    expect(field instanceof HTMLInputElement && field.value).toBe("")
    expect(screen.queryByLabelText("claude key")).toBeNull()
  })

  it("disables the frame setting until a video is chosen", async () => {
    const api = fakeApi({
      pickVideo: () => Promise.resolve({ path: "/v/ep01.mkv", name: "ep01.mkv" }),
    })
    render(<App api={api} />)
    const frames = screen.getByLabelText("frame setting")
    expect(frames instanceof HTMLSelectElement && frames.disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Choose video…" }))
    expect((await screen.findByText("ep01.mkv")).getAttribute("title")).toBe("ep01.mkv")
    expect(frames instanceof HTMLSelectElement && frames.disabled).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "Clear video" }))
    expect(frames instanceof HTMLSelectElement && frames.disabled).toBe(true)
  })

  it("keeps the start choices after visiting profiles", async () => {
    render(<App api={fakeApi()} />)
    fireEvent.change(screen.getByLabelText("preset"), { target: { value: "best" } })
    fireEvent.click(screen.getByRole("button", { name: "Profiles" }))
    fireEvent.click(await screen.findByRole("button", { name: "Back" }))
    const preset = await screen.findByLabelText("preset")
    expect(preset instanceof HTMLSelectElement && preset.value).toBe("best")
  })

  it("forgets a series deleted on the profiles screen", async () => {
    const frieren = { id: "x", name: "Frieren", ruleCount: 0 }
    let items = [frieren]
    const api = fakeApi({
      listSeries: () => Promise.resolve({ series: items, problems: [] }),
      deleteSeries: () => {
        items = []
        return Promise.resolve()
      },
    })
    render(<App api={api} />)
    fireEvent.change(await screen.findByLabelText("series"), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: "Profiles" }))
    vi.spyOn(window, "confirm").mockReturnValue(true)
    fireEvent.click(await screen.findByRole("button", { name: "Delete Frieren" }))
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Delete Frieren" })).toBeNull()
    })
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: "Frieren" })).toBeNull()
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    items = [frieren]
    fireEvent.click(screen.getByRole("button", { name: "Profiles" }))
    fireEvent.click(await screen.findByRole("button", { name: "Back" }))
    expect(await screen.findByRole("option", { name: "Frieren" })).toBeTruthy()
    const select = screen.getByLabelText("series")
    expect(select instanceof HTMLSelectElement && select.value).toBe("")
  })

  it("enables Translate only with a script, a series and a key, then opens the Translate screen", async () => {
    const api = fakeApi({
      pickScript: () => Promise.resolve({ path: "/s/ep01.ass", name: "ep01.ass", text: "x" }),
      listSeries: () =>
        Promise.resolve({ series: [{ id: "a", name: "Frieren", ruleCount: 0 }], problems: [] }),
    })
    render(<App api={api} />)
    const button = screen.getByRole("button", { name: "Translate" })
    expect(button instanceof HTMLButtonElement && button.disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Choose script…" }))
    await screen.findByText("ep01.ass")
    fireEvent.change(await screen.findByLabelText("series"), { target: { value: "a" } })
    expect(button instanceof HTMLButtonElement && button.disabled).toBe(true)
    fireEvent.change(await screen.findByLabelText("claude key"), { target: { value: "sk-test" } })
    fireEvent.click(screen.getByRole("button", { name: "Save key" }))
    await waitFor(() => {
      expect(button instanceof HTMLButtonElement && button.disabled).toBe(false)
    })
    fireEvent.click(button)
    expect(await screen.findByText("Translate")).toBeTruthy()
  })

  it("shows the unfinished translation and resumes it", async () => {
    const api = fakeApi({
      latestUnfinished: () =>
        Promise.resolve({
          id: "s1",
          scriptName: "ep01.ass",
          seriesName: "Frieren",
          phase: "stopped",
          completedBatches: 2,
          totalBatches: 5,
          openFlags: 0,
        }),
    })
    render(<App api={api} />)
    expect(await screen.findByText("Unfinished: ep01.ass · Frieren · batch 2 of 5")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Resume" }))
    expect(await screen.findByText("Translate")).toBeTruthy()
  })

  it("describes a session in review by its open flags", async () => {
    const api = fakeApi({
      latestUnfinished: () =>
        Promise.resolve({
          id: "s1",
          scriptName: "ep01.ass",
          seriesName: "Frieren",
          phase: "review",
          completedBatches: 5,
          totalBatches: 5,
          openFlags: 3,
        }),
    })
    render(<App api={api} />)
    expect(
      await screen.findByText("Unfinished: ep01.ass · Frieren · in review, 3 flags left"),
    ).toBeTruthy()
  })

  it("discards the unfinished translation after confirming", async () => {
    const discard = vi.fn(() => Promise.resolve())
    const api = fakeApi({
      latestUnfinished: () =>
        Promise.resolve({
          id: "s1",
          scriptName: "ep01.ass",
          seriesName: "Frieren",
          phase: "failed",
          completedBatches: 1,
          totalBatches: 4,
          openFlags: 0,
        }),
      discardTranslation: discard,
    })
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    render(<App api={api} />)
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }))
    expect(confirm).toHaveBeenCalledWith("Discard this translation? Finished batches will be lost.")
    await waitFor(() => {
      expect(screen.queryByText(/^Unfinished:/)).toBeNull()
    })
    expect(discard).toHaveBeenCalledWith("s1")
  })

  it("keeps the card when the discard is not confirmed", async () => {
    const discard = vi.fn(() => Promise.resolve())
    const api = fakeApi({
      latestUnfinished: () =>
        Promise.resolve({
          id: "s1",
          scriptName: "ep01.ass",
          seriesName: "Frieren",
          phase: "failed",
          completedBatches: 1,
          totalBatches: 4,
          openFlags: 0,
        }),
      discardTranslation: discard,
    })
    vi.spyOn(window, "confirm").mockReturnValue(false)
    render(<App api={api} />)
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }))
    expect(discard).not.toHaveBeenCalled()
    expect(screen.getByText(/^Unfinished:/)).toBeTruthy()
  })

  it("shows no card when nothing is unfinished", async () => {
    render(<App api={fakeApi()} />)
    await screen.findByLabelText("series")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText(/^Unfinished:/)).toBeNull()
  })
})
