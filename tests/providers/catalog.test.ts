import { describe, expect, it } from "vitest"
import { modelOptions } from "../../src/core/providers/catalog"
import { defaultModels } from "../../src/core/providers/models"

describe("modelOptions", () => {
  it("offers choices per tier with the default recommended", () => {
    for (const provider of ["claude", "gpt", "gemini", "mistral"] as const) {
      const options = modelOptions(provider)
      for (const tier of ["cheap", "strong"] as const) {
        expect(options[tier].length).toBeGreaterThanOrEqual(1)
        const recommended = options[tier].filter((option) => option.recommended)
        expect(recommended.map((option) => option.id)).toEqual([defaultModels(provider)[tier]])
      }
    }
  })

  it("lists the alternatives", () => {
    const ids = (provider: "claude" | "gpt" | "gemini" | "mistral"): string[] => {
      const { cheap, strong } = modelOptions(provider)
      return [...cheap, ...strong].map((option) => option.id)
    }
    expect(ids("claude")).toEqual(
      expect.arrayContaining(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]),
    )
    expect(ids("gemini")).toEqual(
      expect.arrayContaining(["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-4-argon"]),
    )
  })
})
