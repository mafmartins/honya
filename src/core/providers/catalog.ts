import type { ProviderId } from "../pipeline/types"
import { defaultModels } from "./models"

export interface ModelOption {
  id: string
  label: string
  recommended: boolean
}

// Curated choices for the model dropdowns; the recommended one in each tier is the
// provider's default.
const CHEAP: Record<ProviderId, readonly { id: string; label: string }[]> = {
  claude: [{ id: "claude-haiku-5-5", label: "Claude Haiku 5.5" }],
  gpt: [{ id: "gpt-6-luna", label: "GPT-6 Luna" }],
  gemini: [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  ],
  mistral: [{ id: "mistral-small-latest", label: "Mistral Small" }],
}

const STRONG: Record<ProviderId, readonly { id: string; label: string }[]> = {
  claude: [
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  ],
  gpt: [{ id: "gpt-6.1-sol", label: "GPT-6.1 Sol" }],
  gemini: [{ id: "gemini-4-argon", label: "Gemini 4 Argon" }],
  mistral: [{ id: "mistral-large-latest", label: "Mistral Large" }],
}

export function modelOptions(provider: ProviderId): {
  cheap: ModelOption[]
  strong: ModelOption[]
} {
  const defaults = defaultModels(provider)
  const mark = (
    list: readonly { id: string; label: string }[],
    recommended: string,
  ): ModelOption[] => list.map((item) => ({ ...item, recommended: item.id === recommended }))
  return {
    cheap: mark(CHEAP[provider], defaults.cheap),
    strong: mark(STRONG[provider], defaults.strong),
  }
}
