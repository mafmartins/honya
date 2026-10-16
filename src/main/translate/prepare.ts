import { basename } from "node:path"
import { classifyScript } from "../../core/ass/classify"
import { readAss } from "../../core/ass/script"
import type { Variant } from "../../core/library/types"
import { proposedOutputPath } from "../../core/pipeline/preflight"
import type { ListedStyle } from "../ipc/files"

export interface PreparedScript {
  styles: ListedStyle[]
  outputPath: string
  scriptName: string
}

export function prepareTranslation(
  scriptPath: string,
  variant: Variant,
  readScript: (path: string) => string,
): PreparedScript {
  const cues = readAss(readScript(scriptPath))
  const guesses = classifyScript(cues.map((cue) => cue.style))
  return {
    styles: [...guesses.entries()].map(([name, guess]) => ({ name, guess })),
    outputPath: proposedOutputPath(scriptPath, variant),
    scriptName: basename(scriptPath),
  }
}
