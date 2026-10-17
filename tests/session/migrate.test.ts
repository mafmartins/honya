import { describe, expect, it } from "vitest"
import { migrateV2 } from "../../src/core/session/migrate"
import { SCRIPT } from "./fixture"

function v2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    id: "11111111-1111-1111-1111-111111111111",
    startedAt: "2026-10-01T09:00:00.000Z",
    phase: "done",
    scriptPath: "/a/ep01.ass",
    scriptName: "ep01.ass",
    scriptText: SCRIPT,
    seriesId: "p1",
    seriesName: "Show",
    variant: "pt-pt",
    provider: "claude",
    preset: "best",
    frameSetting: "marked",
    videoPath: "/v.mkv",
    outputPath: "/o.ass",
    dialogueStyles: ["Default"],
    saved: {
      completedBatches: 1,
      results: [
        ["0", { id: "0", words: "Raios! {note: tone}", mark: "doubt" }],
        ["1", { id: "1", words: "Olá. {note: odd}", mark: "doubt" }],
      ],
      glossary: [{ source: "Damn", pt: "Raios" }],
      brief: "A comedy.",
      hardIds: ["0"],
      frameIds: ["1"],
      strongIds: ["0"],
    },
    review: { edits: { "1": "Olá!" }, accepted: [0], rules: [] },
    elapsedMs: 5000,
    spend: [{ model: "m", requests: 1, input: 2, output: 3, cached: 0 }],
    framesUsed: 4,
    ...overrides,
  }
}

describe("migrateV2", () => {
  it("maps a reviewed v2 session to lines", () => {
    const session = migrateV2(v2())
    if (typeof session === "string") throw new Error(session)
    expect(session.version).toBe(3)
    expect(session.projectId).toBe("p1")
    expect(session.createdAt).toBe("2026-10-01T09:00:00.000Z")
    expect(session.exportedAt).toBe("2026-10-01T09:00:00.000Z")
    expect(session.activeMs).toBe(5000)
    expect(session.framesGrabbed).toBe(4)
    expect(session.brief).toEqual({ summary: "A comedy.", hardIds: ["0"], frameIds: ["1"] })
    expect(session.lines[0]).toMatchObject({
      words: "Raios!",
      origin: "ai",
      flag: null,
      resolution: "accepted",
      aiDraft: "Raios!",
      strong: true,
    })
    expect(session.lines[1]).toMatchObject({
      words: "Olá!",
      origin: "manual",
      flag: null,
      resolution: "edited",
      aiDraft: "Olá.",
    })
    expect(session.lines[2]).toMatchObject({ words: null, origin: null })
    expect(session.edits).toEqual([{ index: 1, en: "Hello.", draft: "Olá.", final: "Olá!" }])
  })

  it("keeps an open flag and drops an unavailable brief", () => {
    const session = migrateV2(
      v2({
        phase: "review",
        review: { edits: {}, accepted: [], rules: [] },
        saved: { ...(v2().saved as object), brief: "brief unavailable" },
        spend: undefined,
      }),
    )
    if (typeof session === "string") throw new Error(session)
    expect(session.lines[0]?.flag).toBe("tone")
    expect(session.brief).toBeNull()
    expect(session.exportedAt).toBeNull()
    expect(session.spend).toEqual([])
  })

  it("refuses a file that isn't a v2 session and says why", () => {
    expect(migrateV2({})).toBe("not a version 2 session")
    expect(migrateV2(v2({ saved: undefined }))).toContain("saved")
  })
})
