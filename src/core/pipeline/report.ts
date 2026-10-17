import { readAss } from "../ass/script"
import { tooLong } from "../ass/fit"
import type { LineResult } from "./types"

const FAILED_REASON = "tradução falhou"

export interface TranslateReport {
  dialogueLines: number
  translated: number
  strongModel: number
  leftInEnglish: number
  overLimit: number
  flags: number
  editedFlags: number
  acceptedAsIs: number
  rulesSaved: { series: number; base: number }
  framesUsed: number
  frameFailures: number
  unchanged: number
  elapsedMs: number
  outputPath: string
}

export function buildReport(input: {
  ass: string
  dialogueStyles: ReadonlySet<string>
  finalWords: Map<number, string>
  results: Map<string, LineResult>
  strongIds: readonly string[]
  cpsLimit: number
  flagged: readonly number[]
  edited: readonly number[]
  rules: readonly { target: "series" | "base" }[]
  framesUsed: number
  frameNotes: readonly string[]
  writeReport: readonly string[]
  elapsedMs: number
  outputPath: string
}): TranslateReport {
  const dialogue = readAss(input.ass).filter((cue) => input.dialogueStyles.has(cue.style))
  const dialogueLines = dialogue.length
  const leftInEnglish = [...input.results.values()].filter(
    (result) => result.reason === FAILED_REASON,
  ).length
  const overLimit = dialogue.filter((cue) => {
    const words = input.finalWords.get(cue.index) ?? cue.visible
    return tooLong(words, cue.visible, cue.startMs, cue.endMs, input.cpsLimit)
  }).length
  const edited = new Set(input.edited)
  const editedFlags = input.flagged.filter((index) => edited.has(index)).length

  return {
    dialogueLines,
    translated: dialogueLines - leftInEnglish,
    strongModel: input.strongIds.length,
    leftInEnglish,
    overLimit,
    flags: input.flagged.length,
    editedFlags,
    acceptedAsIs: input.flagged.length - editedFlags,
    rulesSaved: {
      series: input.rules.filter((rule) => rule.target === "series").length,
      base: input.rules.filter((rule) => rule.target === "base").length,
    },
    framesUsed: input.framesUsed,
    frameFailures: input.frameNotes.length,
    unchanged: input.writeReport.length,
    elapsedMs: input.elapsedMs,
    outputPath: input.outputPath,
  }
}
