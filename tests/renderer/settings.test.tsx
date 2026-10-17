// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defaultModels } from "../../src/core/providers/models"
import { ApiContext } from "../../src/renderer/api"
import { SettingsPage } from "../../src/renderer/workspace/pages/SettingsPage"
import { fakeApi, type FakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderSettings(api: FakeApi): void {
  render(
    <ApiContext.Provider value={api}>
      <SettingsPage />
    </ApiContext.Provider>,
  )
}

function keyRow(name: string): HTMLElement {
  const row = screen.getByText(name).closest("li")
  if (row === null) {
    throw new Error(`No key row for ${name}.`)
  }
  return row
}

describe("settings page", () => {
  it("adds a key after testing it, and replaces and removes saved ones", async () => {
    const api = fakeApi()
    await api.setKey("claude", "sk-claude")
    const setKey = vi.spyOn(api, "setKey")
    renderSettings(api)
    await screen.findByText("Claude · saved")
    expect(
      within(keyRow("Claude · saved")).queryByRole("button", { name: "Test the key" }),
    ).toBeNull()

    fireEvent.click(within(keyRow("GPT · no key")).getByRole("button", { name: "Add" }))
    const field = screen.getByLabelText("GPT key")
    fireEvent.change(field, { target: { value: "bad-key" } })
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    expect(await screen.findByText("The key was rejected.")).toBeTruthy()
    fireEvent.change(field, { target: { value: "sk-gpt" } })
    expect(screen.queryByText("The key was rejected.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    expect(await screen.findByText("✓ GPT answered")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save key" }))
    expect(await screen.findByText("GPT · saved")).toBeTruthy()
    expect(setKey).toHaveBeenCalledWith("gpt", "sk-gpt")

    fireEvent.click(within(keyRow("Claude · saved")).getByRole("button", { name: "Replace" }))
    expect(screen.getByLabelText("Claude key")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    fireEvent.click(within(keyRow("Claude · saved")).getByRole("button", { name: "Remove" }))
    const dialog = await screen.findByRole("dialog", { name: "Remove the Claude key?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }))
    expect(await screen.findByText("Claude · no key")).toBeTruthy()
    expect(await api.hasKey("claude")).toBe(false)
  })

  it("saves the default provider, the defaults for new projects and the euro rate", async () => {
    const api = fakeApi()
    renderSettings(api)
    fireEvent.change(await screen.findByLabelText("Default provider"), {
      target: { value: "gemini" },
    })
    await waitFor(async () => {
      expect((await api.getSettings()).defaultProvider).toBe("gemini")
    })
    fireEvent.change(screen.getByLabelText("Portuguese"), { target: { value: "pt-br" } })
    await waitFor(async () => {
      expect((await api.getSettings()).defaults.variant).toBe("pt-br")
    })
    fireEvent.change(screen.getByLabelText("Quality"), { target: { value: "best" } })
    fireEvent.change(screen.getByLabelText("Video frames"), { target: { value: "every" } })
    await waitFor(async () => {
      expect((await api.getSettings()).defaults).toEqual({
        variant: "pt-br",
        preset: "best",
        frameSetting: "every",
      })
    })

    const rate = screen.getByLabelText("Euro rate (USD → EUR)")
    expect(rate instanceof HTMLInputElement && rate.value).toBe("0.92")
    const save = screen.getByRole("button", { name: "Save rate" })
    fireEvent.change(rate, { target: { value: "0" } })
    expect(
      screen.getByText("Enter a rate above zero with up to two decimals, like 0.86."),
    ).toBeTruthy()
    expect(save instanceof HTMLButtonElement && save.disabled).toBe(true)
    fireEvent.change(rate, { target: { value: "0.861" } })
    expect(save instanceof HTMLButtonElement && save.disabled).toBe(true)
    fireEvent.change(rate, { target: { value: "0.88" } })
    fireEvent.click(save)
    await waitFor(async () => {
      expect((await api.getSettings()).eurRate).toBe(0.88)
    })
  })

  it("goes back to the saved settings when a change is refused", async () => {
    const api = fakeApi({
      updateSettings: () => Promise.reject(new Error("Couldn't save the settings.")),
    })
    renderSettings(api)
    const provider = await screen.findByLabelText("Default provider")
    fireEvent.change(provider, { target: { value: "gemini" } })
    expect(provider instanceof HTMLSelectElement && provider.value).toBe("gemini")
    await waitFor(() => {
      expect(provider instanceof HTMLSelectElement && provider.value).toBe("claude")
    })
  })

  it("tests the key without the spaces around it", async () => {
    const api = fakeApi()
    const testKey = vi.spyOn(api, "testKey")
    renderSettings(api)
    await screen.findByText("GPT · no key")
    fireEvent.click(within(keyRow("GPT · no key")).getByRole("button", { name: "Add" }))
    fireEvent.change(screen.getByLabelText("GPT key"), { target: { value: "  sk-gpt \n" } })
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    expect(await screen.findByText("✓ GPT answered")).toBeTruthy()
    expect(testKey).toHaveBeenCalledWith("gpt", "sk-gpt")
  })

  it("chooses models from the list and resets them to the recommended ones", async () => {
    const api = fakeApi({
      getModels: (provider) => Promise.resolve(defaultModels(provider)),
      resetModels: (provider) => Promise.resolve(defaultModels(provider)),
    })
    const setModels = vi.spyOn(api, "setModels")
    const resetModels = vi.spyOn(api, "resetModels")
    renderSettings(api)
    const advanced = await screen.findByText("Advanced")
    expect(advanced.closest("details")?.open).toBe(false)
    const strong = await screen.findByLabelText("Claude strong model")
    await waitFor(() => {
      expect(strong instanceof HTMLSelectElement && strong.value).toBe("claude-sonnet-5-5")
    })
    expect(
      within(strong).getByRole("option", { name: "Claude Sonnet 5.5 (recommended)" }),
    ).toBeTruthy()
    fireEvent.change(strong, { target: { value: "claude-opus-5-5" } })
    await waitFor(() => {
      expect(setModels).toHaveBeenCalledWith("claude", {
        cheap: "claude-haiku-5-5",
        strong: "claude-opus-5-5",
      })
    })
    expect(strong instanceof HTMLSelectElement && strong.value).toBe("claude-opus-5-5")
    fireEvent.click(screen.getByRole("button", { name: "Reset Claude to recommended" }))
    await waitFor(() => {
      expect(strong instanceof HTMLSelectElement && strong.value).toBe("claude-sonnet-5-5")
    })
    expect(resetModels).toHaveBeenCalledWith("claude")
  })

  it("shows the provider log and runs setup again", async () => {
    const api = fakeApi()
    const reveal = vi.spyOn(api, "revealLog")
    renderSettings(api)
    fireEvent.click(await screen.findByRole("button", { name: "Show the provider log" }))
    expect(reveal).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Run setup again" }))
    const dialog = await screen.findByRole("dialog", { name: "Welcome to Honya" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
  })
})
