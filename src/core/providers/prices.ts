import type { ModelSpend, Usage } from "../pipeline/types"

// List prices in US dollars per million tokens, for the default models. Checked on
// 2026-10-17 against each provider's pricing page (GPT from third-party listings, as
// OpenAI's page couldn't be read). Free tiers and later price changes aren't known
// here, so the cost shown is an estimate.
interface Price {
  input: number
  cached: number
  output: number
}

const PRICES: Readonly<Record<string, Price>> = {
  "claude-haiku-5-5": { input: 0.1, cached: 0.01, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, cached: 0.1, output: 10 },
  "gpt-6-luna": { input: 0.1, cached: 0.01, output: 0.5 },
  "gpt-6.1-sol": { input: 2, cached: 0.2, output: 10 },
  // Introductory prices: Flash doubles on 2027-01-01, Argon on 2026-12-01.
  "gemini-3.8-flash": { input: 0.75, cached: 0.075, output: 3.75 },
  "gemini-4-argon": { input: 2, cached: 0.2, output: 10 },
  "mistral-large-latest": { input: 0.5, cached: 0.5, output: 1.5 },
}

export interface Cost {
  // Dollars for the priced models; null when no model used had a known price.
  usd: number | null
  // Models whose price isn't known, so their tokens aren't in `usd`.
  unpriced: string[]
  input: number
  output: number
  requests: number
}

export function costOf(spend: readonly ModelSpend[]): Cost {
  let usd: number | null = null
  const unpriced: string[] = []
  let input = 0
  let output = 0
  let requests = 0
  for (const entry of spend) {
    input += entry.input
    output += entry.output
    requests += entry.requests
    const price = PRICES[entry.model]
    if (price === undefined) {
      unpriced.push(entry.model)
      continue
    }
    usd = (usd ?? 0) + dollars(entry, price)
  }
  return { usd, unpriced, input, output, requests }
}

function dollars(usage: Usage, price: Price): number {
  const fresh = Math.max(0, usage.input - usage.cached)
  return (fresh * price.input + usage.cached * price.cached + usage.output * price.output) / 1e6
}

// Adds one request's tokens to the model's running total.
export function addSpend(spend: readonly ModelSpend[], model: string, usage: Usage): ModelSpend[] {
  const found = spend.some((entry) => entry.model === model)
  if (!found) {
    return [...spend, { model, requests: 1, ...usage }]
  }
  return spend.map((entry) =>
    entry.model === model
      ? {
          model,
          requests: entry.requests + 1,
          input: entry.input + usage.input,
          output: entry.output + usage.output,
          cached: entry.cached + usage.cached,
        }
      : entry,
  )
}

// Used until the translator sets their own rate in Settings.
export const DEFAULT_EUR_RATE = 0.86

export function toEuros(usd: number, rate: number): number {
  return Math.round(usd * rate * 1e4) / 1e4
}
