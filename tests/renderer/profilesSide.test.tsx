// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../../src/renderer/App"
import type { HonyaApi } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function openProfiles(api: HonyaApi): Promise<void> {
  render(<App api={api} />)
  fireEvent.click(await screen.findByRole("button", { name: "Profiles" }))
}

describe("profiles series keys and models", () => {
  it("renames a series, edits its rules and deletes it after confirming", async () => {
    const api = fakeApi()
    await api.createSeries("pt-pt", "Frieren")
    await openProfiles(api)
    const series = await screen.findByRole("region", { name: "series" })
    fireEvent.click(await within(series).findByRole("button", { name: "Rename Frieren" }))
    fireEvent.change(within(series).getByLabelText("series name"), {
      target: { value: "Sousou no Frieren" },
    })
    fireEvent.click(within(series).getByRole("button", { name: "Save name" }))
    fireEvent.click(await within(series).findByRole("button", { name: "Sousou no Frieren" }))
    fireEvent.change(await within(series).findByLabelText("rule text"), {
      target: { value: "Keep honorifics." },
    })
    fireEvent.click(within(series).getByRole("button", { name: "Add rule" }))
    expect(await within(series).findByText("Keep honorifics.")).toBeTruthy()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    fireEvent.click(within(series).getByRole("button", { name: "Delete Sousou no Frieren" }))
    expect(confirm).toHaveBeenCalledWith("Delete Sousou no Frieren and its 1 rule?")
    await waitFor(() => {
      expect(within(series).queryByText("Sousou no Frieren")).toBeNull()
    })
  })

  it("keeps a series when the delete is not confirmed", async () => {
    const api = fakeApi()
    await api.createSeries("pt-pt", "Frieren")
    await openProfiles(api)
    const series = await screen.findByRole("region", { name: "series" })
    vi.spyOn(window, "confirm").mockReturnValue(false)
    fireEvent.click(await within(series).findByRole("button", { name: "Delete Frieren" }))
    expect(within(series).getByRole("button", { name: "Frieren" })).toBeTruthy()
  })

  it("replaces and removes a provider key", async () => {
    const api = fakeApi()
    await openProfiles(api)
    const keys = await screen.findByRole("region", { name: "provider keys" })
    fireEvent.click(await within(keys).findByRole("button", { name: "Replace claude key" }))
    fireEvent.change(within(keys).getByLabelText("claude key"), { target: { value: "sk-1" } })
    fireEvent.click(within(keys).getByRole("button", { name: "Save key" }))
    expect(await within(keys).findByText("claude: saved")).toBeTruthy()
    fireEvent.click(within(keys).getByRole("button", { name: "Remove claude key" }))
    expect(await within(keys).findByText("claude: missing")).toBeTruthy()
  })

  it("says rules for any count other than one", async () => {
    const api = fakeApi()
    await api.createSeries("pt-pt", "Frieren")
    await openProfiles(api)
    const series = await screen.findByRole("region", { name: "series" })
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    fireEvent.click(await within(series).findByRole("button", { name: "Delete Frieren" }))
    expect(confirm).toHaveBeenCalledWith("Delete Frieren and its 0 rules?")
  })

  it("says so when the variant has no series", async () => {
    await openProfiles(fakeApi())
    const series = await screen.findByRole("region", { name: "series" })
    expect(within(series).getByText("No series yet. Create one on the start screen.")).toBeTruthy()
  })

  it("cancels a rename without saving", async () => {
    const api = fakeApi()
    await api.createSeries("pt-pt", "Frieren")
    await openProfiles(api)
    const series = await screen.findByRole("region", { name: "series" })
    fireEvent.click(await within(series).findByRole("button", { name: "Rename Frieren" }))
    fireEvent.change(within(series).getByLabelText("series name"), { target: { value: "Other" } })
    fireEvent.click(within(series).getByRole("button", { name: "Cancel" }))
    expect(within(series).getByRole("button", { name: "Frieren" })).toBeTruthy()
    expect(within(series).queryByLabelText("series name")).toBeNull()
  })

  it("cancels a key replacement", async () => {
    await openProfiles(fakeApi())
    const keys = await screen.findByRole("region", { name: "provider keys" })
    fireEvent.click(await within(keys).findByRole("button", { name: "Replace claude key" }))
    fireEvent.click(within(keys).getByRole("button", { name: "Cancel" }))
    expect(within(keys).queryByLabelText("claude key")).toBeNull()
    expect(within(keys).getByRole("button", { name: "Replace claude key" })).toBeTruthy()
  })

  it("saves model ids on blur and resets them", async () => {
    const api = fakeApi()
    await openProfiles(api)
    const models = await screen.findByRole("region", { name: "model ids" })
    const cheap = await within(models).findByLabelText("claude cheap model")
    fireEvent.change(cheap, { target: { value: "claude-small" } })
    fireEvent.blur(cheap)
    await waitFor(() => {
      expect(cheap instanceof HTMLInputElement && cheap.value).toBe("claude-small")
    })
    await waitFor(async () => {
      expect((await api.getModels("claude")).cheap).toBe("claude-small")
    })
    fireEvent.click(within(models).getByRole("button", { name: "Reset claude models" }))
    await waitFor(() => {
      expect(cheap instanceof HTMLInputElement && cheap.value).toBe("claude-cheap")
    })
  })
})

describe("learning from a translated episode", () => {
  it("suggests rules from an episode and saves the ones kept", async () => {
    const api = fakeApi({
      pickExample: () =>
        Promise.resolve({
          name: "ep01.pt-pt.ass",
          text: "x",
          styles: [{ name: "Default", guess: "dialogue" }],
        }),
      hasKey: (provider) => Promise.resolve(provider === "gemini"),
    })
    await api.createSeries("pt-pt", "Kimetsu")
    const learn = vi.spyOn(api, "learnFromScript")
    await openProfiles(api)
    const series = await screen.findByRole("region", { name: "series" })
    fireEvent.click(await within(series).findByRole("button", { name: "Kimetsu" }))
    fireEvent.click(
      await within(series).findByRole("button", { name: "Learn from a translated episode…" }),
    )
    fireEvent.click(await within(series).findByRole("button", { name: "Use these styles" }))
    await within(series).findByText("Translated episode: ep01.pt-pt.ass")
    await waitFor(() => {
      const select = within(series).getByLabelText("provider")
      expect(select instanceof HTMLSelectElement && select.value).toBe("gemini")
    })
    fireEvent.click(within(series).getByRole("button", { name: "Learn" }))
    expect(
      await within(series).findByText(
        "Suggestions from 250 matched lines. Untick what you don't want.",
      ),
    ).toBeTruthy()
    expect(learn).toHaveBeenCalledWith(
      "pt-pt",
      expect.any(String),
      "gemini",
      { text: "x", dialogueStyles: ["Default"] },
      null,
    )
    fireEvent.click(within(series).getByLabelText("Keep -san and -sama."))
    fireEvent.click(within(series).getByRole("button", { name: "Save 1 to the series" }))
    expect(await within(series).findByText("Hashira → Pilar")).toBeTruthy()
    expect(within(series).queryByText("Keep -san and -sama.")).toBeNull()
  })
})
