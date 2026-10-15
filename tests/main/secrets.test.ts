import { describe, expect, it } from "vitest"
import { createSecretStore } from "../../src/main/secrets"

describe("secrets", () => {
  it("stores a key outside the profile json", () => {
    const files = new Map<string, Buffer>()
    const store = createSecretStore({
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(Buffer.from(`enc:${value}`).toString("base64")),
      decryptString: (value) => Buffer.from(value.toString("utf8"), "base64").toString("utf8").replace(/^enc:/, ""),
    }, {
      read: () => files.get("keys") ?? null,
      write: (value) => { files.set("keys", value) },
    })
    store.setKey("mistral", "secret")
    expect(store.hasKey("mistral")).toBe(true)
    expect(store.getKey("mistral")).toBe("secret")
    expect(files.get("keys")?.toString("utf8")).not.toContain("secret")
  })
})
