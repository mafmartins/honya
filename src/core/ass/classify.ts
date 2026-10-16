export type StyleClassification = "dialogue" | "skip" | "ambiguous"

const DIALOGUE_EXACT = new Set([
  "default",
  "dialogue",
  "main",
  "alt",
  "italic",
  "thought",
  "flashback",
  "narration",
])

const SKIP_EXACT = new Set(["signs", "sign", "song", "songs", "karaoke", "op", "ed", "title"])

function matchesDialogue(lower: string): boolean {
  if (DIALOGUE_EXACT.has(lower)) {
    return true
  }
  return lower.includes("dialogue")
}

function matchesSkip(lower: string): boolean {
  if (SKIP_EXACT.has(lower)) {
    return true
  }
  return (
    lower.includes("sign") ||
    lower.includes("song") ||
    lower.includes("karaoke") ||
    lower.includes("credit")
  )
}

export function classifyStyle(name: string): StyleClassification {
  const lower = name.toLowerCase()
  const isDialogue = matchesDialogue(lower)
  const isSkip = matchesSkip(lower)
  if (isDialogue && isSkip) {
    return "ambiguous"
  }
  if (isDialogue) {
    return "dialogue"
  }
  if (isSkip) {
    return "skip"
  }
  return "ambiguous"
}

export function classifyScript(styles: string[]): Map<string, StyleClassification> {
  const result = new Map<string, StyleClassification>()
  const seen = new Set<string>()
  for (const style of styles) {
    if (seen.has(style)) {
      continue
    }
    seen.add(style)
    result.set(style, classifyStyle(style))
  }
  return result
}
