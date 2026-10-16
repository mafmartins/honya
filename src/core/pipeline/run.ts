import { charactersPerSecond, exceedsLimit } from "../ass/fit"
import { appendNote } from "../ass/notes"
import { readAss, type DialogueCue } from "../ass/script"
import { applyTranslations } from "../ass/write"
import type { StyleCard } from "../library/types"
import { addGlossary, chunkDialogue, emptyGlossary, withGlossary, type Glossary } from "./batch"
import { escalationIds } from "./escalate"
import type { LineResult, LineSignals, Preset } from "./types"

export type { LineResult }

export type RunEvent =
  | { type: "brief" }
  | { type: "batch"; index: number; total: number }
  | { type: "escalate"; count: number }
  | { type: "batch-done"; index: number; total: number; lines: LineResult[] }

export function totalBatches(lineCount: number): number {
  return chunkDialogue(new Array<null>(lineCount).fill(null)).length
}

export interface Completer {
  (request: {
    tier: "cheap" | "strong"
    prompt: string
    images?: { id: string; bytes: Uint8Array }[]
  }): Promise<{ lines: LineResult[] } | { refused: true }>
}

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

const BRIEF_ASK = '{ "glossary": [{ "source", "pt" }], "hardIds": string[], "frameIds": string[] }'
const BRIEF_UNAVAILABLE = "brief unavailable"
const FAILED_REASON = "tradução falhou"
const NO_FRAMES: FrameProvider = () => Promise.resolve(new Map())

type FrameSetting = "none" | "marked" | "every"
type Reply = { lines: LineResult[] } | { refused: true }
type FrameImage = { id: string; bytes: Uint8Array }
type BriefState = {
  text: string
  glossary: { source: string; pt: string }[]
  hardIds: string[]
  frameIds: string[]
}

