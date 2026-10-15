export const DEFAULT_CPS_LIMIT = 17

export function charactersPerSecond(
  words: string,
  startMs: number,
  endMs: number,
): number {
  const visible = words.replace(/\\N/g, "").replace(/\\n/g, "")
  const durationMs = endMs - startMs
  if (durationMs === 0) {
    return Infinity
  }
  return visible.length / (durationMs / 1000)
}

export function exceedsLimit(cps: number, limit: number): boolean {
  return cps > limit
}
