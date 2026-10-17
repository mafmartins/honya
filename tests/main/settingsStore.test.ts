import { describe, expect, it } from "vitest"
import { DEFAULT_EUR_RATE } from "../../src/core/providers/prices"
import { createSettingsStore } from "../../src/main/settingsStore"

function memoryFile(initial: string | null = null): {
  read(): string | null
  write(text: string): void
} {
  let text = initial
  return {
    read: () => text,
    write: (next) => {
      text = next
    },
  }
}

describe("settings store", () => {
  it("returns the defaults when nothing is saved", () => {
    expect(createSettingsStore(memoryFile()).get()).toEqual({
      setupDone: false,
      defaultProvider: "claude",
      defaults: { variant: "pt-pt", preset: "save", frameSetting: "none" },
      eurRate: DEFAULT_EUR_RATE,
    })
  })

  it("applies a partial update and keeps the rest", () => {
    const file = memoryFile()
    const store = createSettingsStore(file)
    const next = store.update({ setupDone: true, eurRate: 0.9 })
    expect(next.setupDone).toBe(true)
    expect(next.eurRate).toBe(0.9)
    expect(next.defaultProvider).toBe("claude")
    expect(createSettingsStore(file).get()).toEqual(next)
  })

  it("merges a partial defaults patch field by field", () => {
    const store = createSettingsStore(memoryFile())
    const next = store.update({
      defaults: { variant: "pt-br", preset: "save", frameSetting: "none" },
    })
    expect(next.defaults.variant).toBe("pt-br")
  })

  it("falls back to defaults on bad or invalid saved values", () => {
    expect(createSettingsStore(memoryFile("{nope")).get().defaultProvider).toBe("claude")
    const bad = JSON.stringify({ defaultProvider: "x", eurRate: -1, defaults: { preset: "?" } })
    const got = createSettingsStore(memoryFile(bad)).get()
    expect(got.defaultProvider).toBe("claude")
    expect(got.eurRate).toBe(DEFAULT_EUR_RATE)
    expect(got.defaults.preset).toBe("save")
  })

  it("rejects an invalid euro rate on update", () => {
    expect(() => createSettingsStore(memoryFile()).update({ eurRate: 0 })).toThrow()
  })
})
