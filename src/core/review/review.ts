export interface DraftLine {
  eventIndex: number
  words: string
  note: string | null
  english: string
}

export interface Flag {
  eventIndex: number
  open: boolean
}

export interface Proposal {
  siblings: { eventIndex: number; words: string }[]
  rule: { kind: "prose"; text: string } | { kind: "glossary"; source: string; pt: string } | null
}

const STRUCTURAL_JSON =
  '{ "structural": boolean, "siblings": [{ "eventIndex", "words" }], "rule": null | { "kind": "prose", "text" } | { "kind": "glossary", "source", "pt" } }'

export function openFlags(lines: DraftLine[]): Flag[] {
  const flags: Flag[] = []
  for (const line of lines) {
    if (line.note !== null) {
      flags.push({ eventIndex: line.eventIndex, open: true })
    }
  }
  return flags
}

export function acceptFlag(flags: Flag[], eventIndex: number): Flag[] {
  return flags.map((flag) => (flag.eventIndex === eventIndex ? { ...flag, open: false } : flag))
}

export function canExport(flags: Flag[]): boolean {
  return flags.every((flag) => !flag.open)
}

export function applyLineEdit(lines: DraftLine[], eventIndex: number, words: string): DraftLine[] {
  return lines.map((line) => (line.eventIndex === eventIndex ? { ...line, words } : line))
}

export function applyProposal(
  lines: DraftLine[],
  proposal: Proposal,
  choice: "siblings" | "rule" | "decline-rule",
): { lines: DraftLine[]; rule: Proposal["rule"] | null } {
  if (choice === "decline-rule") {
    return { lines, rule: null }
  }
  if (choice === "rule") {
    return { lines, rule: proposal.rule }
  }
  return { lines: applySiblingWords(lines, proposal.siblings), rule: proposal.rule }
}

export async function proposeStructural(
  edit: { eventIndex: number; before: string; after: string },
  lines: DraftLine[],
  ask: (prompt: string) => Promise<{ text: string } | { refused: true }>,
): Promise<Proposal | null> {
  try {
    const reply = await ask(structuralPrompt(edit, lines))
    if (isRefusal(reply)) {
      return null
    }
    return parseProposal(reply.text)
  } catch {
    return null
  }
}

function applySiblingWords(
  lines: readonly DraftLine[],
  siblings: Proposal["siblings"],
): DraftLine[] {
  const wordsByEvent = new Map<number, string>()
  for (const sibling of siblings) {
    wordsByEvent.set(sibling.eventIndex, sibling.words)
  }
  return lines.map((line) => {
    const words = wordsByEvent.get(line.eventIndex)
    if (words === undefined) {
      return line
    }
    return { ...line, words }
  })
}

function structuralPrompt(
  edit: { eventIndex: number; before: string; after: string },
  lines: readonly DraftLine[],
): string {
  const shown = lines.map((line) => ({
    eventIndex: line.eventIndex,
    words: line.words,
    english: line.english,
  }))
  return [
    "Decide whether this dialogue edit is a structural change.",
    `Event ${String(edit.eventIndex)} changed from ${JSON.stringify(edit.before)} to ${JSON.stringify(edit.after)}.`,
    `Lines: ${JSON.stringify(shown)}`,
    `Reply with JSON ${STRUCTURAL_JSON}.`,
  ].join("\n")
}

function isRefusal(reply: { text: string } | { refused: true }): reply is { refused: true } {
  return "refused" in reply
}

function parseProposal(text: string): Proposal | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(parsed) || typeof parsed.structural !== "boolean") {
    return null
  }
  if (!parsed.structural) {
    return { siblings: [], rule: null }
  }
  const siblings = readSiblings(parsed.siblings)
  if (siblings === null || !("rule" in parsed)) {
    return null
  }
  const rule = readRule(parsed.rule)
  if (rule === undefined) {
    return null
  }
  return { siblings, rule }
}

function readSiblings(value: unknown): Proposal["siblings"] | null {
  if (!isUnknownArray(value)) {
    return null
  }
  const siblings: Proposal["siblings"] = []
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.eventIndex !== "number" ||
      !Number.isInteger(item.eventIndex)
    ) {
      return null
    }
    if (typeof item.words !== "string") {
      return null
    }
    siblings.push({ eventIndex: item.eventIndex, words: item.words })
  }
  return siblings
}

function readRule(value: unknown): Proposal["rule"] | undefined {
  if (value === null) {
    return null
  }
  if (!isRecord(value)) {
    return undefined
  }
  if (value.kind === "prose" && typeof value.text === "string") {
    return { kind: "prose", text: value.text }
  }
  if (
    value.kind === "glossary" &&
    typeof value.source === "string" &&
    typeof value.pt === "string"
  ) {
    return { kind: "glossary", source: value.source, pt: value.pt }
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}
