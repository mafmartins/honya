import type { WorkSession } from "../../src/core/session/types"
import { emptyLines } from "../../src/core/session/lines"
import { readAss } from "../../src/core/ass/script"

export const SCRIPT = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Damn it!
Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Hello.
Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,Bye.
`

export function makeSession(): WorkSession {
  return {
    version: 3,
    id: "s1",
    projectId: "p1",
    variant: "pt-pt",
    createdAt: "2026-10-17T10:00:00.000Z",
    updatedAt: "2026-10-17T10:00:00.000Z",
    scriptPath: "/a/ep01.ass",
    scriptName: "ep01.ass",
    scriptText: SCRIPT,
    dialogueStyles: ["Default"],
    videoPath: null,
    provider: "gemini",
    preset: "balanced",
    frameSetting: "none",
    brief: null,
    glossary: [],
    lines: emptyLines(readAss(SCRIPT)),
    edits: [],
    spend: [],
    activeMs: 0,
    framesGrabbed: 0,
    exportedAt: null,
    finishedOverride: null,
  }
}
