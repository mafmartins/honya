import { describe, expect, it } from "vitest"
import { defaultModels } from "../../src/core/providers/models"

describe("default models", () => {
  it("uses each provider's current cheap and strong models", () => {
    expect(defaultModels("claude")).toEqual({
      cheap: "claude-haiku-5-5",
      strong: "claude-sonnet-5-5",
    })
    expect(defaultModels("gpt")).toEqual({ cheap: "gpt-6-luna", strong: "gpt-6.1-sol" })
    expect(defaultModels("gemini")).toEqual({ cheap: "gemini-3.8-flash", strong: "gemini-4-argon" })
    expect(defaultModels("mistral")).toEqual({
      cheap: "mistral-small-latest",
      strong: "mistral-large-latest",
    })
  })
})
