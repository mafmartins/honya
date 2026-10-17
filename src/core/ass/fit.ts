export const DEFAULT_CPS_LIMIT = 17

// A translation about as long as the English isn't flagged even when both are over the
// reading speed: the source sets that pace, and the translator can't do much better.
const SOURCE_SLACK = 1.1

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
// speed allows, or the English line's own length (plus a little) if that is more.
export function charLimit(
  english: string,
  startMs: number,
  endMs: number,
  cpsLimit: number,
): number {
  const seconds = Math.max(0, endMs - startMs) / 1000
  const reading = Math.max(1, Math.floor(seconds * cpsLimit))
  return Math.max(reading, Math.ceil(visibleLength(english) * SOURCE_SLACK))
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
