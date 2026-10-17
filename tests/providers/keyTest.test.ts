import { describe, expect, it } from "vitest"
import { testKey } from "../../src/core/providers/keyTest"

describe("testKey", () => {
  it("is ok when the provider answers", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] })),
      )
    expect(await testKey("gemini", "k", fetchImpl, "gemini-3.8-flash")).toEqual({ ok: true })
  })

  it("says when the key is rejected", async () => {
    const fetchImpl: typeof fetch = () => Promise.resolve(new Response("no", { status: 401 }))
    const result = await testKey("gemini", "k", fetchImpl, "gemini-3.8-flash")
    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.message).toContain("Gemini rejected the key")
  })

  it("says when the provider can't be reached", async () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new TypeError("fetch failed"))
    expect(await testKey("claude", "k", fetchImpl, "claude-haiku-5-5")).toEqual({
      ok: false,
      message: "Couldn't reach Claude. Check your connection.",
    })
  })

  it("treats a non-ProviderError failure as unreachable", async () => {
    const fetchImpl: typeof fetch = () => {
      throw new Error("boom")
    }
    expect(await testKey("gpt", "k", fetchImpl, "gpt-6-luna")).toEqual({
      ok: false,
      message: "Couldn't reach OpenAI. Check your connection.",
    })
  })
})
