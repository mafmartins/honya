import { readFileSync } from "node:fs"
import { basename } from "node:path"
import { classifyScript, type StyleClassification } from "../../core/ass/classify"
import { readAss, type DialogueCue } from "../../core/ass/script"

export interface FileFilter {
  name: string
  extensions: string[]
}

export type OpenFile = (filters: FileFilter[]) => Promise<string | null>

export interface ListedStyle {
  name: string
  guess: StyleClassification
}

export interface PickedExample {
  name: string
  text: string
  styles: ListedStyle[]
}

export const ASS_FILTER: FileFilter[] = [{ name: "ASS subtitles", extensions: ["ass"] }]
export const VIDEO_FILTER: FileFilter[] = [
  { name: "Video", extensions: ["mkv", "mp4", "webm", "avi", "mov"] },
]

export async function pickExample(open: OpenFile): Promise<PickedExample | null> {
  const path = await open(ASS_FILTER)
  if (path === null) {
    return null
  }
  const { text, cues } = readScript(path)
  const guesses = classifyScript(cues.map((cue) => cue.style))
  const styles = [...guesses].map(([name, guess]) => ({ name, guess }))
  return { name: basename(path), text, styles }
}

function readScript(path: string): { text: string; cues: DialogueCue[] } {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "")
  let cues: DialogueCue[] = []
  try {
    cues = readAss(text)
  } catch {
    cues = []
  }
  if (cues.length === 0) {
    throw new Error(`${basename(path)} has no dialogue lines. Is it an ASS script?`)
  }
  return { text, cues }
}
