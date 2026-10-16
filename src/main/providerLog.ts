import type { ProviderId } from "../core/pipeline/types"
import type { Usage } from "../core/providers/complete"

export interface CallLog {
  time: string
  provider: ProviderId
  model: string
  tier: "cheap" | "strong"
  usage: Usage | null
  problem?: string
  excerpt?: string
}

export interface ProblemLog {
  time: string
  provider: ProviderId
  tier: "cheap" | "strong"
  problem: string
  excerpt?: string
}

// One JSON line per provider request, with the tokens it used, so the cost of a run
// can be checked; an unusable reply also says why. Never includes the API key or the
// request URL.
export function callEntry(call: CallLog): string {
  const entry: Record<string, string | number> = {
    time: call.time,
    provider: call.provider,
    model: call.model,
    tier: call.tier,
  }
  if (call.usage !== null) {
    entry.input = call.usage.input
    entry.cached = call.usage.cached
    entry.output = call.usage.output
  }
  if (call.problem !== undefined) {
    entry.problem = call.problem
    entry.excerpt = call.excerpt ?? ""
  }
  return JSON.stringify(entry)
}

// A reply the pipeline could only partly use (lines left out, no usable line).
export function problemEntry(problem: ProblemLog): string {
  return JSON.stringify(
    problem.excerpt === undefined ? problem : { ...problem, excerpt: problem.excerpt },
  )
}
