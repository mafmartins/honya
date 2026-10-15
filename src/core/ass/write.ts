import { readAss, type DialogueCue } from "./script"
import { replaceWords } from "./words"

type Section = 0 | 1 | 2 | 3

type ReplaceOutcome =
  | { status: "ready"; raw: string }
  | { status: "unsafe" }
  | { status: "line-breaks" }

export function applyTranslations(
  original: string,
  dialogueStyles: ReadonlySet<string>,
  translations: Map<number, string>,
): { text: string; report: string[] } {
  const cues = readAss(original)
  const report: string[] = []
  const replacements = new Map<number, string>()

  for (const cue of cues) {
    if (!dialogueStyles.has(cue.style)) {
      continue
    }

    const translated = translations.get(cue.index)
    const outcome = replaceCueWords(cue.raw, translated ?? cue.raw)
    if (outcome.status === "line-breaks") {
      continue
    }
    if (outcome.status === "unsafe") {
      report.push(`event ${String(cue.index)}: tags could not be split`)
      continue
    }
    if (translated === undefined) {
      continue
    }
    replacements.set(cue.index, outcome.raw)
  }

  return { text: rewriteDialogue(original, cues, replacements), report }
}

function replaceCueWords(raw: string, words: string): ReplaceOutcome {
  try {
    const result = replaceWords(raw, words)
    if (!result.ok) {
      return { status: "unsafe" }
    }
    return { status: "ready", raw: result.raw }
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "line breaks changed") {
      return { status: "line-breaks" }
    }
    throw error
  }
}

function rewriteDialogue(
  original: string,
  cues: readonly DialogueCue[],
  replacements: ReadonlyMap<number, string>,
): string {
  const pieces: string[] = []
  const breaks = /\r?\n/g
  let section: Section = 0
  let dialogueIndex = 0
  let cursor = 0
  let match = breaks.exec(original)

  while (match !== null) {
    const line = original.slice(cursor, match.index)
    const stepped = stepLine(line, section, dialogueIndex, cues, replacements)
    pieces.push(stepped.text)
    pieces.push(match[0])
    section = stepped.section
    dialogueIndex = stepped.dialogueIndex
    cursor = match.index + match[0].length
    match = breaks.exec(original)
  }

  pieces.push(stepLine(original.slice(cursor), section, dialogueIndex, cues, replacements).text)
  return pieces.join("")
}

function stepLine(
  line: string,
  section: Section,
  dialogueIndex: number,
  cues: readonly DialogueCue[],
  replacements: ReadonlyMap<number, string>,
): { text: string; section: Section; dialogueIndex: number } {
  const trimmed = line.trim()
  if (/^;/.test(trimmed)) {
    return { text: line, section, dialogueIndex }
  }

  const nextSection = sectionAfter(trimmed, section)
  if (nextSection !== 3) {
    return { text: line, section: nextSection, dialogueIndex }
  }

  const header = /^(Comment|Dialogue)\s*:/i.exec(trimmed)
  const kind = header?.[1]
  if (kind === undefined || kind.toLowerCase() !== "dialogue") {
    return { text: line, section: nextSection, dialogueIndex }
  }

  const cue = cues[dialogueIndex]
  const nextIndex = dialogueIndex + 1
  const nextRaw = cue === undefined ? undefined : replacements.get(cue.index)
  if (cue === undefined || nextRaw === undefined) {
    return { text: line, section: nextSection, dialogueIndex: nextIndex }
  }

  return {
    text: replaceRaw(line, cue.raw, nextRaw),
    section: nextSection,
    dialogueIndex: nextIndex,
  }
}

function sectionAfter(line: string, section: Section): Section {
  if (/^\[Script Info\]/i.test(line)) {
    return 1
  }
  if (/^\[V4\+? Styles\]/i.test(line)) {
    return 2
  }
  if (/^\[Events\]/i.test(line)) {
    return 3
  }
  if (/^\[.*\]/.test(line)) {
    return 0
  }
  return section
}

function replaceRaw(line: string, raw: string, next: string): string {
  const at = line.lastIndexOf(raw)
  if (at < 0) {
    return line
  }
  return `${line.slice(0, at)}${next}${line.slice(at + raw.length)}`
}
