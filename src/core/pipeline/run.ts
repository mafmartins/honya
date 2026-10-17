import { tooLong } from "../ass/fit"
import { appendNote } from "../ass/notes"
import { readAss, type DialogueCue } from "../ass/script"
import { applyTranslations } from "../ass/write"
import type { FrameSetting, StyleCard } from "../library/types"
import type { AiLine } from "../session/lines"
import type { SessionBrief } from "../session/types"
import { addGlossary, chunkDialogue, emptyGlossary, type Glossary } from "./batch"
import { escalationIds } from "./escalate"
import { lineProblems, type LineProblem } from "./lint"
import {
  batchPrompt,
  briefPrompt,
  briefSystem,
  charBudget,
  escalationPrompt,
  fixPrompt,
  retranslatePrompt,
  translatorSystem,
} from "./prompts"
import { readBriefReply, readLinesReply, type Term } from "./replies"
import { BRIEF_SCHEMA, LINES_SCHEMA, type ReplySchema } from "./schemas"
import type { LineResult, LineSignals, Preset, Usage } from "./types"

export type { LineResult }

export type RunEvent =
  | { type: "brief" }
  | { type: "batch"; index: number; total: number }
  | { type: "escalate"; count: number }
  // Lines sent back to the cheap model to fix a variant form or a glossary rule.
  | { type: "fix"; count: number }
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

// The parsed JSON the model returned, or why there was none, and the tokens the
// request used when the provider said.
export type Completion = (
  { value: unknown } | { refused: true; reason?: string; excerpt?: string }
) & {
  spent?: { model: string; usage: Usage }
}

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

