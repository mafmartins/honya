import type { ProviderId } from "../pipeline/types"

export function defaultModels(provider: ProviderId): { cheap: string; strong: string } {
  switch (provider) {
    case "claude":
      return { cheap: "claude-haiku-4-5", strong: "claude-sonnet-4-5" }
    case "gpt":
      return { cheap: "gpt-4.1-mini", strong: "gpt-4.1" }
    case "gemini":
      return { cheap: "gemini-2.5-flash", strong: "gemini-2.5-pro" }
    case "mistral":
      return { cheap: "mistral-small-latest", strong: "mistral-large-latest" }
  }
}