export async function runTranslation(input: RunInput): Promise<RunResult> {
  const cues = dialogueCues(input)
  input.onEvent?.({ type: "brief" })
  const brief = await requestBrief(input, cues)
  const saved: SavedRun = {
    completedBatches: 0,
    results: new Map(),
    glossary: brief.glossary,
    brief: brief.text,
    hardIds: brief.hardIds,
    frameIds: brief.frameIds,
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

async function requestBrief(input: RunInput, cues: readonly DialogueCue[]): Promise<BriefState> {
  const prompt = withGlossary(input.card, BRIEF_ASK, emptyGlossary(), cuePromptLines(cues))
  const reply = await input.complete({ tier: "cheap", prompt })
  if (!hasLines(reply)) {
    return { text: BRIEF_UNAVAILABLE, glossary: [], hardIds: [], frameIds: [] }
  }
  return absorbBrief(reply.lines)
}

function absorbBrief(lines: readonly LineResult[]): BriefState {
  const glossaryEntries: { source: string; pt: string }[] = []
  const hardIds: string[] = []
  const frameIds: string[] = []
  const prose: string[] = []

  for (const line of lines) {
    if (line.glossary !== undefined) {
      glossaryEntries.push(...line.glossary)
    }
    if (line.hardIds !== undefined) {
      hardIds.push(...line.hardIds)
    }
    if (line.frameIds !== undefined) {
      frameIds.push(...line.frameIds)
    }
    const parsed = readBriefObject(line.words)
    if (parsed === null) {
      continue
    }
    glossaryEntries.push(...parsed.glossary)
    hardIds.push(...parsed.hardIds)
    frameIds.push(...parsed.frameIds)
    prose.push(line.words)
  }

  return {
    text: prose.length > 0 ? prose.join("\n") : "",
    glossary: addGlossary(emptyGlossary(), glossaryEntries).entries,
    hardIds: uniqueIds(hardIds),
    frameIds: uniqueIds(frameIds),
  }
}

async function continueTranslation(
  input: RunInput,
  saved: SavedRun,
  cues: readonly DialogueCue[],
): Promise<RunResult> {
  const chunks = chunkDialogue([...cues])
  const hardIds = new Set(saved.hardIds)
  const frameIds = new Set(saved.frameIds)
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
    const translated = await translateChunk(input, chunk, glossary, saved.brief, hardIds, frameIds)
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

async function translateChunk(
  input: RunInput,
  chunk: readonly DialogueCue[],
  glossary: Glossary,
  brief: string,
  hardIds: ReadonlySet<string>,
  frameIds: ReadonlySet<string>,
): Promise<{ lines: LineResult[]; glossary: Glossary; strongIds: string[] }> {
  const setting = input.frameSetting ?? "none"
  const frames = input.frames ?? NO_FRAMES
  const ids = chunk.map((cue) => String(cue.index))
  const cheapLines = await requestMatching(
    input,
    batchRequest(
      "cheap",
      withGlossary(input.card, brief, glossary, cuePromptLines(chunk)),
      await imagesFor(chunk, setting, frames, frameIds),
    ),
    ids,
    true,
  )

  if (cheapLines === undefined) {
    return escalateFailedChunk(input, chunk, glossary, brief, hardIds, frameIds, setting, frames)
  }

  let nextGlossary = takeGlossary(glossary, cheapLines)
  const signals = signalsFor(cheapLines, chunk, hardIds, input.card.cpsLimit)
  const selected = new Set(escalationIds(input.preset, signals))
  if (selected.size === 0) {
    return {
      lines: settleCheap(chunk, cheapLines, input.card.cpsLimit),
      glossary: nextGlossary,
      strongIds: [],
    }
  }

  const escalated = chunk.filter((cue) => selected.has(String(cue.index)))
  input.onEvent?.({ type: "escalate", count: escalated.length })
  const strongLines = await requestMatching(
    input,
    batchRequest(
      "strong",
      withGlossary(
        input.card,
        brief,
        nextGlossary,
        escalationPromptLines(escalated, signals, selected),
      ),
      await imagesFor(escalated, setting, frames, frameIds),
    ),
    escalated.map((cue) => String(cue.index)),
    false,
  )
  if (strongLines !== undefined) {
    nextGlossary = takeGlossary(nextGlossary, strongLines)
  }
  return {
    lines: mergePass(chunk, cheapLines, strongLines, selected, input.card.cpsLimit),
    glossary: nextGlossary,
    strongIds: strongIdsOf(escalated, strongLines),
  }
}

async function escalateFailedChunk(
  input: RunInput,
  chunk: readonly DialogueCue[],
  glossary: Glossary,
  brief: string,
  hardIds: ReadonlySet<string>,
  frameIds: ReadonlySet<string>,
  setting: FrameSetting,
  frames: FrameProvider,
): Promise<{ lines: LineResult[]; glossary: Glossary; strongIds: string[] }> {
  const signals: LineSignals[] = chunk.map((cue) => ({
    id: String(cue.index),
    cheap: "doubt",
    briefHard: hardIds.has(String(cue.index)),
    unfit: false,
  }))
  const selected = new Set(escalationIds(input.preset, signals))
  const escalated = chunk.filter((cue) => selected.has(String(cue.index)))
  if (escalated.length === 0) {
    return { lines: chunk.map(englishFailure), glossary, strongIds: [] }
  }

  input.onEvent?.({ type: "escalate", count: escalated.length })
  const strongLines = await requestMatching(
    input,
    batchRequest(
      "strong",
      withGlossary(
        input.card,
        brief,
        glossary,
        escalationPromptLines(escalated, signals, selected),
      ),
      await imagesFor(escalated, setting, frames, frameIds),
    ),
    escalated.map((cue) => String(cue.index)),
    false,
  )
  const nextGlossary = strongLines === undefined ? glossary : takeGlossary(glossary, strongLines)
  return {
    lines: mergePass(chunk, [], strongLines, selected, input.card.cpsLimit),
    glossary: nextGlossary,
    strongIds: strongIdsOf(escalated, strongLines),
  }
}

function strongIdsOf(
  escalated: readonly DialogueCue[],
  strongLines: readonly LineResult[] | undefined,
): string[] {
  if (strongLines === undefined) {
    return []
  }
  return escalated.map((cue) => String(cue.index))
}

async function requestMatching(
  input: RunInput,
  request: Parameters<Completer>[0],
  expectedIds: readonly string[],
  retry: boolean,
): Promise<LineResult[] | undefined> {
  const first = await input.complete(request)
  if (matchesBatch(first, expectedIds)) {
    return first.lines
  }
  if (!retry) {
    return undefined
  }
  await input.sleep(0)
  const second = await input.complete(request)
  if (matchesBatch(second, expectedIds)) {
    return second.lines
  }
  return undefined
}

function matchesBatch(
  reply: Reply,
  expectedIds: readonly string[],
): reply is { lines: LineResult[] } {
  if (!hasLines(reply)) {
    return false
  }
  if (reply.lines.length !== expectedIds.length) {
    return false
  }
  const got = new Set(reply.lines.map((line) => line.id))
  if (got.size !== expectedIds.length) {
    return false
  }
  return expectedIds.every((id) => got.has(id))
}

function hasLines(reply: Reply): reply is { lines: LineResult[] } {
  return "lines" in reply
}

function signalsFor(
  lines: readonly LineResult[],
  chunk: readonly DialogueCue[],
  hardIds: ReadonlySet<string>,
  cpsLimit: number,
): LineSignals[] {
  const signals: LineSignals[] = []
  for (const cue of chunk) {
    const line = findLine(lines, String(cue.index))
    if (line === undefined) {
      continue
    }
    signals.push({
      id: line.id,
      cheap: line.mark,
      briefHard: hardIds.has(line.id),
      unfit: lineUnfit(line.words, cue, cpsLimit),
    })
  }
  return signals
}

function settleCheap(
  chunk: readonly DialogueCue[],
  lines: readonly LineResult[],
  cpsLimit: number,
): LineResult[] {
  return chunk.map((cue) => {
    const line = findLine(lines, String(cue.index))
    if (line === undefined) {
      return englishFailure(cue)
    }
    return finishLine(line, cue, cpsLimit)
  })
}

function mergePass(
  chunk: readonly DialogueCue[],
  cheapLines: readonly LineResult[],
  strongLines: readonly LineResult[] | undefined,
  selected: ReadonlySet<string>,
  cpsLimit: number,
): LineResult[] {
  return chunk.map((cue) => {
    const id = String(cue.index)
    if (!selected.has(id)) {
      const cheap = findLine(cheapLines, id)
      return cheap === undefined ? englishFailure(cue) : finishLine(cheap, cue, cpsLimit)
    }
    if (strongLines === undefined) {
      return englishFailure(cue)
    }
    const strong = findLine(strongLines, id)
    return strong === undefined ? englishFailure(cue) : finishLine(strong, cue, cpsLimit)
  })
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
  if (line.glossary !== undefined) {
    next.glossary = line.glossary
  }
  if (line.hardIds !== undefined) {
    next.hardIds = line.hardIds
  }
  if (line.frameIds !== undefined) {
    next.frameIds = line.frameIds
  }
  return next
}

function escalationPromptLines(
  cues: readonly DialogueCue[],
  signals: readonly LineSignals[],
  selected: ReadonlySet<string>,
): { id: string; words: string }[] {
  const reasons = new Map<string, string>()
  for (const signal of signals) {
    if (selected.has(signal.id)) {
      reasons.set(signal.id, includedBecause(signal))
    }
  }
  return cues.map((cue) => {
    const id = String(cue.index)
    const reason = reasons.get(id)
    const words = reason === undefined ? cue.visible : `${cue.visible} [${reason}]`
    return { id, words }
  })
}

function includedBecause(signal: LineSignals): string {
  const reasons: string[] = []
  if (signal.cheap === "doubt") {
    reasons.push("dúvida")
  }
  if (signal.cheap === "hard-call") {
    reasons.push("decisão difícil")
  }
  if (signal.briefHard) {
    reasons.push("brief")
  }
  if (signal.unfit) {
    reasons.push("linha longa para o cue")
  }
  if (signal.cheap === "mild") {
    reasons.push("nota")
  }
  if (reasons.length === 0) {
    return "dúvida"
  }
  return reasons.join(", ")
}

function cuePromptLines(cues: readonly DialogueCue[]): { id: string; words: string }[] {
  return cues.map((cue) => ({ id: String(cue.index), words: cue.visible }))
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

function batchRequest(
  tier: "cheap" | "strong",
  prompt: string,
  images: FrameImage[],
): Parameters<Completer>[0] {
  if (images.length === 0) {
    return { tier, prompt }
  }
  return { tier, prompt, images }
}

function takeGlossary(glossary: Glossary, lines: readonly LineResult[]): Glossary {
  const entries: { source: string; pt: string }[] = []
  for (const line of lines) {
    if (line.glossary !== undefined) {
      entries.push(...line.glossary)
    }
  }
  return addGlossary(glossary, entries)
}

function findLine(lines: readonly LineResult[], id: string): LineResult | undefined {
  for (const line of lines) {
    if (line.id === id) {
      return line
    }
  }
  return undefined
}

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const id of ids) {
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    unique.push(id)
  }
  return unique
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

function readBriefObject(words: string): {
  glossary: { source: string; pt: string }[]
  hardIds: string[]
  frameIds: string[]
} | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(words)
  } catch {
    return null
  }
  if (!isRecord(parsed)) {
    return null
  }
  const glossary = readGlossaryEntries(parsed.glossary)
  const hardIds = readStringList(parsed.hardIds)
  const frameIds = readStringList(parsed.frameIds)
  if (glossary === undefined || hardIds === undefined || frameIds === undefined) {
    return null
  }
  return { glossary, hardIds, frameIds }
}

function readGlossaryEntries(value: unknown): { source: string; pt: string }[] | undefined {
  if (!isUnknownArray(value)) {
    return undefined
  }
  const entries: { source: string; pt: string }[] = []
  for (const item of value) {
    if (!isGlossaryEntry(item)) {
      return undefined
    }
    entries.push(item)
  }
  return entries
}

function readStringList(value: unknown): string[] | undefined {
  if (!isUnknownArray(value)) {
    return undefined
  }
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== "string") {
      return undefined
    }
    items.push(item)
  }
  return items
}

function isGlossaryEntry(value: unknown): value is { source: string; pt: string } {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.source === "string" && typeof value.pt === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}
