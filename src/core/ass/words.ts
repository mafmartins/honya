export function replaceWords(
  raw: string,
  words: string,
): { ok: true; raw: string } | { ok: false } {
  if (countChar(raw, "{") !== countChar(raw, "}")) {
    return { ok: false }
  }

  const pieces = raw.split(/(\{[^}]*\})/g)
  const originalText = pieces.filter((piece) => !isOverrideBlock(piece)).join("")
  if (countHardBreaks(words) !== countHardBreaks(originalText)) {
    throw new Error("line breaks changed")
  }

  let placed = false
  const next = pieces.map((piece) => {
    if (isOverrideBlock(piece)) {
      return piece
    }
    if (!placed && piece.length > 0) {
      placed = true
      return words
    }
    return ""
  })

  return { ok: true, raw: next.join("") }
}

function isOverrideBlock(piece: string): boolean {
  return /^\{[^}]*\}$/.test(piece)
}

function countChar(text: string, char: string): number {
  let count = 0
  for (const unit of text) {
    if (unit === char) {
      count += 1
    }
  }
  return count
}

function countHardBreaks(text: string): number {
  return text.match(/\\N/g)?.length ?? 0
}
