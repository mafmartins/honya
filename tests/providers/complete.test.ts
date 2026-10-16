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

  it("ignores claude thinking blocks and leaves room for thinking", async () => {
    let body = ""
    const lines = JSON.stringify({ lines: [{ id: "0", words: "Olá.", mark: "clean" }] })
    const fetchImpl: typeof fetch = async (_input, init) => {
      await Promise.resolve()
      body = typeof init?.body === "string" ? init.body : ""
      return new Response(
        JSON.stringify({
          content: [
            { type: "thinking", thinking: "{ not the answer }", signature: "x" },
            { type: "text", text: lines },
          ],
        }),
        { status: 200 },
      )
    }
    const result = await completeChat({
      provider: "claude",
      model: defaultModels("claude").cheap,
      apiKey: "secret",
      prompt: "0: Hello.",
      fetch: fetchImpl,
    })
    expect(result).toEqual({ lines: [{ id: "0", words: "Olá.", mark: "clean" }] })
    expect(JSON.parse(body)).toMatchObject({ max_tokens: 16000 })
  })

  it("ignores gemini thought parts", async () => {
    const lines = JSON.stringify({ lines: [{ id: "0", words: "Olá.", mark: "clean" }] })
    const fetchImpl: typeof fetch = async () => {
      await Promise.resolve()
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Thinking about {the batch}", thought: true }, { text: lines }],
              },
            },
          ],
        }),
        { status: 200 },
      )
    }
    const result = await completeChat({
      provider: "gemini",
      model: defaultModels("gemini").cheap,
      apiKey: "secret",
      prompt: "0: Hello.",
      fetch: fetchImpl,
    })
    expect(result).toEqual({ lines: [{ id: "0", words: "Olá.", mark: "clean" }] })
  })
})

describe("reasoning effort", () => {
  async function bodyFor(
    provider: "claude" | "gpt" | "gemini" | "mistral",
    effort: "low" | undefined,
  ): Promise<Record<string, unknown>> {
    let body = ""
    const fetchImpl: typeof fetch = async (_input, init) => {
      await Promise.resolve()
      body = typeof init?.body === "string" ? init.body : ""
      return new Response(JSON.stringify({ lines: [] }), { status: 200 })
    }
    await completeChat({
      provider,
      model: defaultModels(provider).cheap,
      apiKey: "secret",
      prompt: "0: Hello.",
      fetch: fetchImpl,
      ...(effort === undefined ? {} : { effort }),
    })
    const parsed: unknown = JSON.parse(body)
    return typeof parsed === "object" && parsed !== null ? { ...parsed } : {}
  }

  it("asks each provider for little reasoning when effort is low", async () => {
    expect(await bodyFor("claude", "low")).toMatchObject({ output_config: { effort: "low" } })
    expect(await bodyFor("gpt", "low")).toMatchObject({ reasoning_effort: "low" })
    expect(await bodyFor("gemini", "low")).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
    })
    expect(await bodyFor("mistral", "low")).toMatchObject({ reasoning_effort: "none" })
  })

  it("leaves each provider's default reasoning when no effort is given", async () => {
    expect(await bodyFor("claude", undefined)).not.toHaveProperty("output_config")
    expect(await bodyFor("gpt", undefined)).not.toHaveProperty("reasoning_effort")
    expect(await bodyFor("gemini", undefined)).not.toHaveProperty("generationConfig")
    expect(await bodyFor("mistral", undefined)).not.toHaveProperty("reasoning_effort")
  })
})

describe("request timeout", () => {
  it("gives up on a request that gets no reply and says so", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error("aborted"))
        })
      })
    await expect(
      completeChat({
        provider: "gemini",
        model: defaultModels("gemini").cheap,
        apiKey: "secret",
        prompt: "0: Hello.",
        fetch: hanging,
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({
      kind: "server",
      message: "Gemini didn't answer within 3 minutes.",
    })
  })
})
