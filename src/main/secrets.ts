import type { ProviderId } from "../core/pipeline/types"

export interface SecretSafeStorage {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export interface SecretFile {
  read(): Buffer | null
  write(value: Buffer): void
}

export interface SecretStore {
  setKey(provider: ProviderId, key: string): void
  removeKey(provider: ProviderId): void
  hasKey(provider: ProviderId): boolean
  getKey(provider: ProviderId): string | null
}

const PROVIDERS = ["claude", "gpt", "gemini", "mistral"] as const
const NO_ENCRYPTION = "This system can't encrypt keys, so Honya won't store them."

export function createSecretStore(safeStorage: SecretSafeStorage, file: SecretFile): SecretStore {
  return {
    setKey(provider, key) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(NO_ENCRYPTION)
      }
      const keys = readKeys(safeStorage, file)
      keys[provider] = key
      file.write(safeStorage.encryptString(JSON.stringify(keys)))
    },
    removeKey(provider) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(NO_ENCRYPTION)
      }
      const keys = readKeys(safeStorage, file)
      const remaining: Partial<Record<ProviderId, string>> = {}
      for (const other of PROVIDERS) {
        const value = keys[other]
        if (other !== provider && value !== undefined) {
          remaining[other] = value
        }
      }
      file.write(safeStorage.encryptString(JSON.stringify(remaining)))
    },
    hasKey(provider) {
      if (!safeStorage.isEncryptionAvailable()) {
        return false
      }
      return storedKey(readKeys(safeStorage, file), provider) !== null
    },
    getKey(provider) {
      if (!safeStorage.isEncryptionAvailable()) {
        return null
      }
      return storedKey(readKeys(safeStorage, file), provider)
    },
  }
}

function readKeys(
  safeStorage: SecretSafeStorage,
  file: SecretFile,
): Partial<Record<ProviderId, string>> {
  const raw = file.read()
  if (raw === null) {
    return {}
  }
  return parseKeys(safeStorage.decryptString(raw))
}

function parseKeys(text: string): Partial<Record<ProviderId, string>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }
  if (!isRecord(parsed)) {
    return {}
  }
  const keys: Partial<Record<ProviderId, string>> = {}
  for (const provider of PROVIDERS) {
    const value = parsed[provider]
    if (typeof value === "string") {
      keys[provider] = value
    }
  }
  return keys
}

function storedKey(keys: Partial<Record<ProviderId, string>>, provider: ProviderId): string | null {
  const value = keys[provider]
  return value === undefined ? null : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
