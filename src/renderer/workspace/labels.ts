import type { FrameSetting, Preset, ProviderId, Variant } from "../../shared/api"

const PROVIDER_NAME: Record<ProviderId, string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
  mistral: "Mistral",
}

export function providerName(id: ProviderId): string {
  return PROVIDER_NAME[id]
}

export const VARIANT_LABEL: Record<Variant, string> = {
  "pt-pt": "PT-PT (Portugal)",
  "pt-br": "PT-BR (Brasil)",
}

export const PRESET_LABEL: Record<Preset, string> = {
  save: "Save — cheapest",
  balanced: "Balanced",
  best: "Best — highest quality",
}

export const FRAMES: readonly FrameSetting[] = ["none", "marked", "every"]

export const FRAME_LABEL: Record<FrameSetting, string> = {
  none: "No frames",
  marked: "Only lines that need one",
  every: "Every line",
}
