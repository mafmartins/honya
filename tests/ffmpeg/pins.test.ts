import { describe, expect, it } from "vitest"
import {
  assetName,
  assetUrl,
  hostOs,
  parsePins,
  RELEASE_FILES,
  releaseTag,
  withAssets,
} from "../../scripts/ffmpeg/pins.ts"

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

  it("reads optional pinned asset checksums and rejects bad ones", () => {
    expect(parsePins(pinsText()).assets).toBeUndefined()
    const assets = { "ffmpeg-mac": HASH, "COPYING.dav1d": HASH }
    expect(parsePins(pinsText({ assets })).assets).toEqual(assets)
    expect(() => parsePins(pinsText({ assets: { "ffmpeg-mac": "nope" } }))).toThrow(
      /^Invalid build\/ffmpeg\/VERSION/,
    )
  })

  it("lists the files a release carries and records their checksums", () => {
    expect(RELEASE_FILES).toEqual([
      "ffmpeg-mac",
      "ffmpeg-win.exe",
      "ffmpeg-linux",
      "COPYING.LGPLv2.1",
      "COPYING.dav1d",
      "SOURCES.txt",
    ])
    const text = withAssets(pinsText(), { "ffmpeg-mac": "b".repeat(64) })
    expect(parsePins(text).assets).toEqual({ "ffmpeg-mac": "b".repeat(64) })
    expect(parsePins(text).build).toBe(1)
    expect(text.endsWith("\n")).toBe(true)
  })
})
