import { charLimit } from "../ass/fit"
import type { DialogueCue } from "../ass/script"
import type { Rule, StyleCard, Variant } from "../library/types"
import type { Term } from "./replies"

// Every request is a system prompt that stays the same for the whole run (so providers
// can cache it) and a short user message with the lines. Keep the wording plain: the
// cheap models follow short, concrete instructions best.

export interface Prompt {
  system: string
  prompt: string
}

const VOICE_SAMPLE_LINES = 40

const LANGUAGE: Record<Variant, string> = {
  "pt-pt": "European Portuguese (PT-PT, as spoken in Portugal)",
  "pt-br": "Brazilian Portuguese (PT-BR)",
}

const CONVENTIONS: Record<Variant, string> = {
  "pt-pt": [
    "PT-PT conventions, never Brazilian forms:",
    '- "tu" with its verb forms for informal address; "você" only when the source is formal or distant.',
    '- "estar a" + infinitive, not the gerund ("estou a fazer", not "estou fazendo").',
    '- Enclitic pronouns in statements ("diz-me", "vou contar-te").',
    "- European vocabulary: comboio, autocarro, telemóvel, casa de banho, pequeno-almoço, rapariga, giro, fixe.",
  ].join("\n"),
  "pt-br": [
    "PT-BR conventions, never European forms:",
    '- "você" for informal address; "a gente" is fine in casual speech.',
    '- The gerund for ongoing actions ("estou fazendo").',
    '- Spoken pronoun placement ("me diz", "te conto").',
    "- Brazilian vocabulary: trem, ônibus, celular, banheiro, café da manhã, garota, legal.",
  ].join("\n"),
}

const MARKS = [
  "Mark each line:",
  "- clean: you are confident and it fits the budget.",
  "- mild: fine, but a reviewer should glance at it (softened wordplay, a small liberty).",
  "- hard-call: the meaning is clear but the rendering is a judgement call (pun, cultural reference, register).",
  "- doubt: you are unsure what the line means or who it refers to.",
  'note: "" for clean lines; otherwise at most 8 words, in Portuguese, saying why.',
].join("\n")

export function translatorSystem(card: StyleCard, brief: string): string {
  const language = LANGUAGE[card.variant]
  const parts = [
    `You translate subtitle dialogue from English into ${language} for a fansub.`,
    [
      `Write natural, spoken ${language} that a native viewer expects from a good subtitle: idiomatic, not word for word.`,
      "Keep the meaning, tone, register and humour, and each speaker's way of talking.",
      "Use the speaker names to get gender agreement and forms of address right.",
      "Each line has a character budget: what a viewer can read in the time it is on screen, or the English line's own length if that is longer. Stay within it; condense rather than overflow, without losing meaning.",
      "Keep names as in the source. Use \\N for a line break only where the source has one; never more than two lines.",
    ].join("\n"),
    CONVENTIONS[card.variant],
    MARKS,
    "terms: names, places, techniques and recurring phrases you gave a fixed Portuguese form in this reply and that are not in the glossary yet; [] if none.",
    "Return one entry per requested id, with the same ids, and nothing but the JSON.",
  ]
  const rules = card.rules.map(ruleLine)
  if (rules.length > 0) {
    parts.push(
      `House rules (follow them over anything above):\n${rules.map((r) => `- ${r}`).join("\n")}`,
    )
  }
  const voice = voiceSample(card.voice)
  if (voice !== "") {
    parts.push(`Lines from the translator's earlier work, to match their voice:\n${voice}`)
  }
  if (brief !== "") {
    parts.push(`About this episode:\n${brief}`)
  }
  return parts.join("\n\n")
}

