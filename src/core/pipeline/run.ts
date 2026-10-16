import { charactersPerSecond, exceedsLimit } from "../ass/fit"
import { appendNote } from "../ass/notes"
import { readAss, type DialogueCue } from "../ass/script"
import { applyTranslations } from "../ass/write"
import type { StyleCard } from "../library/types"
import { addGlossary, chunkDialogue, emptyGlossary, type Glossary } from "./batch"
import { escalationIds } from "./escalate"
import {
  batchPrompt,
  briefPrompt,
  briefSystem,
  charBudget,
  escalationPrompt,
  translatorSystem,
} from "./prompts"
import { readBriefReply, readLinesReply, type Term } from "./replies"
import { BRIEF_SCHEMA, LINES_SCHEMA, type ReplySchema } from "./schemas"
import type { LineResult, LineSignals, Preset } from "./types"

export type { LineResult }

export type RunEvent =
  | { type: "brief" }
  | { type: "batch"; index: number; total: number }
  | { type: "escalate"; count: number }
  | { type: "batch-done"; index: number; total: number; lines: LineResult[] }
  // A reply that couldn't be used, in whole or in part; worth logging.
  | { type: "problem"; tier: "cheap" | "strong"; reason: string; excerpt?: string }

export function totalBatches(lineCount: number): number {
  return chunkDialogue(new Array<null>(lineCount).fill(null)).length
}

export interface CompletionRequest {
  tier: "cheap" | "strong"
  system: string
  prompt: string
  schema: ReplySchema
  images?: { id: string; bytes: Uint8Array }[]
}

// The parsed JSON the model returned, or why there was none.
export type Completion = { value: unknown } | { refused: true; reason?: string; excerpt?: string }

export type Completer = (request: CompletionRequest) => Promise<Completion>

export interface SavedRun {
  completedBatches: number
  results: Map<string, LineResult>
  glossary: { source: string; pt: string }[]
  brief: string
  hardIds: string[]
  frameIds: string[]
  strongIds: string[]
}

export interface RunInput {
  ass: string
  dialogueStyles: ReadonlySet<string>
  card: StyleCard
  preset: Preset
  complete: Completer
  sleep: (ms: number) => Promise<void>
  stopAfterBatches?: number
  frameSetting?: "none" | "marked" | "every"
  // Asked for the frames one request needs, by line id, just before that request.
  frames?: FrameProvider
  onEvent?: (event: RunEvent) => void
}

export type FrameProvider = (ids: readonly string[]) => Promise<ReadonlyMap<string, Uint8Array>>

export interface RunResult {
  ass: string
  report: string[]
  saved: SavedRun
}

// Stored as the brief when the brief call failed, so a resumed run doesn't ask again.
const BRIEF_UNAVAILABLE = "brief unavailable"
const FAILED_REASON = "tradução falhou"
const CONTEXT_LINES = 3
const NO_FRAMES: FrameProvider = () => Promise.resolve(new Map())

type FrameSetting = "none" | "marked" | "every"
type FrameImage = { id: string; bytes: Uint8Array }
type Tier = "cheap" | "strong"
type Answer = { lines: Map<string, LineResult>; terms: Term[] }
type ChunkResult = { lines: LineResult[]; glossary: Glossary; strongIds: string[] }

interface BatchContext {
  input: RunInput
  system: string
  setting: FrameSetting
  frames: FrameProvider
  hardIds: ReadonlySet<string>
  frameIds: ReadonlySet<string>
  previous: { english: string; pt: string }[]
}

export async function runTranslation(input: RunInput): Promise<RunResult> {
  const cues = dialogueCues(input)
  input.onEvent?.({ type: "brief" })
  const brief = await requestBrief(input, cues)
  const saved: SavedRun = {
    completedBatches: 0,
    results: new Map(),
    glossary: addGlossary(emptyGlossary(), brief.terms).entries,
    brief: brief.summary,
    hardIds: brief.hard,
    frameIds: brief.frames,
    strongIds: [],
  }
  return continueTranslation(input, saved, cues)
}

