import type { LineResult, ProviderId } from "../core/pipeline/types"

export interface LogInput {
  time: string
  provider: ProviderId
  model: string
  tier: "cheap" | "strong"
  prompt: string
  reply: { lines: LineResult[] } | { refused: true; reason?: string; excerpt?: string }
}

const BRIEF_MARK = '"frameIds": string[]'

// One JSON line for a provider reply worth investigating — an unusable reply or one
// whose line ids don't match the request — or null for a good reply. Never includes
// the API key or the request URL.
export function logEntry(input: LogInput): string | null {
  const head = { time: input.time, provider: input.provider, model: input.model, tier: input.tier }
  if ("refused" in input.reply) {
    return JSON.stringify({
      ...head,
      problem: input.reply.reason ?? "refused",
      excerpt: input.reply.excerpt ?? "",
    })
  }
  if (input.prompt.includes(BRIEF_MARK)) {
    return null
  }
  const asked = [...input.prompt.matchAll(/^(\d+):/gm)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  )
  const got = input.reply.lines.map((line) => line.id)
  if (asked.length === got.length && asked.every((id, index) => got[index] === id)) {
    return null
  }
  return JSON.stringify({
    ...head,
    problem: `asked for lines ${asked.join(", ")} but got ${got.join(", ")}`,
  })
}
