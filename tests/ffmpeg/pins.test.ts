import { describe, expect, it } from "vitest"
import { assetName, assetUrl, hostOs, parsePins, releaseTag } from "../../scripts/ffmpeg/pins.ts"

const HASH = "a".repeat(64)

function pinsText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ffmpeg: { version: "9.0.2", sha256: HASH },
    dav1d: { version: "1.6.0", sha256: HASH },
    zlib: { version: "1.3.1", sha256: HASH },
    build: 1,
    ...overrides,
  })
}

describe("ffmpeg pins", () => {
  it("parses valid pins and builds the tag and urls", () => {
    const pins = parsePins(pinsText())
    expect(releaseTag(pins)).toBe("ffmpeg-9.0.2-1")
    expect(assetUrl(pins, "ffmpeg-mac")).toBe(
      "https://github.com/mafmartins/honya/releases/download/ffmpeg-9.0.2-1/ffmpeg-mac",
    )
  })

  it("rejects missing fields, bad hashes and bad build numbers", () => {
    const bad = [
      JSON.stringify({
        ffmpeg: { version: "9.0.2", sha256: HASH },
        zlib: { version: "1", sha256: HASH },
        build: 1,
      }),
      pinsText({ ffmpeg: { version: "9.0.2", sha256: "abc" } }),
      pinsText({ build: 0 }),
      pinsText({ build: 1.5 }),
      "{not json",
    ]
    for (const text of bad) {
      expect(() => parsePins(text)).toThrow(/^Invalid build\/ffmpeg\/VERSION/)
    }
  })

  it("names assets and host folders", () => {
    expect(assetName("win")).toBe("ffmpeg-win.exe")
    expect(assetName("mac")).toBe("ffmpeg-mac")
    expect(assetName("linux")).toBe("ffmpeg-linux")
    expect(hostOs("darwin")).toBe("mac")
    expect(hostOs("win32")).toBe("win")
    expect(hostOs("linux")).toBe("linux")
  })
})
