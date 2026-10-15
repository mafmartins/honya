import { describe, expect, it } from "vitest"
import { preflight, proposedOutputPath } from "../../src/core/pipeline/preflight"

const ready = {
  styleListAccepted: true,
  dialogueStyleCount: 1,
  hasKey: true,
  framesRequested: false,
  ffmpegPresent: true,
  provider: "mistral" as const,
  preset: "balanced" as const,
  dialogueLineCount: 10,
  frameCount: 0,
  sourcePath: "/tmp/episode.ass",
  variant: "pt-pt" as const,
}

describe("preflight", () => {
  it("proposes a sibling path and blocks a paid run", () => {
    expect(proposedOutputPath("/tmp/episode.ass", "pt-br")).toBe("/tmp/episode.pt-br.ass")
    expect(preflight(ready).ok).toBe(true)
    expect(preflight({ ...ready, styleListAccepted: false }).ok).toBe(false)
    expect(preflight({ ...ready, hasKey: false }).ok).toBe(false)
    expect(preflight({ ...ready, dialogueStyleCount: 0 }).ok).toBe(false)
    expect(preflight({ ...ready, framesRequested: true, ffmpegPresent: false }).ok).toBe(false)
  })
})
