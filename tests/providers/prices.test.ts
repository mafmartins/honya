import { describe, expect, it } from "vitest"
import { defaultModels } from "../../src/core/providers/models"
import { addSpend, costOf, DEFAULT_EUR_RATE, toEuros } from "../../src/core/providers/prices"

describe("cost", () => {
  it("knows a price for every default model except mistral small", () => {
    for (const provider of ["claude", "gpt", "gemini", "mistral"] as const) {
      const { cheap, strong } = defaultModels(provider)
      for (const model of [cheap, strong]) {
        const cost = costOf([{ model, requests: 1, input: 1e6, cached: 0, output: 0 }])
        if (model === "mistral-small-latest") {
          expect(cost.usd).toBeNull()
        } else {
          expect(cost.usd).toBeGreaterThan(0)
        }
      }
    }
  })

  it("charges cached input at the cached price", () => {
    const cost = costOf([
      { model: "gemini-3.8-flash", requests: 1, input: 1e6, cached: 4e5, output: 1e5 },
    ])
    expect(cost.usd).toBeCloseTo(0.6 * 0.75 + 0.4 * 0.075 + 0.1 * 3.75, 6)
  })

  it("prices what it can and names the rest", () => {
    expect(
      costOf([
        { model: "claude-sonnet-5-5", requests: 1, input: 1000, cached: 0, output: 100 },
        { model: "my-model", requests: 2, input: 500, cached: 0, output: 50 },
      ]),
    ).toEqual({
      usd: (1000 * 2 + 100 * 10) / 1e6,
      unpriced: ["my-model"],
      input: 1500,
      output: 150,
      requests: 3,
    })
    expect(costOf([])).toEqual({ usd: null, unpriced: [], input: 0, output: 0, requests: 0 })
  })

  it("adds each request to its model's total", () => {
    const once = addSpend([], "m", { input: 10, output: 2, cached: 1 })
    const twice = addSpend(addSpend(once, "m", { input: 5, output: 1, cached: 0 }), "n", {
      input: 1,
      output: 1,
      cached: 0,
    })
    expect(twice).toEqual([
      { model: "m", requests: 2, input: 15, output: 3, cached: 1 },
      { model: "n", requests: 1, input: 1, output: 1, cached: 0 },
    ])
  })
})

describe("euros", () => {
  it("converts dollars rounded to four decimals", () => {
    expect(toEuros(0.0708, 0.86)).toBe(0.0609)
    expect(DEFAULT_EUR_RATE).toBe(0.86)
  })
})
