// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "../../src/renderer/App"
import type { SeriesList, Variant } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
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

  it("disables the frame setting until a video is chosen", async () => {
    const api = fakeApi({
      pickVideo: () => Promise.resolve({ path: "/v/ep01.mkv", name: "ep01.mkv" }),
    })
    render(<App api={api} />)
    const frames = screen.getByLabelText("frame setting")
    expect(frames instanceof HTMLSelectElement && frames.disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Choose video…" }))
    expect(await screen.findByText("ep01.mkv")).toBeTruthy()
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
})