export async function resumeTranslation(saved: SavedRun, input: RunInput): Promise<RunResult> {
  return continueTranslation(input, saved, dialogueCues(input))
}

function dialogueCues(input: RunInput): DialogueCue[] {
  return readAss(input.ass).filter((cue) => input.dialogueStyles.has(cue.style))
}

async function requestBrief(
  input: RunInput,
  cues: readonly DialogueCue[],
): Promise<{ summary: string; terms: Term[]; hard: string[]; frames: string[] }> {
  const unavailable = { summary: BRIEF_UNAVAILABLE, terms: [], hard: [], frames: [] }
  const reply = await input.complete({
    tier: "cheap",
    system: briefSystem(input.card.variant, input.frameSetting === "marked"),
    prompt: briefPrompt(cues),
    schema: BRIEF_SCHEMA,
  })
  if ("refused" in reply) {
    problem(input, "cheap", `brief: ${reply.reason ?? "refused"}`, reply.excerpt)
    return unavailable
  }
  const brief = readBriefReply(reply.value)
  if (typeof brief === "string") {
    problem(input, "cheap", `brief: ${brief}`)
    return unavailable
  }
  const known = new Set(cues.map((cue) => String(cue.index)))
  return {
    summary: brief.summary === "" ? BRIEF_UNAVAILABLE : brief.summary,
    terms: brief.terms,
    hard: brief.hard.filter((id) => known.has(id)),
    frames: brief.frames.filter((id) => known.has(id)),
  }
}

async function continueTranslation(
  input: RunInput,
  saved: SavedRun,
  cues: readonly DialogueCue[],
): Promise<RunResult> {
  const chunks = chunkDialogue([...cues])
  const system = translatorSystem(input.card, saved.brief === BRIEF_UNAVAILABLE ? "" : saved.brief)
  let glossary: Glossary = { entries: [...saved.glossary] }
  const results = new Map(saved.results)
  const strongIds = new Set(saved.strongIds)
  let completed = saved.completedBatches
  let current = saved

  for (let index = completed; index < chunks.length; index += 1) {
    if (input.stopAfterBatches !== undefined && completed >= input.stopAfterBatches) {
      break
    }
    const chunk = chunks[index]
    if (chunk === undefined) {
      break
    }
    input.onEvent?.({ type: "batch", index: index + 1, total: chunks.length })
    const context: BatchContext = {
      input,
      system,
      setting: input.frameSetting ?? "none",
      frames: input.frames ?? NO_FRAMES,
      hardIds: new Set(saved.hardIds),
      frameIds: new Set(saved.frameIds),
      previous: previousLines(chunks[index - 1] ?? [], results),
    }
    const translated = await translateChunk(context, chunk, glossary)
    for (const id of translated.strongIds) {
      strongIds.add(id)
    }
    for (const line of translated.lines) {
      results.set(line.id, line)
    }
    glossary = translated.glossary
    completed += 1
    current = {
      completedBatches: completed,
      results: new Map(results),
      glossary: glossary.entries,
      brief: saved.brief,
      hardIds: saved.hardIds,
      frameIds: saved.frameIds,
      strongIds: [...strongIds],
    }
    input.onEvent?.({
      type: "batch-done",
      index: index + 1,
      total: chunks.length,
      lines: translated.lines,
    })
  }

  return render(input, current)
}

// The last few lines of the previous batch, so a batch doesn't start cold.
function previousLines(
  chunk: readonly DialogueCue[],
  results: ReadonlyMap<string, LineResult>,
): { english: string; pt: string }[] {
  const previous: { english: string; pt: string }[] = []
  for (const cue of chunk.slice(-CONTEXT_LINES)) {
    const line = results.get(String(cue.index))
    if (line !== undefined && line.reason !== FAILED_REASON) {
      previous.push({ english: cue.visible, pt: withoutNote(line.words) })
    }
  }
  return previous
}

