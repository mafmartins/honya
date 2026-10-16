import { isRecord } from "../core/library/guards"
import type { ProviderId } from "../core/pipeline/types"
import { defaultModels } from "../core/providers/models"

export interface ModelPair {
  cheap: string
  strong: string
}

export interface TextFile {
  read(): string | null
  write(text: string): void
}

export interface ModelStore {
  get(provider: ProviderId): ModelPair
  set(provider: ProviderId, pair: ModelPair): ModelPair
  reset(provider: ProviderId): ModelPair
}

type Overrides = Partial<Record<ProviderId, ModelPair>>

const PROVIDERS = ["claude", "gpt", "gemini", "mistral"] as const

export function createModelStore(file: TextFile): ModelStore {
  const read = (): Overrides => parseOverrides(file.read())
  const write = (overrides: Overrides): void => {
    file.write(JSON.stringify(overrides, null, 2))
  }
  return {
    get(provider) {
      return read()[provider] ?? defaultModels(provider)
    },
    set(provider, pair) {
      const cheap = pair.cheap.trim()
      const strong = pair.strong.trim()
      if (cheap === "" || strong === "") {
        throw new Error("Model ids can't be empty.")
      }
      const overrides = read()
      overrides[provider] = { cheap, strong }
      write(overrides)
      return { cheap, strong }
    },
    reset(provider) {
      const overrides = read()
      const remaining: Overrides = {}
      for (const other of PROVIDERS) {
        const pair = overrides[other]
        if (other !== provider && pair !== undefined) {
          remaining[other] = pair
        }
      }
      write(remaining)
      return defaultModels(provider)
    },
  }
}

function parseOverrides(text: string | null): Overrides {
  if (text === null) {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }
  if (!isRecord(parsed)) {
    return {}
  }
  const overrides: Overrides = {}
  for (const provider of PROVIDERS) {
    const pair = parsed[provider]
    if (isRecord(pair) && typeof pair.cheap === "string" && typeof pair.strong === "string") {
      overrides[provider] = { cheap: pair.cheap, strong: pair.strong }
    }
  }
  return overrides
}
