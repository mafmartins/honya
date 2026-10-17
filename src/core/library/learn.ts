import { readAss, type DialogueCue } from "../ass/script"
import type { ReplySchema } from "../pipeline/schemas"
import type { GlossaryRule, ProseRule, Rule, Variant } from "./types"

// Learning from an episode the translator already did: one request reads their
// Portuguese (paired with the English when the English script is given) and proposes
// glossary entries and house rules. Nothing is saved until the translator picks what
// to keep.

export interface LearnScript {
  text: string
  dialogueStyles: readonly string[]
}

export interface Learned {
  glossary: GlossaryRule[]
  rules: ProseRule[]
  // How many English/Portuguese pairs the proposals came from; 0 without English.
  pairs: number
}

export const LEARN_SCHEMA: ReplySchema = {
  name: "learned_style",
  schema: {
    type: "object",
    properties: {
      glossary: {
        type: "array",
        items: {
          type: "object",
          properties: { source: { type: "string" }, pt: { type: "string" } },
          required: ["source", "pt"],
          additionalProperties: false,
        },
      },
      rules: { type: "array", items: { type: "string" } },
    },
    required: ["glossary", "rules"],
    additionalProperties: false,
  },
}

const LANGUAGE: Record<Variant, string> = {
  "pt-pt": "European Portuguese (PT-PT)",
  "pt-br": "Brazilian Portuguese (PT-BR)",
}

// Two cues are the same line when they start within this much of each other: fansub
// translations usually keep the English timing, give or take a frame or two.
const SAME_LINE_MS = 400
const MAX_LINES = 800

export function dialogueOf(script: LearnScript): DialogueCue[] {
  const styles = new Set(script.dialogueStyles)
  return readAss(script.text).filter((cue) => styles.has(cue.style) && cue.visible.trim() !== "")
}

// English/Portuguese pairs matched by start time; each cue is used at most once.
export function pairLines(
  english: readonly DialogueCue[],
  portuguese: readonly DialogueCue[],
): { en: string; pt: string }[] {
  const pairs: { en: string; pt: string }[] = []
  const used = new Set<number>()
  for (const pt of portuguese) {
    let best: DialogueCue | undefined
    for (const en of english) {
      if (used.has(en.index) || Math.abs(en.startMs - pt.startMs) > SAME_LINE_MS) {
        continue
      }
      if (
        best === undefined ||
        Math.abs(en.startMs - pt.startMs) < Math.abs(best.startMs - pt.startMs)
      ) {
        best = en
      }
    }
    if (best !== undefined) {
      used.add(best.index)
      pairs.push({ en: oneLine(best.visible), pt: oneLine(pt.visible) })
    }
  }
  return pairs
}

export function learnRequest(
  variant: Variant,
  portuguese: readonly DialogueCue[],
  english: readonly DialogueCue[] | null,
  known: readonly Rule[],
): { system: string; prompt: string; pairs: number } {
  const pairs = english === null ? [] : pairLines(english, portuguese)
  const withEnglish = pairs.length > 0
  const system = [
    `You study a fansub translator's finished ${LANGUAGE[variant]} subtitles for one series, so their next episodes can be translated the same way.`,
    withEnglish
      ? "You get each English line with the translator's Portuguese for it."
      : "You get only the translator's Portuguese lines; the English is not available.",
    [
      "glossary: names, places, techniques, titles, honorifics and recurring phrases the translator renders a fixed way.",
      withEnglish
        ? "source is the English as it appears in the English lines; pt is the translator's form."
        : "Only list a term when its English form is certain (a name or a romanised term kept as is, or an obvious set phrase); source is that English form.",
      "Skip common words with an ordinary translation. At most 40 entries.",
    ].join("\n"),
    [
      "rules: short, concrete instructions describing choices this translator makes consistently and that a new translator would not guess, such as:",
      '- how honorifics are handled ("keeps -san and -sama", "Nii-san becomes mano")',
      "- forms of address between characters (tu or você, formal or casual)",
      "- interjections, swearing and catchphrases they prefer",
      "- punctuation and formatting habits (ellipses, dashes, italics for thoughts)",
      'Each rule is one sentence, written as an instruction ("Use ..."). At most 12. Only rules the lines clearly support.',
    ].join("\n"),
    "Leave out anything already in the existing rules. Reply with nothing but the JSON.",
  ].join("\n\n")
  const lines = withEnglish
    ? pairs.slice(0, MAX_LINES).map((pair) => `${pair.en} => ${pair.pt}`)
    : portuguese.slice(0, MAX_LINES).map((cue) => oneLine(cue.visible))
  const parts: string[] = []
  if (known.length > 0) {
    parts.push(`Existing rules:\n${known.map(ruleLine).join("\n")}`)
  }
  parts.push(
    withEnglish
      ? `The lines, English => Portuguese:\n${lines.join("\n")}`
      : `The lines:\n${lines.join("\n")}`,
  )
  return { system, prompt: parts.join("\n\n"), pairs: pairs.length }
}

// Reads the reply, dropping malformed entries and anything the profile already has.
export function readLearned(
  value: unknown,
  known: readonly Rule[],
  pairs: number,
): Learned | string {
  if (!isRecord(value)) {
    return "the reply is not an object"
  }
  const knownSources = new Set(
    known.flatMap((rule) => (rule.kind === "glossary" ? [rule.source.trim().toLowerCase()] : [])),
  )
  const knownProse = new Set(
    known.flatMap((rule) => (rule.kind === "prose" ? [rule.text.trim().toLowerCase()] : [])),
  )
  const glossary: GlossaryRule[] = []
  for (const item of Array.isArray(value.glossary) ? (value.glossary as readonly unknown[]) : []) {
    if (!isRecord(item) || typeof item.source !== "string" || typeof item.pt !== "string") {
      continue
    }
    const source = item.source.trim()
    const pt = item.pt.trim()
    const key = source.toLowerCase()
    if (source === "" || pt === "" || knownSources.has(key)) {
      continue
    }
    knownSources.add(key)
    glossary.push({ kind: "glossary", source, pt })
  }
  const rules: ProseRule[] = []
  for (const item of Array.isArray(value.rules) ? (value.rules as readonly unknown[]) : []) {
    if (typeof item !== "string") {
      continue
    }
    const text = item.trim()
    if (text === "" || knownProse.has(text.toLowerCase())) {
      continue
    }
    knownProse.add(text.toLowerCase())
    rules.push({ kind: "prose", text })
  }
  return { glossary, rules, pairs }
}

function ruleLine(rule: Rule): string {
  return rule.kind === "prose" ? `- ${rule.text}` : `- ${rule.source} = ${rule.pt}`
}

function oneLine(text: string): string {
  return text.replace(/\\N/g, " ").replace(/\s+/g, " ").trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
