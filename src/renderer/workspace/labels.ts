import type { ProviderId, Variant } from "../../shared/api"

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
