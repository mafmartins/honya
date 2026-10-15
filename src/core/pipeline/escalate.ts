import type { LineSignals, Preset } from "./types"

function shouldEscalate(line: LineSignals, preset: Preset): boolean {
  if (line.cheap === "doubt" || line.cheap === "hard-call") {
    return true
  }
  if (preset === "save") {
    return false
  }
  if (line.briefHard || line.unfit) {
    return true
  }
  if (preset === "balanced") {
    return false
  }
  return line.cheap === "mild"
}

export function escalationIds(preset: Preset, lines: LineSignals[]): string[] {
  return lines.filter((line) => shouldEscalate(line, preset)).map((line) => line.id)
}
