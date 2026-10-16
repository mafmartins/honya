import { describe, expect, it } from "vitest"
import { completeChat, completeText } from "../../src/core/providers/complete"
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
      return new Response(JSON.stringify({ lines: [{ id: "0", words: "Olá.", mark: "clean" }] }), {
        status: 200,
      })
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

  it("accepts numeric ids and null optional fields", async () => {
    let url = ""
    const fetchImpl: typeof fetch = async (input) => {
      await Promise.resolve()
      if (typeof input === "string" || input instanceof URL) {
        url = String(input)
      } else {
        url = input.url
      }
      return new Response(
        JSON.stringify({
          lines: [{ id: 0, words: "Olá.", mark: "clean", reason: null, glossary: null }],
        }),
        { status: 200 },
      )
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

  it("throws a ProviderError on a non-200 reply", async () => {
    const fetchImpl: typeof fetch = async () => {
      await Promise.resolve()
      return new Response("no", { status: 401 })
    }
    const input = {
      provider: "gpt" as const,
      model: defaultModels("gpt").strong,
      apiKey: "secret",
      prompt: "0: Hello.",
      fetch: fetchImpl,
    }
    await expect(completeChat(input)).rejects.toMatchObject({ kind: "auth" })
  })

  it("throws a network ProviderError when fetch rejects", async () => {
    const fetchImpl: typeof fetch = async () => {
      await Promise.resolve()
      throw new TypeError("fetch failed")
    }
    const input = {
      provider: "claude" as const,
      model: defaultModels("claude").cheap,
      apiKey: "secret",
      prompt: "0: Hello.",
      fetch: fetchImpl,
    }
    await expect(completeChat(input)).rejects.toMatchObject({ kind: "network" })
  })

  it("still returns refused for unreadable content", async () => {
    const fetchImpl: typeof fetch = async () => {
      await Promise.resolve()
      return new Response("nope", { status: 200 })
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

  it("completeText returns the assistant text without the lines instruction", async () => {
    let body = ""
    const fetchImpl: typeof fetch = async (_input, init) => {
      await Promise.resolve()
      body = typeof init?.body === "string" ? init.body : ""
      return new Response(JSON.stringify({ content: [{ type: "text", text: "hello" }] }), {
        status: 200,
      })
    }
    const result = await completeText({
      provider: "claude",
      model: defaultModels("claude").cheap,
      apiKey: "secret",
      prompt: "Translate: Hi.",
      fetch: fetchImpl,
    })
    expect(body).not.toContain("lines")
    expect(body).toContain("Translate: Hi.")
    expect(result).toEqual({ text: "hello" })
  })
})
