// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../../src/renderer/App"
import type { SetupApi } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function openProfiles(api: SetupApi): Promise<void> {
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
    expect(confirm).toHaveBeenCalledWith("Delete Sousou no Frieren and its 1 rules?")
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

  it("saves model ids on blur and resets them", async () => {
    await openProfiles(fakeApi())
    const models = await screen.findByRole("region", { name: "model ids" })
    const cheap = await within(models).findByLabelText("claude cheap model")
    fireEvent.change(cheap, { target: { value: "claude-small" } })
    fireEvent.blur(cheap)
    await waitFor(() => {
      expect(cheap instanceof HTMLInputElement && cheap.value).toBe("claude-small")
    })
    fireEvent.click(within(models).getByRole("button", { name: "Reset claude models" }))
    await waitFor(() => {
      expect(cheap instanceof HTMLInputElement && cheap.value).toBe("claude-cheap")
    })
  })
})
