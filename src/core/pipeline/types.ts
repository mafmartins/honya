export interface LineSignals {
  id: string
  cheap: "clean" | "doubt" | "hard-call" | "mild"
  briefHard: boolean
  unfit: boolean
}

export type Preset = "save" | "balanced" | "best"

export type ProviderId = "claude" | "gpt" | "gemini" | "mistral"
export type Variant = "pt-pt" | "pt-br"

export interface LineResult {
  id: string
  words: string
  mark: "clean" | "doubt" | "hard-call" | "mild"
  reason?: string
  glossary?: { source: string; pt: string }[]
  hardIds?: string[]
  frameIds?: string[]
}
