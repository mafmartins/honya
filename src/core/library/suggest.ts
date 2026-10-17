import type { ReplySchema } from "../pipeline/schemas"
import type { LineEdit } from "../session/types"
import type { Rule } from "./types"

// Rules from the translator's own work: one request drafts a rule from a single
// line, another suggests rules from a session's edits. Nothing is saved until the
// translator accepts it.

const MAX_SUGGESTIONS = 8

const RULE_PROPERTIES = {
  kind: { type: "string", enum: ["prose", "glossary"] },
  text: { type: "string" },
  source: { type: "string" },
  pt: { type: "string" },
}

export const DRAFT_SCHEMA: ReplySchema = {
  name: "drafted_rule",
  schema: {
    type: "object",
    properties: RULE_PROPERTIES,
    required: ["kind", "text", "source", "pt"],
    additionalProperties: false,
  },
}

export const SUGGESTIONS_SCHEMA: ReplySchema = {
  name: "suggested_rules",
  schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: { ...RULE_PROPERTIES, lines: { type: "array", items: { type: "integer" } } },
          required: ["kind", "text", "source", "pt", "lines"],
          additionalProperties: false,
        },
      },
    },
    required: ["suggestions"],
    additionalProperties: false,
  },
}

const RULE_FORMAT = [
  'A rule is either prose (kind "prose": one short sentence written as an instruction, such as "Use ...", in text) or a glossary entry (kind "glossary": the English term in source and the translator\'s Portuguese form in pt).',
  'Leave the fields the kind does not use as "".',
].join("\n")

export function draftRuleRequest(
  line: { en: string; before: string | null; after: string },
  known: readonly Rule[],
): { system: string; prompt: string; schema: ReplySchema } {
  const system = [
    "You turn one subtitle line the translator wrote into a rule that captures their own habits, so later translations follow it.",
    RULE_FORMAT,
    "Write the rule in plain English, concise. Do not restate a known rule. Reply with nothing but the JSON.",
  ].join("\n\n")
  const parts: string[] = []
  if (known.length > 0) {
    parts.push(`Known rules:\n${known.map(ruleLine).join("\n")}`)
  }
  parts.push(`English: ${line.en}`)
  parts.push(`Translator's Portuguese: ${line.after}`)
  if (line.before !== null) {
    parts.push(`The AI's earlier Portuguese: ${line.before}`)
  }
  return { system, prompt: parts.join("\n\n"), schema: DRAFT_SCHEMA }
}

export function readDraftedRule(value: unknown): Rule | null {
  return isRecord(value) ? readRule(value) : null
}

export function suggestionsRequest(
  edits: readonly LineEdit[],
  known: readonly Rule[],
): { system: string; prompt: string; schema: ReplySchema } {
  const system = [
    "You compare the AI's draft translations with what the translator finally wrote, to learn the translator's own habits.",
    RULE_FORMAT,
    `Suggest a rule only for a choice that looks deliberate and repeatable across lines, not a one-off fix. Never restate a known rule. At most ${String(MAX_SUGGESTIONS)} suggestions, in plain English, concise.`,
    "lines: the numbers in brackets of the lines that show the choice. Reply with nothing but the JSON.",
  ].join("\n\n")
  const parts: string[] = []
  if (known.length > 0) {
    parts.push(`Known rules:\n${known.map(ruleLine).join("\n")}`)
  }
  parts.push(
    `Edited lines:\n${edits
      .map(
        (edit) =>
          `[${String(edit.index)}] English: ${edit.en}\nDraft: ${edit.draft ?? "(none)"}\nFinal: ${edit.final}`,
      )
      .join("\n\n")}`,
  )
  return { system, prompt: parts.join("\n\n"), schema: SUGGESTIONS_SCHEMA }
}

export function readSuggestions(
  value: unknown,
  known: readonly Rule[],
): { rule: Rule; lines: number[] }[] {
  if (!isRecord(value) || !Array.isArray(value.suggestions)) {
    return []
  }
  const seen = new Set(known.map(ruleKey))
  const out: { rule: Rule; lines: number[] }[] = []
  for (const item of value.suggestions as readonly unknown[]) {
    if (out.length >= MAX_SUGGESTIONS) {
      break
    }
    if (!isRecord(item)) {
      continue
    }
    const rule = readRule(item)
    if (rule === null || seen.has(ruleKey(rule))) {
      continue
    }
    seen.add(ruleKey(rule))
    const lines = Array.isArray(item.lines)
      ? (item.lines as readonly unknown[]).filter(
          (line): line is number => typeof line === "number" && Number.isInteger(line),
        )
      : []
    out.push({ rule, lines })
  }
  return out
}

function readRule(item: Record<string, unknown>): Rule | null {
  if (item.kind === "prose" && typeof item.text === "string") {
    const text = item.text.trim()
    return text === "" ? null : { kind: "prose", text }
  }
  if (item.kind === "glossary" && typeof item.source === "string" && typeof item.pt === "string") {
    const source = item.source.trim()
    const pt = item.pt.trim()
    return source === "" || pt === "" ? null : { kind: "glossary", source, pt }
  }
  return null
}

function ruleKey(rule: Rule): string {
  return rule.kind === "prose"
    ? `prose:${rule.text.trim().toLowerCase()}`
    : `glossary:${rule.source.trim().toLowerCase()}`
}

function ruleLine(rule: Rule): string {
  return rule.kind === "prose" ? `- ${rule.text}` : `- ${rule.source} = ${rule.pt}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
