import { describe, expect, it } from "vitest"
import { LINES_SCHEMA } from "../../src/core/pipeline/schemas"
import { completeJson, completeText, type ChatInput } from "../../src/core/providers/complete"
import { defaultModels } from "../../src/core/providers/models"

type Provider = ChatInput["provider"]

const ANSWER = { lines: [{ id: "0", text: "Olá.", mark: "clean", note: "" }], terms: [] }

// The reply body each provider sends for an answer whose text is `text`.
function providerReply(provider: Provider, text: string): unknown {
  switch (provider) {
    case "claude":
      return {
        content: [{ type: "text", text }],
        usage: { input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 50 },
      }
    case "gemini":
      return {
        candidates: [{ content: { parts: [{ text }] } }],
        usageMetadata: {
          promptTokenCount: 1000,
          cachedContentTokenCount: 800,
          candidatesTokenCount: 40,
          thoughtsTokenCount: 10,
        },
      }
    case "gpt":
    case "mistral":
      return {
        choices: [{ message: { content: text } }],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 50,
          prompt_tokens_details: { cached_tokens: 900 },
        },
      }
  }
}

async function call(
  provider: Provider,
  replyBody: unknown,
  extra: Partial<ChatInput> = {},
): Promise<{ url: string; body: Record<string, unknown>; result: unknown }> {
  let url = ""
  let body = ""
  const fetchImpl: typeof fetch = async (input, init) => {
    await Promise.resolve()
    url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    body = typeof init?.body === "string" ? init.body : ""
    return new Response(typeof replyBody === "string" ? replyBody : JSON.stringify(replyBody))
  }
  const result = await completeJson({
    provider,
    model: defaultModels(provider).cheap,
    apiKey: "secret",
    prompt: "[0] (?, 17) Hello.",
    fetch: fetchImpl,
    ...extra,
  })
  const parsed: unknown = JSON.parse(body)
  return {
    url,
    body: typeof parsed === "object" && parsed !== null ? { ...parsed } : {},
    result,
  }
}

describe("completeJson", () => {
  it("reads each provider's answer and token usage", async () => {
    const usage = {
      claude: { input: 1000, output: 50, cached: 900 },
      gpt: { input: 1000, output: 50, cached: 900 },
      mistral: { input: 1000, output: 50, cached: 900 },
      gemini: { input: 1000, output: 50, cached: 800 },
    }
    for (const provider of ["claude", "gpt", "gemini", "mistral"] as const) {
      const { result } = await call(provider, providerReply(provider, JSON.stringify(ANSWER)))
      expect(result).toEqual({ value: ANSWER, usage: usage[provider] })
    }
  })

  it("posts to each provider's endpoint", async () => {
    const reply = (p: Provider): unknown => providerReply(p, "{}")
    expect((await call("claude", reply("claude"))).url).toBe(
      "https://api.anthropic.com/v1/messages",
    )
    expect((await call("gpt", reply("gpt"))).url).toBe("https://api.openai.com/v1/chat/completions")
    expect((await call("mistral", reply("mistral"))).url).toBe(
      "https://api.mistral.ai/v1/chat/completions",
    )
    expect((await call("gemini", reply("gemini"))).url).toContain(
      "/v1beta/models/gemini-3.8-flash:generateContent?key=secret",
    )
  })

  it("sends the system prompt the way each provider takes it", async () => {
    const system = { system: "You translate." }
    const claude = await call("claude", providerReply("claude", "{}"), system)
    expect(claude.body.system).toEqual([
      { type: "text", text: "You translate.", cache_control: { type: "ephemeral" } },
    ])
    for (const provider of ["gpt", "mistral"] as const) {
      const { body } = await call(provider, providerReply(provider, "{}"), system)
      expect(body.messages).toEqual([
        { role: "system", content: "You translate." },
        { role: "user", content: "[0] (?, 17) Hello." },
      ])
    }
    const gemini = await call("gemini", providerReply("gemini", "{}"), system)
    expect(gemini.body.systemInstruction).toEqual({ parts: [{ text: "You translate." }] })
  })

  it("asks each provider for a reply that follows the schema", async () => {
    const schema = { schema: LINES_SCHEMA }
    expect((await call("claude", providerReply("claude", "{}"), schema)).body).toMatchObject({
      output_config: { format: { type: "json_schema", schema: LINES_SCHEMA.schema } },
    })
    for (const provider of ["gpt", "mistral"] as const) {
      expect((await call(provider, providerReply(provider, "{}"), schema)).body).toMatchObject({
        response_format: {
          type: "json_schema",
          json_schema: { name: "translated_lines", strict: true, schema: LINES_SCHEMA.schema },
        },
      })
    }
    expect((await call("gemini", providerReply("gemini", "{}"), schema)).body).toMatchObject({
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: LINES_SCHEMA.schema,
      },
    })
  })

  it("sets each provider's reasoning effort", async () => {
    const low = { effort: "low" as const }
    const medium = { effort: "medium" as const }
    expect((await call("claude", providerReply("claude", "{}"), low)).body).toMatchObject({
      output_config: { effort: "low" },
    })
    expect((await call("gpt", providerReply("gpt", "{}"), medium)).body).toMatchObject({
      reasoning_effort: "medium",
    })
    expect((await call("gemini", providerReply("gemini", "{}"), low)).body).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
    })
    expect((await call("mistral", providerReply("mistral", "{}"), low)).body).toMatchObject({
      reasoning_effort: "none",
    })
    expect((await call("mistral", providerReply("mistral", "{}"), medium)).body).not.toHaveProperty(
      "reasoning_effort",
    )
  })

  it("leaves each provider's defaults when nothing is asked for", async () => {
    for (const provider of ["claude", "gpt", "gemini", "mistral"] as const) {
      const { body } = await call(provider, providerReply(provider, "{}"))
      expect(body).not.toHaveProperty("output_config")
      expect(body).not.toHaveProperty("reasoning_effort")
      expect(body).not.toHaveProperty("generationConfig")
      expect(body).not.toHaveProperty("response_format")
      expect(body).not.toHaveProperty("system")
    }
  })

  it("labels each frame with its line", async () => {
    const { body } = await call("gemini", providerReply("gemini", "{}"), {
      images: [{ id: "4", png: new Uint8Array([1]) }],
    })
    expect(body.contents).toEqual([
      {
        role: "user",
        parts: [
          { text: "[0] (?, 17) Hello." },
          { text: "Frame for line [4]:" },
          { inlineData: { mimeType: "image/png", data: "AQ==" } },
        ],
      },
    ])
  })

  it("skips thinking and reads fenced json", async () => {
    const claude = {
      content: [
        { type: "thinking", thinking: "{ not the answer }", signature: "x" },
        { type: "text", text: `\`\`\`json\n${JSON.stringify(ANSWER)}\n\`\`\`` },
      ],
    }
    expect((await call("claude", claude)).result).toEqual({ value: ANSWER, usage: null })
    const gemini = {
      candidates: [
        {
          content: {
            parts: [
              { text: "Thinking about {the batch}", thought: true },
              { text: JSON.stringify(ANSWER) },
            ],
          },
        },
      ],
    }
    expect((await call("gemini", gemini)).result).toEqual({ value: ANSWER, usage: null })
  })

  it("accepts an unescaped \\N line break inside the json", async () => {
    const text =
      '{"lines":[{"id":"0","text":"Olá.\\NTudo bem?","mark":"clean","note":""}],"terms":[]}'
    const { result } = await call("gpt", providerReply("gpt", text))
    expect(result).toMatchObject({ value: { lines: [{ text: "Olá.\\NTudo bem?" }] } })
  })
})

