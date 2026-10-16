import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"
import { isMain } from "../../scripts/ffmpeg/main.ts"

describe("isMain", () => {
  it("recognises the script even when it is run through a symlinked folder", () => {
    const real = mkdtempSync(join(tmpdir(), "honya-main-"))
    const script = join(real, "fetch.ts")
    writeFileSync(script, "")
    const link = `${real}-link`
    symlinkSync(real, link)
    const url = pathToFileURL(script).href
    expect(isMain(join(link, "fetch.ts"), url)).toBe(true)
    expect(isMain(script, url)).toBe(true)
  })

  it("is false for another file or no file", () => {
    const real = mkdtempSync(join(tmpdir(), "honya-main-"))
    writeFileSync(join(real, "a.ts"), "")
    writeFileSync(join(real, "b.ts"), "")
    expect(isMain(join(real, "b.ts"), pathToFileURL(join(real, "a.ts")).href)).toBe(false)
    expect(isMain(undefined, pathToFileURL(join(real, "a.ts")).href)).toBe(false)
    expect(isMain(join(real, "missing.ts"), pathToFileURL(join(real, "a.ts")).href)).toBe(false)
  })
})
