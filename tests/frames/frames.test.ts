import { describe, expect, it } from "vitest"
import { bundledFfmpegPath, devFfmpegPath } from "../../src/core/frames/path"
import { grabFrame } from "../../src/core/frames/grab"

describe("frames", () => {
  it("points at the unpacked binary and never at PATH", () => {
    expect(bundledFfmpegPath("/app/Resources", "darwin")).toBe("/app/Resources/ffmpeg/ffmpeg")
    expect(bundledFfmpegPath("/app/Resources", "win32")).toBe("/app/Resources/ffmpeg/ffmpeg.exe")
  })

  it("uses the build folder for the host platform when running unpackaged", () => {
    expect(devFfmpegPath("/repo", "darwin")).toBe("/repo/build/ffmpeg/mac/ffmpeg")
    expect(devFfmpegPath("/repo", "win32")).toBe("/repo/build/ffmpeg/win/ffmpeg.exe")
    expect(devFfmpegPath("/repo", "linux")).toBe("/repo/build/ffmpeg/linux/ffmpeg")
  })

  it("asks ffmpeg for one png at the cue midpoint", async () => {
    let args: string[] = []
    const png = new Uint8Array([1, 2, 3])
    const image = await grabFrame({
      ffmpegPath: "/app/ffmpeg",
      videoPath: "/tmp/show.mkv",
      startMs: 1000,
      endMs: 3000,
      run: async (_command, next) => {
        await Promise.resolve()
        args = next
        return { code: 0, stdout: png }
      },
    })
    expect(args).toContain("2")
    expect(args).toContain("/tmp/show.mkv")
    expect(image).toEqual(png)
  })
})