describe("unusable replies", () => {
  it("says why, with the start of the reply and the usage", async () => {
    expect((await call("gemini", "nope")).result).toEqual({
      refused: true,
      reason: "the reply is not a JSON object",
      excerpt: "nope",
      usage: null,
    })
    expect(
      (await call("gemini", { candidates: [{ finishReason: "SAFETY" }] })).result,
    ).toMatchObject({
      refused: true,
      reason: "the reply has no text (finish reason SAFETY)",
    })
    expect(
      (await call("gemini", { promptFeedback: { blockReason: "OTHER" } })).result,
    ).toMatchObject({
      refused: true,
      reason: "the reply has no text (blocked: OTHER)",
    })
    expect(
      (await call("gpt", providerReply("gpt", "Sorry, I can't help with that."))).result,
    ).toEqual({
      refused: true,
      reason: "the reply text is not JSON",
      excerpt: "Sorry, I can't help with that.",
      usage: { input: 1000, output: 50, cached: 900 },
    })
  })
})

describe("provider failures", () => {
  it("throws a ProviderError on a non-200 reply", async () => {
    const fetchImpl: typeof fetch = () => Promise.resolve(new Response("no", { status: 401 }))
    await expect(
      completeJson({ provider: "gpt", model: "m", apiKey: "k", prompt: "p", fetch: fetchImpl }),
    ).rejects.toMatchObject({ kind: "auth" })
  })

  it("throws a network ProviderError when fetch rejects", async () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new TypeError("fetch failed"))
    await expect(
      completeJson({ provider: "claude", model: "m", apiKey: "k", prompt: "p", fetch: fetchImpl }),
    ).rejects.toMatchObject({ kind: "network" })
  })

  it("gives up on a request that gets no reply and says so", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error("aborted"))
        })
      })
    await expect(
      completeJson({
        provider: "gemini",
        model: defaultModels("gemini").cheap,
        apiKey: "secret",
        prompt: "p",
        fetch: hanging,
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ kind: "server", message: "Gemini didn't answer within 3 minutes." })
  })
})

describe("completeText", () => {
  it("returns the assistant text", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ content: [{ type: "text", text: "hello" }] }), {
          status: 200,
        }),
      )
    const result = await completeText({
      provider: "claude",
      model: defaultModels("claude").cheap,
      apiKey: "secret",
      prompt: "Translate: Hi.",
      fetch: fetchImpl,
    })
    expect(result).toEqual({ text: "hello" })
  })
})
