import { isFrameSetting, isPreset, isProviderId, isRecord, isVariant } from "../core/library/guards"
import type { FrameSetting, Variant } from "../core/library/types"
import type { Preset, ProviderId } from "../core/pipeline/types"
import { DEFAULT_EUR_RATE } from "../core/providers/prices"
import type { TextFile } from "./modelStore"

export interface AppSettings {
  setupDone: boolean
  defaultProvider: ProviderId
  defaults: { variant: Variant; preset: Preset; frameSetting: FrameSetting }
  eurRate: number
}

export interface SettingsStore {
  get(): AppSettings
  update(patch: Partial<AppSettings>): AppSettings
}

function defaultSettings(): AppSettings {
  return {
    setupDone: false,
    defaultProvider: "claude",
    defaults: { variant: "pt-pt", preset: "save", frameSetting: "none" },
    eurRate: DEFAULT_EUR_RATE,
  }
}

export function createSettingsStore(file: TextFile): SettingsStore {
  const read = (): AppSettings => parseSettings(file.read())
  return {
    get: read,
    update(patch) {
      const next = { ...read(), ...patch }
      if (!Number.isFinite(next.eurRate) || next.eurRate <= 0) {
        throw new Error("The euro rate must be a number above zero.")
      }
      file.write(JSON.stringify(next, null, 2))
      return next
    },
  }
}

function parseSettings(text: string | null): AppSettings {
  const settings = defaultSettings()
  if (text === null) {
    return settings
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return settings
  }
  if (!isRecord(parsed)) {
    return settings
  }
  if (typeof parsed.setupDone === "boolean") {
    settings.setupDone = parsed.setupDone
  }
  if (isProviderId(parsed.defaultProvider)) {
    settings.defaultProvider = parsed.defaultProvider
  }
  if (typeof parsed.eurRate === "number" && Number.isFinite(parsed.eurRate) && parsed.eurRate > 0) {
    settings.eurRate = parsed.eurRate
  }
  const defaults = parsed.defaults
  if (isRecord(defaults)) {
    if (isVariant(defaults.variant)) {
      settings.defaults.variant = defaults.variant
    }
    if (isPreset(defaults.preset)) {
      settings.defaults.preset = defaults.preset
    }
    if (isFrameSetting(defaults.frameSetting)) {
      settings.defaults.frameSetting = defaults.frameSetting
    }
  }
  return settings
}
