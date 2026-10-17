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
}

// Tokens used by requests. `output` includes thinking; `cached` is the part of `input`
// read from the provider's prompt cache.
export interface Usage {
  input: number
  output: number
  cached: number
}

// What one model used over a run.
export interface ModelSpend extends Usage {
  model: string
  requests: number
}
