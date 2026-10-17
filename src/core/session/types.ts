import type { FrameSetting, Variant } from "../library/types"
import type { ModelSpend, Preset, ProviderId } from "../pipeline/types"

export type LineOrigin = "ai" | "manual"
export type Resolution = "accepted" | "edited" | "retranslated"

export interface SessionLine {
  // Dialogue event index from readAss.
  index: number
  // Portuguese without the note; null = untranslated.
  words: string | null
  origin: LineOrigin | null
  // Open flag reason (Portuguese), null = none.
  flag: string | null
  resolution: Resolution | null
  // Last AI text, kept for corrections.
  aiDraft: string | null
  // The last AI text came from the strong model.
  strong: boolean
  // Times "Ask AI again" was used.
  retranslated: number
}

export interface LineEdit {
  index: number
  en: string
  draft: string | null
  final: string
}

export interface SessionBrief {
  summary: string
  hardIds: string[]
  frameIds: string[]
}

export interface WorkSession {
  version: 3
  id: string
  projectId: string
  variant: Variant
  createdAt: string
  updatedAt: string
  scriptPath: string
  scriptName: string
  scriptText: string
  dialogueStyles: string[]
  videoPath: string | null
  provider: ProviderId
  preset: Preset
  frameSetting: FrameSetting
  brief: SessionBrief | null
  glossary: { source: string; pt: string }[]
  lines: SessionLine[]
  edits: LineEdit[]
  spend: ModelSpend[]
  activeMs: number
  framesGrabbed: number
  exportedAt: string | null
  finishedOverride: boolean | null
}
