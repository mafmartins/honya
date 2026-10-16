import { readAss } from "../ass/script"

export function exampleText(script: string, dialogueStyles: readonly string[]): string {
  const keep = new Set(dialogueStyles)
  return readAss(script)
    .filter((cue) => keep.has(cue.style))
    .map((cue) => cue.visible)
    .join("\n")
}
