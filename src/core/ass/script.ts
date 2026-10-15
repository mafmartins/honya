import { parse, type ParsedASS } from "ass-compiler"

export interface DialogueCue {
  index: number
  style: string
  name: string
  startMs: number
  endMs: number
  raw: string
  visible: string
}

export function readAss(text: string): DialogueCue[] {
  const parsed: ParsedASS = parse(text)
  return parsed.events.dialogue.map((dia, index) => ({
    index,
    style: dia.Style,
    name: dia.Name,
    startMs: Math.round(dia.Start * 1000),
    endMs: Math.round(dia.End * 1000),
    raw: dia.Text.raw,
    visible: dia.Text.combined,
  }))
}
