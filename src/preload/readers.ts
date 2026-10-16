import { isRecord, isRuleList, readBaseProfile } from "../core/library/guards"
import type {
  LoadedBase,
  ModelPair,
  PickedExample,
  PickedScript,
  PickedVideo,
  Rule,
  SeriesList,
  SeriesSummary,
} from "../shared/api"

const IPC_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/

export function ipcMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message.replace(IPC_PREFIX, "")
  }
  return "Something went wrong."
}

export function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

export function readNothing(value: unknown): undefined | null {
  return value === null || value === undefined ? undefined : null
}

export function readModelPair(value: unknown): ModelPair | null {
  if (!isRecord(value) || typeof value.cheap !== "string" || typeof value.strong !== "string") {
    return null
  }
  return { cheap: value.cheap, strong: value.strong }
}

export function readPickedScript(value: unknown): { value: PickedScript | null } | null {
  if (value === null) {
    return { value: null }
  }
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.name !== "string" ||
    typeof value.text !== "string"
  ) {
    return null
  }
  return { value: { path: value.path, name: value.name, text: value.text } }
}

export function readPickedVideo(value: unknown): { value: PickedVideo | null } | null {
  if (value === null) {
    return { value: null }
  }
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.name !== "string") {
    return null
  }
  return { value: { path: value.path, name: value.name } }
}

export function readPickedExample(value: unknown): { value: PickedExample | null } | null {
  if (value === null) {
    return { value: null }
  }
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.text !== "string") {
    return null
  }
  const styles = value.styles
  if (!Array.isArray(styles)) {
    return null
  }
  const listed: PickedExample["styles"] = []
  for (const style of styles) {
    if (!isRecord(style) || typeof style.name !== "string") {
      return null
    }
    const guess = style.guess
    if (guess !== "dialogue" && guess !== "skip" && guess !== "ambiguous") {
      return null
    }
    listed.push({ name: style.name, guess })
  }
  return { value: { name: value.name, text: value.text, styles: listed } }
}

export function readSeriesSummary(value: unknown): SeriesSummary | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null
  }
  const ruleCount = value.ruleCount
  if (typeof ruleCount !== "number" || !Number.isInteger(ruleCount)) {
    return null
  }
  return { id: value.id, name: value.name, ruleCount }
}

export function readSeriesList(value: unknown): SeriesList | null {
  if (!isRecord(value) || !Array.isArray(value.series) || !isStringList(value.problems)) {
    return null
  }
  const series: SeriesSummary[] = []
  for (const item of value.series) {
    const summary = readSeriesSummary(item)
    if (summary === null) {
      return null
    }
    series.push(summary)
  }
  return { series, problems: value.problems }
}

export function readRules(value: unknown): Rule[] | null {
  return isRuleList(value) ? value : null
}

export function readLoadedBase(value: unknown): LoadedBase | null {
  if (!isRecord(value) || !isStringList(value.problems)) {
    return null
  }
  const base = readBaseProfile(value.base)
  return base === null ? null : { base, problems: value.problems }
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}
