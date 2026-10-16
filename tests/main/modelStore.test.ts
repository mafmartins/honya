import { describe, expect, it } from "vitest"
import { defaultModels } from "../../src/core/providers/models"
import { createModelStore } from "../../src/main/modelStore"

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

describe("model store", () => {
  it("returns the defaults until an override is saved", () => {
    const store = createModelStore(memoryFile())
    expect(store.get("claude")).toEqual(defaultModels("claude"))
    store.set("claude", { cheap: " small ", strong: "large" })
    expect(store.get("claude")).toEqual({ cheap: "small", strong: "large" })
    expect(store.get("gpt")).toEqual(defaultModels("gpt"))
  })

  it("resets one provider to its defaults", () => {
    const store = createModelStore(memoryFile())
    store.set("claude", { cheap: "a", strong: "b" })
    store.set("gpt", { cheap: "c", strong: "d" })
    expect(store.reset("claude")).toEqual(defaultModels("claude"))
    expect(store.get("gpt")).toEqual({ cheap: "c", strong: "d" })
  })

  it("refuses an empty id", () => {
    const store = createModelStore(memoryFile())
    expect(() => store.set("claude", { cheap: " ", strong: "b" })).toThrow(
      "Model ids can't be empty.",
    )
  })

  it("treats an unreadable file as no overrides", () => {
    const store = createModelStore(memoryFile("{broken"))
    expect(store.get("mistral")).toEqual(defaultModels("mistral"))
  })
})
