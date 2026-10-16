import { describe, expect, it } from "vitest"
import { providerError, providerName } from "../../src/core/providers/errors"

describe("providerError", () => {
  it("maps statuses to kinds and user messages", () => {
    expect(providerError("claude", 401, null)).toMatchObject({
      kind: "auth",
      message: "Claude rejected the key. Replace it on Profiles.",
    })
    expect(providerError("gpt", 403, null).kind).toBe("auth")
    expect(providerError("gemini", 429, null)).toMatchObject({
      kind: "rate-limit",
      message: "Gemini is rate limiting requests. Try again in a few minutes.",
    })
    expect(providerError("mistral", 503, null)).toMatchObject({
      kind: "server",
      message: "Mistral had a server error (503). Try again later.",
    })
    expect(providerError("claude", null, null)).toMatchObject({
      kind: "network",
      message: "Couldn't reach Claude. Check your connection.",
    })
    expect(providerError("gpt", 400, '{"error":{"message":"model not found"}}')).toMatchObject({
      kind: "request",
      message: "OpenAI refused the request: model not found",
    })
    expect(providerError("gpt", 404, "not json").message).toBe(
      "OpenAI refused the request: HTTP 404",
    )
  })

  it("keeps the provider and status on the error", () => {
    const error = providerError("gemini", 429, null)
    expect(error.provider).toBe("gemini")
    expect(error.status).toBe(429)
    expect(providerError("claude", null, null).status).toBeNull()
  })

  it("names each provider", () => {
    expect(providerName("claude")).toBe("Claude")
    expect(providerName("gpt")).toBe("OpenAI")
    expect(providerName("gemini")).toBe("Gemini")
    expect(providerName("mistral")).toBe("Mistral")
  })

  it("keeps the provider's own explanation for server and rate-limit errors", () => {
    const overloaded =
      '{"error":{"code":503,"message":"The model is overloaded. Please try again later.","status":"UNAVAILABLE"}}'
    expect(providerError("gemini", 503, overloaded).message).toBe(
      "Gemini had a server error (503): The model is overloaded. Please try again later.",
    )
    expect(
      providerError(
        "gemini",
        429,
        '{"error":{"message":"Quota exceeded for metric generate_content"}}',
      ).message,
    ).toBe("Gemini is rate limiting requests: Quota exceeded for metric generate_content")
    expect(providerError("mistral", 503, "<html>bad gateway</html>").message).toBe(
      "Mistral had a server error (503). Try again later.",
    )
  })
})
