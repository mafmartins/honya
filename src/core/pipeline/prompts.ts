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

// Short lines carry no context, so they are where the other variant slips in. These
// pairs show the expected form for the usual suspects.
const EXAMPLES: Record<Variant, readonly [string, string][]> = {
  "pt-pt": [
    ["Damn it!", "Raios!"],
    ["Come here!", "Anda cá!"],
    ["What are you doing?", "O que estás a fazer?"],
    ["Tell me.", "Diz-me."],
    ["Cool!", "Fixe!"],
    ["Wow!", "Caramba!"],
    ["Hey, man.", "Ei, pá."],
    ["Shut up!", "Cala-te!"],
    ["Seriously?", "A sério?"],
    ["Okay, okay.", "Está bem, está bem."],
    ["Hi!", "Olá!"],
    ["The kids are waiting.", "Os miúdos estão à espera."],
    ["Breakfast is ready.", "O pequeno-almoço está pronto."],
    ["I'll call you on your phone.", "Ligo-te para o telemóvel."],
  ],
  "pt-br": [
    ["Damn it!", "Droga!"],
    ["Come here!", "Vem cá!"],
    ["What are you doing?", "O que você está fazendo?"],
    ["Tell me.", "Me diz."],
    ["Cool!", "Legal!"],
    ["Wow!", "Nossa!"],
    ["Hey, man.", "Ei, cara."],
    ["Shut up!", "Cala a boca!"],
    ["Seriously?", "Sério?"],
    ["Okay, okay.", "Tá bom, tá bom."],
    ["Hi!", "Oi!"],
    ["The kids are waiting.", "As crianças estão esperando."],
    ["Breakfast is ready.", "O café da manhã está pronto."],
    ["I'll call you on your phone.", "Te ligo no celular."],
  ],
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
  const parts = [`You translate subtitle dialogue from English into ${language} for a fansub.`]
  const rules = card.rules.map(ruleLine)
  if (rules.length > 0) {
    parts.push(
      `The translator's rules. Always follow them; they override everything below:\n${rules.map((r) => `- ${r}`).join("\n")}`,
    )
  }
  parts.push(
    [
      `Write natural, spoken ${language} that a native viewer expects from a good subtitle: idiomatic, not word for word.`,
      "Keep the meaning, tone, register and humour, and each speaker's way of talking.",
      "Use the speaker names to get gender agreement and forms of address right.",
      "Each line has a character budget: what a viewer can read in the time it is on screen, or the English line's own length if that is longer. Stay within it; condense rather than overflow, without losing meaning.",
      "Keep names as in the source.",
      "Line breaks: where the English has \\N, put one \\N at the natural place in your translation, written as a backslash and a capital N (never a newline). Add none where the English has none.",
    ].join("\n"),
    CONVENTIONS[card.variant],
    `Short lines are where the wrong variant slips in. For example:\n${EXAMPLES[card.variant].map(([en, pt]) => `${en} => ${pt}`).join("\n")}`,
    MARKS,
    "terms: names, places, techniques and recurring phrases you gave a fixed Portuguese form in this reply and that are not in the glossary yet; [] if none. terms may include names and terms taken from the translator's lines.",
    "Return one entry per requested id, with the same ids, and nothing but the JSON.",
  )
  const corrections = card.corrections ?? []
  if (corrections.length > 0) {
    parts.push(
      `Corrections this translator made to earlier drafts in this series. Make the same kind of choices:\n${corrections.map((c) => `${oneLine(c.en)} => ${oneLine(c.draft)} => corrected: ${oneLine(c.final)}`).join("\n")}`,
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
  // The translator's own lines among the ones to translate; they stay as they are.
  fixed: readonly { english: string; pt: string }[] = [],
  // The nearest lines after the batch that already have Portuguese.
  next: readonly { english: string; pt: string }[] = [],
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
  if (fixed.length > 0) {
    parts.push(
      `Already translated by the translator (keep these, context only):\n${fixed.map((p) => `${p.english} => ${p.pt}`).join("\n")}`,
    )
  }
  if (next.length > 0) {
    parts.push(
      `The lines just after, already translated (context only):\n${next.map((p) => `${p.english} => ${p.pt}`).join("\n")}`,
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

export function retranslatePrompt(
  cue: DialogueCue,
  context: {
    before: readonly { english: string; pt?: string }[]
    after: readonly { english: string; pt?: string }[]
  },
  current: string | undefined,
  hint: string,
  glossary: readonly Term[],
  cpsLimit: number,
): string {
  const parts: string[] = []
  if (glossary.length > 0) {
    parts.push(
      `Glossary (use these forms):\n${glossary.map((t) => `${t.source} = ${t.pt}`).join("\n")}`,
    )
  }
  const shown = (items: readonly { english: string; pt?: string }[]): string =>
    items.map((p) => (p.pt === undefined ? p.english : `${p.english} => ${p.pt}`)).join("\n")
  if (context.before.length > 0) {
    parts.push(`The lines just before (context only):\n${shown(context.before)}`)
  }
  if (context.after.length > 0) {
    parts.push(`The lines just after (context only):\n${shown(context.after)}`)
  }
  if (current !== undefined) {
    parts.push(
      `The current Portuguese for this line, which the translator wants redone:\n${current}`,
    )
  }
  if (hint.trim() !== "") {
    parts.push(`The translator asks: ${hint.trim()}`)
  }
  parts.push(
    `Translate this line again, differently from the current one if it was wrong. It is [id] (speaker, budget) English:\n${cueLine(cue, cpsLimit)}`,
  )
  return parts.join("\n\n")
}

export function fixPrompt(
  items: readonly { cue: DialogueCue; draft: string; problems: readonly string[] }[],
  glossary: readonly Term[],
  cpsLimit: number,
): string {
  const parts: string[] = []
  if (glossary.length > 0) {
    parts.push(
      `Glossary (use these forms):\n${glossary.map((t) => `${t.source} = ${t.pt}`).join("\n")}`,
    )
  }
  parts.push(
    "These drafts break a rule. Rewrite each one so the problem is gone, keeping its meaning, budget and line breaks.",
  )
  parts.push(
    `Each is [id] (speaker, budget) English => draft; problem:\n${items
      .map((item) => `${cueLine(item.cue, cpsLimit)} => ${item.draft}; ${item.problems.join("; ")}`)
      .join("\n")}`,
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
