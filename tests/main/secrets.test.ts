import { describe, expect, it } from "vitest"
import { createSecretStore } from "../../src/main/secrets"

function fakeStore(available = true): {
  store: ReturnType<typeof createSecretStore>
  files: Map<string, Buffer>
} {
  const files = new Map<string, Buffer>()
  const store = createSecretStore(
    {
      isEncryptionAvailable: () => available,
      encryptString: (value) => Buffer.from(Buffer.from(`enc:${value}`).toString("base64")),
      decryptString: (value) =>
        Buffer.from(value.toString("utf8"), "base64").toString("utf8").replace(/^enc:/, ""),
    },
    {
      read: () => files.get("keys") ?? null,
      write: (value) => {
        files.set("keys", value)
      },
    },
  )
  return { store, files }
}

describe("secrets", () => {
  it("stores a key outside the profile json", () => {
    const { store, files } = fakeStore()
    store.setKey("mistral", "secret")
    expect(store.hasKey("mistral")).toBe(true)
    expect(store.getKey("mistral")).toBe("secret")
    expect(files.get("keys")?.toString("utf8")).not.toContain("secret")
  })

  it("removes one key and keeps the others", () => {
    const { store } = fakeStore()
    store.setKey("claude", "a")
    store.setKey("gpt", "b")
    store.removeKey("claude")
    expect(store.hasKey("claude")).toBe(false)
    expect(store.getKey("gpt")).toBe("b")
  })

  it("refuses to store a key when encryption is unavailable", () => {
    const { store, files } = fakeStore(false)
    expect(() => {
      store.setKey("claude", "a")
    }).toThrow("This system can't encrypt keys, so Honya won't store them.")
    expect(files.size).toBe(0)
  })
})
