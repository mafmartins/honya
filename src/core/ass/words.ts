export function replaceWords(
  raw: string,
  words: string,
): { ok: true; raw: string } | { ok: false } {
  if (countChar(raw, "{") !== countChar(raw, "}")) {
    return { ok: false }
  }

  const pieces = raw.split(/(\{[^}]*\})/g)
  const originalText = pieces.filter((piece) => !isOverrideBlock(piece)).join("")
  const fitted = matchBreaks(words, countHardBreaks(originalText))

  const target = textTarget(pieces)
  let placed = false
  const next = pieces.map((piece, index) => {
    if (isOverrideBlock(piece)) {
      return piece
    }
    if (!placed && index === target) {
      placed = true
      return fitted
    }
    return ""
  })

  return { ok: true, raw: next.join("") }
}

// Gives `words` exactly `count` hard breaks (\N), so a line keeps the source's layout.
// A real newline, or the soft break \n a model writes by mistake, counts as a break; missing or extra breaks are placed again at the
// spaces nearest to even splits. A trailing {note: ...} stays after the words.
export function matchBreaks(words: string, count: number): string {
  const text = words.replace(/\r?\n|\\n/g, "\\N")
  if (countHardBreaks(text) === count) {
    return text
  }
  const noteAt = text.search(/\s*\{note: [^}]*\}$/)
  const body = noteAt < 0 ? text : text.slice(0, noteAt)
  const note = noteAt < 0 ? "" : text.slice(noteAt)
  const flat = body
    .split("\\N")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" ")
  return `${placeBreaks(flat, count)}${note}`
}

function placeBreaks(text: string, count: number): string {
  if (count === 0) {
    return text
  }
  const spaces: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === " ") {
      spaces.push(index)
    }
  }
  const chosen: number[] = []
  for (let k = 1; k <= count; k += 1) {
    const goal = (text.length * k) / (count + 1)
    let best: number | undefined
    for (const at of spaces) {
      if (chosen.includes(at)) {
        continue
      }
      if (best === undefined || Math.abs(at - goal) < Math.abs(best - goal)) {
        best = at
      }
    }
    if (best !== undefined) {
      chosen.push(best)
    }
  }
  chosen.sort((a, b) => a - b)
  let result = ""
  let cursor = 0
  for (const at of chosen) {
    result += `${text.slice(cursor, at)}\\N`
    cursor = at + 1
  }
  result += text.slice(cursor)
  // Too few spaces for every break: the rest go at the end so the count still matches.
  return result + "\\N".repeat(count - chosen.length)
}

function textTarget(pieces: readonly string[]): number | undefined {
  let lastText: number | undefined
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]
    if (piece === undefined || isOverrideBlock(piece)) {
      continue
    }
    if (piece.length > 0) {
      return index
    }
    lastText = index
  }
  return lastText
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
