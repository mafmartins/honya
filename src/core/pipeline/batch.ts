export interface Glossary {
  entries: { source: string; pt: string }[]
}

export function emptyGlossary(): Glossary {
  return { entries: [] }
}

export function addGlossary(
  glossary: Glossary,
  entries: { source: string; pt: string }[],
): Glossary {
  const seen = new Set(glossary.entries.map((e) => e.source))
  const appended: { source: string; pt: string }[] = []
  for (const entry of entries) {
    if (seen.has(entry.source)) {
      continue
    }
    seen.add(entry.source)
    appended.push(entry)
  }
  return { entries: [...glossary.entries, ...appended] }
}

export function chunkDialogue<T>(lines: T[], size = 25): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < lines.length; i += size) {
    chunks.push(lines.slice(i, i + size))
  }
  return chunks
}
