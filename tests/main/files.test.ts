import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { pickExample, type FileFilter } from "../../src/main/ipc/files"

const SCRIPT = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,Frieren,0,0,0,,Hello.
Dialogue: 0,0:00:04.00,0:00:05.00,Signs,,0,0,0,,Shop
Dialogue: 0,0:00:06.00,0:00:07.00,Default,Frieren,0,0,0,,Bye.
`

function fixture(name: string, text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "honya-files-")), name)
  writeFileSync(path, text, "utf8")
  return path
}

describe("file dialogs", () => {
  it("returns null when the dialog is cancelled", async () => {
    const cancel = (): Promise<null> => Promise.resolve(null)
    expect(await pickExample(cancel)).toBeNull()
  })

  it("reads a script and filters the dialog to ass files", async () => {
    const path = fixture("ep01.ass", SCRIPT)
    let filters: FileFilter[] = []
    const picked = await pickExample((next) => {
      filters = next
      return Promise.resolve(path)
    })
    expect(filters).toEqual([{ name: "ASS subtitles", extensions: ["ass"] }])
    expect(picked?.text).toBe(SCRIPT)
  })

  it("accepts a script with a byte order mark and windows line endings", async () => {
    const path = fixture("aegisub.ass", `\uFEFF${SCRIPT.replaceAll("\n", "\r\n")}`)
    const picked = await pickExample(() => Promise.resolve(path))
    expect(picked?.text.startsWith("[Script Info]")).toBe(true)
  })

  it("refuses a file without dialogue lines", async () => {
    const path = fixture("notes.ass", "hello world")
    await expect(pickExample(() => Promise.resolve(path))).rejects.toThrow(
      "notes.ass has no dialogue lines. Is it an ASS script?",
    )
  })

  it("returns an example's styles with their guesses, once each", async () => {
    const path = fixture("ep02.ass", SCRIPT)
    const picked = await pickExample(() => Promise.resolve(path))
    expect(picked?.name).toBe("ep02.ass")
    expect(picked?.styles).toEqual([
      { name: "Default", guess: "dialogue" },
      { name: "Signs", guess: "skip" },
    ])
  })
})
