// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiContext } from "../../src/renderer/api"
import { SetupDialog } from "../../src/renderer/workspace/SetupDialog"
import type { AppSettings } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

const DEFAULTS: AppSettings = {
  setupDone: false,
  defaultProvider: "claude",
  defaults: { variant: "pt-pt", preset: "save", frameSetting: "none" },
  eurRate: 0.92,
}

function open(
  api = fakeApi(),
  onDone = vi.fn(),
  initial: AppSettings = DEFAULTS,
): { api: ReturnType<typeof fakeApi>; onDone: () => void } {
  render(
    <ApiContext.Provider value={api}>
      <SetupDialog initial={initial} onDone={onDone} />
    </ApiContext.Provider>,
  )
  return { api, onDone }
}

function typeKey(value: string): void {
  fireEvent.change(screen.getByLabelText("Key"), { target: { value } })
}

describe("setup dialog", () => {
  it("is an accessible dialog with focus on the first field", () => {
    open()
    const dialog = screen.getByRole("dialog", { name: "Welcome to Honya" })
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(document.activeElement).toBe(screen.getByLabelText("Provider"))
    expect(screen.getByLabelText("Key").getAttribute("type")).toBe("password")
  })

  it("cannot continue until the key test passes, and editing resets the test", async () => {
    open()
    const next = screen.getByRole("button", { name: "Continue" })
    expect((next as HTMLButtonElement).disabled).toBe(true)
    typeKey("sk-good")
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    expect(await screen.findByText("✓ Claude answered")).toBeTruthy()
    expect((next as HTMLButtonElement).disabled).toBe(false)
    typeKey("sk-good2")
    expect(screen.queryByText("✓ Claude answered")).toBeNull()
    expect((next as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    await screen.findByText("✓ Claude answered")
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "gemini" } })
    expect(screen.queryByText("✓ Claude answered")).toBeNull()
    expect((next as HTMLButtonElement).disabled).toBe(true)
  })

  it("shows the provider's message when the key is rejected", async () => {
    open()
    typeKey("bad-key")
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    expect(await screen.findByText("The key was rejected.")).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Continue" }).disabled).toBe(true)
  })

  it("saves the key and the defaults, then finishes", async () => {
    const { api, onDone } = open()
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "gemini" } })
    typeKey("sk-good")
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    await screen.findByText("✓ Gemini answered")
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await screen.findByLabelText("Portuguese")
    expect(await api.hasKey("gemini")).toBe(true)
    expect((await api.getSettings()).defaultProvider).toBe("gemini")
    fireEvent.change(screen.getByLabelText("Portuguese"), { target: { value: "pt-br" } })
    fireEvent.change(screen.getByLabelText("Quality"), { target: { value: "best" } })
    fireEvent.change(screen.getByLabelText("Video frames"), { target: { value: "every" } })
    expect(screen.getByRole("option", { name: "Best — highest quality" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Finish" }))
    await waitFor(() => {
      expect(onDone).toHaveBeenCalled()
    })
    const settings = await api.getSettings()
    expect(settings.setupDone).toBe(true)
    expect(settings.defaults).toEqual({ variant: "pt-br", preset: "best", frameSetting: "every" })
  })

  it("tests the key without the spaces around it", async () => {
    const api = fakeApi()
    const testKey = vi.spyOn(api, "testKey")
    const setKey = vi.spyOn(api, "setKey")
    open(api)
    typeKey("  sk-good \n")
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    await screen.findByText("✓ Claude answered")
    expect(testKey).toHaveBeenCalledWith("claude", "sk-good")
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await screen.findByLabelText("Portuguese")
    expect(setKey).toHaveBeenCalledWith("claude", "sk-good")
  })

  it("goes back to the provider step", async () => {
    open()
    typeKey("sk-good")
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    await screen.findByText("✓ Claude answered")
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.click(await screen.findByRole("button", { name: "Back" }))
    expect(await screen.findByLabelText("Key")).toBeTruthy()
  })

  it("starts from the saved settings", async () => {
    open(fakeApi(), vi.fn(), {
      ...DEFAULTS,
      defaultProvider: "mistral",
      defaults: { variant: "pt-br", preset: "best", frameSetting: "every" },
    })
    expect(screen.getByLabelText<HTMLSelectElement>("Provider").value).toBe("mistral")
    typeKey("sk-good")
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    await screen.findByText("✓ Mistral answered")
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await screen.findByLabelText("Portuguese")
    expect(screen.getByLabelText<HTMLSelectElement>("Portuguese").value).toBe("pt-br")
    expect(screen.getByLabelText<HTMLSelectElement>("Quality").value).toBe("best")
    expect(screen.getByLabelText<HTMLSelectElement>("Video frames").value).toBe("every")
  })

  it("ignores a test result that arrives after the key was edited", async () => {
    const api = fakeApi()
    let release: (() => void) | null = null
    api.testKey = () =>
      new Promise((resolve) => {
        release = () => {
          resolve({ ok: true })
        }
      })
    open(api)
    typeKey("sk-old")
    fireEvent.click(screen.getByRole("button", { name: "Test the key" }))
    typeKey("sk-new")
    await act(() => {
      release?.()
      return Promise.resolve()
    })
    expect(screen.queryByText("✓ Claude answered")).toBeNull()
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Continue" }).disabled).toBe(true)
  })
})