async function translateChunk(
  context: BatchContext,
  chunk: readonly DialogueCue[],
  glossary: Glossary,
): Promise<ChunkResult> {
  const { input } = context
  const cps = input.card.cpsLimit

  // Cheap pass, then one more cheap try for any line it left out.
  const cheap = await ask(context, "cheap", chunk, (cues) =>
    batchPrompt(cues, glossary.entries, context.previous, cps),
  )
  const missing = chunk.filter((cue) => !cheap.lines.has(String(cue.index)))
  if (missing.length > 0 && missing.length < chunk.length) {
    problem(input, "cheap", `left out lines ${missing.map((cue) => String(cue.index)).join(", ")}`)
  }
  if (missing.length > 0) {
    await input.sleep(0)
    const again = await ask(context, "cheap", missing, (cues) =>
      batchPrompt(cues, glossary.entries, context.previous, cps),
    )
    for (const [id, line] of again.lines) {
      cheap.lines.set(id, line)
    }
    cheap.terms.push(...again.terms)
  }
  let nextGlossary = addGlossary(glossary, cheap.terms)

  // Lines the preset sends to the strong model; a line the cheap pass never returned
  // counts as a doubt.
  const signals: LineSignals[] = chunk.map((cue) => {
    const id = String(cue.index)
    const line = cheap.lines.get(id)
    return {
      id,
      cheap: line?.mark ?? "doubt",
      briefHard: context.hardIds.has(id),
      unfit: line === undefined ? false : lineUnfit(line.words, cue, cps),
    }
  })
  const selected = new Set(escalationIds(input.preset, signals))
  const escalated = chunk.filter((cue) => selected.has(String(cue.index)))
  let strong: Answer = { lines: new Map(), terms: [] }
  if (escalated.length > 0) {
    input.onEvent?.({ type: "escalate", count: escalated.length })
    const drafts = new Map<string, string>()
    for (const [id, line] of cheap.lines) {
      drafts.set(id, line.words)
    }
    const flagged = escalated.map((cue) => ({
      cue,
      why: flaggedBecause(cue, cheap.lines.get(String(cue.index)), signals, cps),
    }))
    strong = await ask(context, "strong", escalated, () =>
      escalationPrompt(chunk, drafts, flagged, nextGlossary.entries, cps),
    )
    nextGlossary = addGlossary(nextGlossary, strong.terms)
  }

  const lines = chunk.map((cue) => {
    const id = String(cue.index)
    // A strong answer wins; without one, the cheap draft (with its note) beats English.
    const line = (selected.has(id) ? strong.lines.get(id) : undefined) ?? cheap.lines.get(id)
    return line === undefined ? englishFailure(cue) : finishLine(line, cue, cps)
  })
  return {
    lines,
    glossary: nextGlossary,
    strongIds: escalated.map((cue) => String(cue.index)).filter((id) => strong.lines.has(id)),
  }
}

// One request for `cues`; keeps only well-formed lines whose ids were asked for.
async function ask(
  context: BatchContext,
  tier: Tier,
  cues: readonly DialogueCue[],
  prompt: (cues: readonly DialogueCue[]) => string,
): Promise<Answer> {
  const { input } = context
  const images = await imagesFor(cues, context.setting, context.frames, context.frameIds)
  const request: CompletionRequest = {
    tier,
    system: context.system,
    prompt: prompt(cues),
    schema: LINES_SCHEMA,
  }
  if (images.length > 0) {
    request.images = images
  }
  const reply = await input.complete(request)
  const answer: Answer = { lines: new Map(), terms: [] }
  if ("refused" in reply) {
    problem(input, tier, reply.reason ?? "refused", reply.excerpt)
    return answer
  }
  const read = readLinesReply(reply.value)
  if (typeof read === "string") {
    problem(input, tier, read, JSON.stringify(reply.value).slice(0, 2000))
    return answer
  }
  const wanted = new Set(cues.map((cue) => String(cue.index)))
  for (const line of read.lines) {
    if (wanted.has(line.id) && !answer.lines.has(line.id)) {
      answer.lines.set(line.id, line)
    }
  }
  answer.terms = read.terms
  return answer
}