export function batchPrompt(
  cues: readonly DialogueCue[],
  glossary: readonly Term[],
  previous: readonly { english: string; pt: string }[],
  cpsLimit: number,
): string {
  const parts: string[] = []
  if (glossary.length > 0) {
    parts.push(
      `Glossary (use these forms):\n${glossary.map((t) => `${t.source} = ${t.pt}`).join("\n")}`,
    )
  }
  if (previous.length > 0) {
    parts.push(
      `The lines just before, already translated (context only):\n${previous.map((p) => `${p.english} => ${p.pt}`).join("\n")}`,
    )
  }
  parts.push(
    `Translate these lines. Each is [id] (speaker, budget) English:\n${cues.map((cue) => cueLine(cue, cpsLimit)).join("\n")}`,
  )
  return parts.join("\n\n")
}

export function escalationPrompt(
  batch: readonly DialogueCue[],
  drafts: ReadonlyMap<string, string>,
  flagged: readonly { cue: DialogueCue; why: string }[],
  glossary: readonly Term[],
  cpsLimit: number,
): string {
  const parts: string[] = []
  if (glossary.length > 0) {
    parts.push(
      `Glossary (use these forms):\n${glossary.map((t) => `${t.source} = ${t.pt}`).join("\n")}`,
    )
  }
  const context = batch.map((cue) => {
    const draft = drafts.get(String(cue.index))
    return draft === undefined ? cueLine(cue, cpsLimit) : `${cueLine(cue, cpsLimit)} => ${draft}`
  })
  parts.push(
    `A first pass translated this scene; each is [id] (speaker, budget) English => draft:\n${context.join("\n")}`,
  )
  parts.push(
    `Give your own translation of only these lines, fixing what the first pass got wrong:\n${flagged.map((f) => `[${String(f.cue.index)}] ${f.why}`).join("\n")}`,
  )
  return parts.join("\n\n")
}

export function briefSystem(variant: Variant, framesWanted: boolean): string {
  const language = LANGUAGE[variant]
  return [
    `You prepare a short brief for a translator who will put this episode's English subtitles into ${language}.`,
    [
      "summary: at most 120 words. Who the main speakers are and their gender, how they address each other (formal or informal), the tone, and any running joke or wordplay to keep consistent.",
      "terms: names, places, techniques and recurring phrases with the Portuguese form to use every time (keep names unchanged unless there is an established Portuguese form).",
      "hard: ids of lines that are hard to translate well (puns, idioms, cultural references, ambiguous meaning). Usually a handful.",
      framesWanted
        ? "frames: ids of lines where seeing the video would change the translation (who is addressed, an object or sign on screen). At most one line in ten."
        : "frames: [].",
    ].join("\n"),
    "Reply with nothing but the JSON.",
  ].join("\n\n")
}

export function briefPrompt(cues: readonly DialogueCue[]): string {
  return `The episode, each line as [id] (speaker) English:\n${cues.map((cue) => `[${String(cue.index)}] ${speaker(cue)}${oneLine(cue.visible)}`).join("\n")}`
}

function cueLine(cue: DialogueCue, cpsLimit: number): string {
  const name = cue.name.trim() === "" ? "?" : cue.name.trim()
  return `[${String(cue.index)}] (${name}, ${String(charBudget(cue, cpsLimit))}) ${cue.visible}`
}

function speaker(cue: DialogueCue): string {
  const name = cue.name.trim()
  return name === "" ? "" : `(${name}) `
}

function oneLine(text: string): string {
  return text.replace(/\\N/g, " ")
}

export function charBudget(cue: DialogueCue, cpsLimit: number): number {
  return charLimit(cue.visible, cue.startMs, cue.endMs, cpsLimit)
}

function ruleLine(rule: Rule): string {
  return rule.kind === "prose" ? rule.text : `${rule.source} = ${rule.pt}`
}

// The card's voice is the text of the example scripts; a spread of lines is enough to
// show the voice, and keeps every request small however many examples there are.
export function voiceSample(voice: string, limit = VOICE_SAMPLE_LINES): string {
  const lines = voice
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
  if (lines.length <= limit) {
    return lines.join("\n")
  }
  const step = lines.length / limit
  const picked: string[] = []
  for (let i = 0; i < limit; i += 1) {
    const line = lines[Math.floor(i * step)]
    if (line !== undefined) {
      picked.push(line)
    }
  }
  return picked.join("\n")
}
