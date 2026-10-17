export const DEFAULT_CPS_LIMIT = 17

// A translation about as long as the English isn't flagged even when both are over the
// reading speed: the source sets that pace, and Portuguese runs longer than English.
// "About as long" is 20% longer, or 5 characters on a short line.
const SOURCE_SLACK = 1.2
const SOURCE_SLACK_CHARS = 5

export function visibleLength(words: string): number {
  return words.replace(/\{[^}]*\}/g, "").replace(/\\[Nn]/g, "").length
}

export function charactersPerSecond(words: string, startMs: number, endMs: number): number {
  const durationMs = endMs - startMs
  if (durationMs === 0) {
    return Infinity
  }
  return visibleLength(words) / (durationMs / 1000)
}

export function exceedsLimit(cps: number, limit: number): boolean {
  return cps > limit
}

// The most characters a translation of `english` may use on this cue: what the reading
// speed allows, or the English line's own length plus the slack if that is more.
export function charLimit(
  english: string,
  startMs: number,
  endMs: number,
  cpsLimit: number,
): number {
  const seconds = Math.max(0, endMs - startMs) / 1000
  const reading = Math.max(1, Math.floor(seconds * cpsLimit))
  const englishLength = visibleLength(english)
  const source = Math.max(
    Math.ceil(englishLength * SOURCE_SLACK),
    englishLength + SOURCE_SLACK_CHARS,
  )
  return Math.max(reading, source)
}

export function tooLong(
  words: string,
  english: string,
  startMs: number,
  endMs: number,
  cpsLimit: number,
): boolean {
  return visibleLength(words) > charLimit(english, startMs, endMs, cpsLimit)
}