function flaggedBecause(
  cue: DialogueCue,
  line: LineResult | undefined,
  signals: readonly LineSignals[],
  cps: number,
): string {
  if (line === undefined) {
    return "the first pass gave no translation"
  }
  const signal = signals.find((s) => s.id === String(cue.index))
  const reasons: string[] = []
  if (line.mark === "doubt") {
    reasons.push("the first pass was unsure")
  } else if (line.mark === "hard-call") {
    reasons.push("a judgement call")
  } else if (line.mark === "mild") {
    reasons.push("worth a second look")
  }
  if (signal?.briefHard === true) {
    reasons.push("hard to translate")
  }
  if (signal?.unfit === true) {
    reasons.push(`too long, budget ${String(charBudget(cue, cps))} characters`)
  }
  const note = line.reason === undefined ? "" : ` (${line.reason})`
  return `${reasons.join("; ") || "worth a second look"}${note}`
}

function finishLine(line: LineResult, cue: DialogueCue, cpsLimit: number): LineResult {
  const unfit = lineUnfit(line.words, cue, cpsLimit)
  if (line.mark === "clean" && !unfit) {
    return copyLine(line, line.words)
  }
  return copyLine(line, appendNote(line.words, noteReason(line)))
}

function noteReason(line: LineResult): string {
  if (line.reason !== undefined) {
    return line.reason
  }
  if (line.mark === "doubt") {
    return "dúvida"
  }
  if (line.mark === "hard-call") {
    return "decisão difícil"
  }
  if (line.mark === "mild") {
    return "nota"
  }
  return "linha longa para o cue"
}

function lineUnfit(words: string, cue: DialogueCue, cpsLimit: number): boolean {
  return exceedsLimit(charactersPerSecond(words, cue.startMs, cue.endMs), cpsLimit)
}

function englishFailure(cue: DialogueCue): LineResult {
  return {
    id: String(cue.index),
    words: appendNote(cue.visible, FAILED_REASON),
    mark: "doubt",
    reason: FAILED_REASON,
  }
}

function copyLine(line: LineResult, words: string): LineResult {
  const next: LineResult = { id: line.id, words, mark: line.mark }
  if (line.reason !== undefined) {
    next.reason = line.reason
  }
  return next
}

function withoutNote(words: string): string {
  return words.replace(/\s*\{note: [^}]*\}$/, "")
}

function problem(input: RunInput, tier: Tier, reason: string, excerpt?: string): void {
  input.onEvent?.(
    excerpt === undefined
      ? { type: "problem", tier, reason }
      : { type: "problem", tier, reason, excerpt },
  )
}

async function imagesFor(
  cues: readonly DialogueCue[],
  setting: FrameSetting,
  frames: FrameProvider,
  frameIds: ReadonlySet<string>,
): Promise<FrameImage[]> {
  if (setting === "none") {
    return []
  }
  const ids = cues
    .map((cue) => String(cue.index))
    .filter((id) => setting === "every" || frameIds.has(id))
  if (ids.length === 0) {
    return []
  }
  const grabbed = await frames(ids)
  const images: FrameImage[] = []
  for (const id of ids) {
    const bytes = grabbed.get(id)
    if (bytes !== undefined) {
      images.push({ id, bytes })
    }
  }
  return images
}

function render(input: RunInput, saved: SavedRun): RunResult {
  const translations = new Map<number, string>()
  for (const [id, line] of saved.results) {
    const index = Number(id)
    if (!Number.isInteger(index)) {
      continue
    }
    translations.set(index, line.words)
  }
  const applied = applyTranslations(input.ass, input.dialogueStyles, translations)
  return { ass: applied.text, report: applied.report, saved }
}
