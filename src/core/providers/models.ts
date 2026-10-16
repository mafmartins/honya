import type { ProviderId } from "../pipeline/types"

export function defaultModels(provider: ProviderId): { cheap: string; strong: string } {
  switch (provider) {
    case "claude":
      return { cheap: "claude-haiku-5-5", strong: "claude-sonnet-5-5" }
    case "gpt":
      return { cheap: "gpt-6-luna", strong: "gpt-6.1-sol" }
    case "gemini":
      return { cheap: "gemini-3.8-flash", strong: "gemini-4-argon" }
    case "mistral":
      return { cheap: "mistral-small-latest", strong: "mistral-large-latest" }
  }
}