// Translates only the lines that have no Portuguese yet, with the lines that do as
// context. Each finished batch goes to `onBatch`; lines with no model answer are left
// out, so a later run tries them again.
export interface MissingInput {
  ass: string
  dialogueStyles: ReadonlySet<string>
  card: StyleCard
  preset: Preset
  complete: Completer
  sleep: (ms: number) => Promise<void>
  frameSetting: FrameSetting
  frames?: FrameProvider
  // Lines that already have Portuguese (manual or AI), by dialogue index.
  known: ReadonlyMap<number, string>
  // Which of `known` the translator wrote.
  manual: ReadonlySet<number>
  brief: SessionBrief | null
  glossary: { source: string; pt: string }[]
  shouldStop: () => boolean
  onBrief?: (brief: SessionBrief, glossary: { source: string; pt: string }[]) => void
  onBatch: (event: {
    index: number
    total: number
    lines: AiLine[]
    glossary: { source: string; pt: string }[]
  }) => void
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

type FrameImage = { id: string; bytes: Uint8Array }
type Tier = "cheap" | "strong"
type Answer = { lines: Map<string, LineResult>; terms: Term[] }
// What a line's answer was, before it is finished; undefined when no model answered.
type ChunkResult = {
  answers: { cue: DialogueCue; line: LineResult | undefined }[]
  glossary: Glossary
  strongIds: string[]
}
type Finished = { line: LineResult; note: string | null }

// What every request needs from either kind of run.
interface Engine {
  card: StyleCard
  preset: Preset
  complete: Completer
  sleep: (ms: number) => Promise<void>
  onEvent?: (event: RunEvent) => void
}

interface BatchContext {
  engine: Engine
  system: string
  setting: FrameSetting
  frames: FrameProvider
  hardIds: ReadonlySet<string>
  frameIds: ReadonlySet<string>
  previous: { english: string; pt: string }[]
  fixed: { english: string; pt: string }[]
}

export async function runTranslation(input: RunInput): Promise<RunResult> {
  const cues = dialogueCues(input)
  input.onEvent?.({ type: "brief" })
  const brief = await requestBrief(input, cues, input.frameSetting ?? "none")
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

export async function translateMissing(input: MissingInput): Promise<"done" | "stopped"> {
  const cues = readAss(input.ass).filter((cue) => input.dialogueStyles.has(cue.style))
  let glossary = addGlossary(emptyGlossary(), input.glossary)
  let brief = input.brief
  if (brief === null) {
    input.onEvent?.({ type: "brief" })
    const asked = await requestBrief(input, cues, input.frameSetting)
    brief = { summary: asked.summary, hardIds: asked.hard, frameIds: asked.frames }
    glossary = addGlossary(glossary, asked.terms)
    input.onBrief?.(brief, glossary.entries)
  }
  const system = translatorSystem(
    input.card,
    brief.summary === BRIEF_UNAVAILABLE ? "" : brief.summary,
  )
  const hardIds = new Set(brief.hardIds)
  const frameIds = new Set(brief.frameIds)
  // Portuguese so far: the session's, then each batch's as it lands.
  const pt = new Map(input.known)
  const chunks = chunkDialogue(
    cues.filter((cue) => !pt.has(cue.index) && !input.manual.has(cue.index)),
  )

  for (const [index, chunk] of chunks.entries()) {
    if (input.shouldStop()) {
      return "stopped"
    }
    const first = chunk[0]
    const last = chunk.at(-1)
    if (first === undefined || last === undefined) {
      continue
    }
    input.onEvent?.({ type: "batch", index: index + 1, total: chunks.length })
    const context: BatchContext = {
      engine: input,
      system,
      setting: input.frameSetting,
      frames: input.frames ?? NO_FRAMES,
      hardIds,
      frameIds,
      previous: knownBefore(cues, cues.indexOf(first), pt),
      fixed: cues.flatMap((cue) => {
        const words = pt.get(cue.index)
        return input.manual.has(cue.index) &&
          cue.index > first.index &&
          cue.index < last.index &&
          words !== undefined
          ? [{ english: cue.visible, pt: words }]
          : []
      }),
    }
    const translated = await translateChunk(context, chunk, glossary)
    glossary = translated.glossary
    const strong = new Set(translated.strongIds)
    const lines = translated.answers.flatMap(({ cue, line }): AiLine[] => {
      if (line === undefined) {
        return []
      }
      const done = finished(line, cue, input.card.cpsLimit, input)
      return [
        {
          index: cue.index,
          words: done.line.words,
          flag: done.note,
          strong: strong.has(String(cue.index)),
        },
      ]
    })
    for (const line of lines) {
      pt.set(line.index, line.words)
    }
    input.onBatch({ index: index + 1, total: chunks.length, lines, glossary: glossary.entries })
  }
  return "done"
}

export interface RetranslateInput {
  ass: string
  dialogueStyles: ReadonlySet<string>
  card: StyleCard
  complete: Completer
  index: number
  // What the translator told the AI about this line; may be empty.
  hint: string
  known: ReadonlyMap<number, string>
  brief: SessionBrief | null
  glossary: { source: string; pt: string }[]
  image?: Uint8Array
}

// One line again, by the strong model, with its neighbours and the translator's hint.
// The answer is checked like any other, so it can come back flagged; null when the
// model gave nothing usable.
export async function retranslateLine(input: RetranslateInput): Promise<AiLine | null> {
  const cues = readAss(input.ass).filter((cue) => input.dialogueStyles.has(cue.style))
  const position = cues.findIndex((cue) => cue.index === input.index)
  const cue = cues[position]
  if (cue === undefined) {
    return null
  }
  const engine: Engine = {
    card: input.card,
    preset: "save",
    complete: input.complete,
    sleep: () => Promise.resolve(),
  }
  const summary = input.brief?.summary ?? ""
  const context: BatchContext = {
    engine,
    system: translatorSystem(input.card, summary === BRIEF_UNAVAILABLE ? "" : summary),
    setting: input.image === undefined ? "none" : "every",
    frames: (ids) =>
      Promise.resolve(
        new Map(input.image === undefined ? [] : ids.map((id) => [id, input.image as Uint8Array])),
      ),
    hardIds: new Set(),
    frameIds: new Set(),
    previous: [],
    fixed: [],
  }
  const around = (items: readonly DialogueCue[]) =>
    items.map((item) => {
      const words = input.known.get(item.index)
      return words === undefined ? { english: item.visible } : { english: item.visible, pt: words }
    })
  const answer = await ask(context, "strong", [cue], () =>
    retranslatePrompt(
      cue,
      {
        before: around(cues.slice(Math.max(0, position - CONTEXT_LINES), position)),
        after: around(cues.slice(position + 1, position + 1 + CONTEXT_LINES)),
      },
      input.known.get(cue.index),
      input.hint,
      input.glossary,
      input.card.cpsLimit,
    ),
  )
  const line = answer.lines.get(String(cue.index))
  if (line === undefined) {
    return null
  }
  const done = finished(line, cue, input.card.cpsLimit, engine)
  return { index: cue.index, words: done.line.words, flag: done.note, strong: true }
}

// Up to CONTEXT_LINES of the nearest lines before `position` that have Portuguese.
function knownBefore(
  cues: readonly DialogueCue[],
  position: number,
  pt: ReadonlyMap<number, string>,
): { english: string; pt: string }[] {
  const previous: { english: string; pt: string }[] = []
  for (let i = position - 1; i >= 0 && previous.length < CONTEXT_LINES; i -= 1) {
    const cue = cues[i]
    const words = cue === undefined ? undefined : pt.get(cue.index)
    if (cue !== undefined && words !== undefined) {
      previous.unshift({ english: cue.visible, pt: words })
    }
  }
  return previous
}

async function requestBrief(
  input: Engine,
  cues: readonly DialogueCue[],
  frameSetting: FrameSetting,
): Promise<{ summary: string; terms: Term[]; hard: string[]; frames: string[] }> {
  const unavailable = { summary: BRIEF_UNAVAILABLE, terms: [], hard: [], frames: [] }
  const reply = await input.complete({
    tier: "cheap",
    system: briefSystem(input.card.variant, frameSetting === "marked"),
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
      engine: input,
      system,
      setting: input.frameSetting ?? "none",
      frames: input.frames ?? NO_FRAMES,
      hardIds: new Set(saved.hardIds),
      frameIds: new Set(saved.frameIds),
      previous: previousLines(chunks[index - 1] ?? [], results),
      fixed: [],
    }
    const translated = await translateChunk(context, chunk, glossary)
    for (const id of translated.strongIds) {
      strongIds.add(id)
    }
    const lines = translated.answers.map(({ cue, line }) =>
      line === undefined ? englishFailure(cue) : finishLine(line, cue, input.card.cpsLimit, input),
    )
    for (const line of lines) {
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
      lines,
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
  const input = context.engine
  const cps = input.card.cpsLimit

  // Cheap pass, then one more cheap try for any line it left out.
  const cheap = await ask(context, "cheap", chunk, (cues) =>
    batchPrompt(cues, glossary.entries, context.previous, cps, context.fixed),
  )
  const missing = chunk.filter((cue) => !cheap.lines.has(String(cue.index)))
  if (missing.length > 0 && missing.length < chunk.length) {
    problem(input, "cheap", `left out lines ${missing.map((cue) => String(cue.index)).join(", ")}`)
  }
  if (missing.length > 0) {
    await input.sleep(0)
    const again = await ask(context, "cheap", missing, (cues) =>
      batchPrompt(cues, glossary.entries, context.previous, cps, context.fixed),
    )
    for (const [id, line] of again.lines) {
      cheap.lines.set(id, line)
    }
    cheap.terms.push(...again.terms)
  }
  let nextGlossary = addGlossary(glossary, cheap.terms)

  // Drafts that use the other variant's forms or break a glossary rule get one small
  // cheap request to fix just those lines; a fix is kept only if it clears the problem.
  const broken = chunk.flatMap((cue) => {
    const line = cheap.lines.get(String(cue.index))
    if (line === undefined) {
      return []
    }
    const problems = problemsOf(input, cue, line.words)
    return problems.length === 0
      ? []
      : [{ cue, draft: line.words, problems: problems.map((p) => p.problem) }]
  })
  if (broken.length > 0) {
    input.onEvent?.({ type: "fix", count: broken.length })
    const fixed = await ask(
      context,
      "cheap",
      broken.map((item) => item.cue),
      () => fixPrompt(broken, nextGlossary.entries, cps),
    )
    for (const item of broken) {
      const id = String(item.cue.index)
      const line = fixed.lines.get(id)
      if (line !== undefined && problemsOf(input, item.cue, line.words).length === 0) {
        cheap.lines.set(id, line)
      }
    }
    nextGlossary = addGlossary(nextGlossary, fixed.terms)
  }

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

  const answers = chunk.map((cue) => {
    const id = String(cue.index)
    // A strong answer wins; without one, the cheap draft (with its note) beats English.
    const line = (selected.has(id) ? strong.lines.get(id) : undefined) ?? cheap.lines.get(id)
    return { cue, line }
  })
  return {
    answers,
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
  const input = context.engine
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

function finishLine(
  line: LineResult,
  cue: DialogueCue,
  cpsLimit: number,
  input: Engine,
): LineResult {
  const done = finished(line, cue, cpsLimit, input)
  return done.note === null
    ? done.line
    : copyLine(done.line, appendNote(done.line.words, done.note))
}

// The line's words without a note, and the note review should show, if any.
function finished(line: LineResult, cue: DialogueCue, cpsLimit: number, input: Engine): Finished {
  const unfit = lineUnfit(line.words, cue, cpsLimit)
  // A problem the fix request couldn't clear always shows in review.
  const problems = problemsOf(input, cue, line.words)
  if (problems.length > 0) {
    const reasons = [...new Set(problems.map((p) => p.note))]
    if (line.reason !== undefined) {
      reasons.push(line.reason)
    }
    const flagged: LineResult = { ...line, mark: line.mark === "clean" ? "mild" : line.mark }
    flagged.reason = reasons.join("; ")
    return { line: copyLine(flagged, line.words), note: flagged.reason }
  }
  if (line.mark === "clean" && !unfit) {
    return { line: copyLine(line, line.words), note: null }
  }
  return { line: copyLine(line, line.words), note: noteReason(line) }
}

function problemsOf(input: Engine, cue: DialogueCue, words: string): LineProblem[] {
  return lineProblems(cue.visible, words, input.card.variant, input.card.rules)
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
  return tooLong(words, cue.visible, cue.startMs, cue.endMs, cpsLimit)
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

function problem(input: Engine, tier: Tier, reason: string, excerpt?: string): void {
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
