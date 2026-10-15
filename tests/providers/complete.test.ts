import { describe, expect, it } from "vitest"
import { completeChat } from "../../src/core/providers/complete"
import { defaultModels } from "../../src/core/providers/models"

describe("completeChat", () => {
  it("posts to the provider and parses a line list", async () => {
    let url = ""
    const fetchImpl: typeof fetch = async (input) => {
      await Promise.resolve()
      if (typeof input === "string" || input instanceof URL) {
        url = String(input)
      } else {
        url = input.url
      }
      return new Response(JSON.stringify({ lines: [{ id: "0", words: "Olá.", mark: "clean" }] }), { status: 200 })
    }
    const result = await completeChat({
      provider: "mistral",
      model: defaultModels("mistral").cheap,
      apiKey: "secret",
      prompt: "0: Hello.",
      fetch: fetchImpl,
    })
    expect(url).toBe("https://api.mistral.ai/v1/chat/completions")
    expect(result).toEqual({ lines: [{ id: "0", words: "Olá.", mark: "clean" }] })
  })

  it("treats a non-200 response as a refusal", async () => {
    const fetchImpl: typeof fetch = async () => {
      await Promise.resolve()
      return new Response("no", { status: 429 })
    }
    const result = await completeChat({
      provider: "gpt",
      model: defaultModels("gpt").strong,
      apiKey: "secret",
      prompt: "0: Hello.",
      fetch: fetchImpl,
    })
    expect(result).toEqual({ refused: true })
  })
})
