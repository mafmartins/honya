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

  const target = textTarget(pieces)
  let placed = false
  const next = pieces.map((piece, index) => {
    if (isOverrideBlock(piece)) {
      return piece
    }
    if (!placed && index === target) {
      placed = true
      return words
    }
    return ""
  })

  return { ok: true, raw: next.join("") }
}

function textTarget(pieces: readonly string[]): number | undefined {
  let firstText: number | undefined
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]
    if (piece === undefined || isOverrideBlock(piece)) {
      continue
    }
    if (piece.length > 0) {
      return index
    }
    if (firstText === undefined) {
      firstText = index
    }
  }
  return firstText
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
