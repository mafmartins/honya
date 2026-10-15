import { readAss } from "../core/ass/script"
import { importExample } from "../core/library/card"
import type { BaseProfile } from "../core/library/types"

export { acceptStyleList, render, setStyleGuess } from "./view"
export type { AppState, ListedStyle, ProfileScreenState, RunScreenState, Screen } from "./view"

export function importExampleScript(
  base: BaseProfile,
  script: string,
  dialogueStyles: readonly string[],
): BaseProfile {
  const lines: string[] = []
  for (const cue of readAss(script)) {
    if (dialogueStyles.includes(cue.style)) {
      lines.push(cue.visible)
    }
  }
  return importExample(base, lines.join("\n"))
}
