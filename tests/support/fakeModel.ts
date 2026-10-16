import type { Completer, CompletionRequest } from "../../src/core/pipeline/run"

// Ids a lines request asks for: the [id] lines of the prompt's last section (the lines
// to translate, or for an escalation the lines to redo).
export function requestedIds(prompt: string): string[] {
  const last = prompt.split("\n\n").at(-1) ?? ""
  return [...last.matchAll(/^\[(\d+)\]/gm)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
}

export function isBrief(request: CompletionRequest): boolean {
  return request.schema.name === "episode_brief"
}

export const emptyBrief = { summary: "", terms: [], hard: [], frames: [] }

// Translates every requested line as "pt <id>" and returns an empty brief.
export const echo: Completer = (request) => {
  if (isBrief(request)) {
    return Promise.resolve({ value: emptyBrief })
  }
  const lines = requestedIds(request.prompt).map((id) => ({
    id,
    text: `pt ${id}`,
    mark: "clean",
    note: "",
  }))
  return Promise.resolve({ value: { lines, terms: [] } })
}
