import { buildSync } from "esbuild"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("renderer bundle", () => {
  it("never contains ass-compiler", () => {
    const result = buildSync({
      entryPoints: [fileURLToPath(new URL("../../src/renderer/main.tsx", import.meta.url))],
      bundle: true,
      platform: "browser",
      format: "esm",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      write: false,
    })
    const text = result.outputFiles.map((file) => file.text).join("\n")
    expect(text).not.toContain("ass-compiler")
    expect(text).not.toContain("readAss")
  })
})
