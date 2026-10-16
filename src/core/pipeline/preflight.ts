import type { Preset, ProviderId, Variant } from "./types"

export interface PreflightInput {
  styleListAccepted: boolean
  dialogueStyleCount: number
  hasKey: boolean
  framesRequested: boolean
  ffmpegPresent: boolean
  provider: ProviderId
  preset: Preset
  dialogueLineCount: number
  frameCount: number
  sourcePath: string
  variant: Variant
}

export interface PreflightSummary {
  provider: ProviderId
  preset: Preset
  dialogueLineCount: number
  frameCount: number
  outputPath: string
}

export type PreflightFailureReason = "styles" | "key" | "no-dialogue" | "ffmpeg"

export type PreflightResult =
  { ok: true; summary: PreflightSummary } | { ok: false; reason: PreflightFailureReason }

export function proposedOutputPath(sourcePath: string, variant: Variant): string {
  const dot = sourcePath.lastIndexOf(".")
  const base = dot === -1 ? sourcePath : sourcePath.slice(0, dot)
  return `${base}.${variant}.ass`
}

export function preflight(input: PreflightInput): PreflightResult {
  if (!input.styleListAccepted) {
    return { ok: false, reason: "styles" }
  }
  if (!input.hasKey) {
    return { ok: false, reason: "key" }
  }
  if (input.dialogueStyleCount === 0) {
    return { ok: false, reason: "no-dialogue" }
  }
  if (input.framesRequested && !input.ffmpegPresent) {
    return { ok: false, reason: "ffmpeg" }
  }

  const outputPath = proposedOutputPath(input.sourcePath, input.variant)
  return {
    ok: true,
    summary: {
      provider: input.provider,
      preset: input.preset,
      dialogueLineCount: input.dialogueLineCount,
      frameCount: input.frameCount,
      outputPath,
    },
  }
}
