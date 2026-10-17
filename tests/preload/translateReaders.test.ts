import { describe, expect, it } from "vitest"
import {
  readCheckResult,
  readFinishResult,
  readPreparedScript,
  readReviewView,
  readTranslateEvent,
  readUnfinished,
} from "../../src/preload/readers"

const line = {
  eventIndex: 3,
  english: "Hi",
  words: "Olá",
  note: null,
  edited: false,
  flagged: false,
  accepted: false,
}

const view = {
  sessionId: "s",
  scriptName: "a.ass",
  seriesName: "Frieren",
  variant: "pt-pt",
  preset: "balanced",
  outputPath: "/a.pt-pt.ass",
  lines: [line],
  openFlags: 0,
}

describe("translate readers", () => {
  it("accepts the five event shapes", () => {
    const events = [
      { type: "activity", sessionId: "s", text: "Working" },
      {
        type: "batch",
        sessionId: "s",
        index: 1,
        total: 4,
        linesDone: 10,
        lineTotal: 40,
        lines: [{ eventIndex: 1, english: "Hi", words: "Olá", note: "check" }],
      },
      { type: "stopped", sessionId: "s" },
      { type: "failed", sessionId: "s", message: "boom" },
      { type: "finished", sessionId: "s", openFlags: 2 },
    ]
    for (const event of events) {
      expect(readTranslateEvent(event)).toEqual(event)
    }
  })

  it("rejects a batch event with a non-number index", () => {
    expect(
      readTranslateEvent({
        type: "batch",
        sessionId: "s",
        index: "1",
        total: 4,
        linesDone: 0,
        lineTotal: 0,
        lines: [],
      }),
    ).toBeNull()
    expect(readTranslateEvent({ type: "other", sessionId: "s" })).toBeNull()
  })

  it("checks the review view", () => {
    expect(readReviewView(view)).toEqual(view)
    const partial = { ...line, flagged: undefined }
    expect(readReviewView({ ...view, lines: [partial] })).toBeNull()
  })

  it("checks the edit check result", () => {
    expect(readCheckResult({ status: "none" })).toEqual({ status: "none" })
    expect(readCheckResult({ status: "failed" })).toEqual({ status: "failed" })
    const proposal = {
      siblings: [{ eventIndex: 2, words: "x" }],
      rule: { kind: "glossary", source: "a", pt: "b" },
    }
    expect(readCheckResult({ status: "proposal", proposal })).toEqual({
      status: "proposal",
      proposal,
    })
    expect(readCheckResult({ status: "maybe" })).toBeNull()
  })

  it("accepts null or an unfinished session", () => {
    expect(readUnfinished(null)).toEqual({ value: null })
    const session = {
      id: "s",
      scriptName: "a.ass",
      seriesName: "F",
      phase: "stopped",
      completedBatches: 1,
      totalBatches: 3,
      openFlags: 0,
    }
    expect(readUnfinished(session)).toEqual({ value: session })
    expect(readUnfinished({ ...session, phase: "nope" })).toBeNull()
  })

  it("checks the prepared script and the finish result", () => {
    const prepared = {
      styles: [{ name: "Default", guess: "dialogue" }],
      outputPath: "/a.pt-pt.ass",
      scriptName: "a.ass",
    }
    expect(readPreparedScript(prepared)).toEqual(prepared)
    expect(readPreparedScript({ ...prepared, styles: [{ name: "x", guess: "q" }] })).toBeNull()
    expect(readFinishResult({ outputPath: "/o" })).toBeNull()
    const cost = { usd: null, unpriced: ["m"], input: 10, output: 2, requests: 1 }
    const report = {
      dialogueLines: 1,
      translated: 1,
      strongModel: 0,
      leftInEnglish: 0,
      overLimit: 0,
      flags: 0,
      editedFlags: 0,
      acceptedAsIs: 0,
      rulesSaved: { series: 0, base: 0 },
      framesUsed: 0,
      frameFailures: 0,
      unchanged: 0,
      elapsedMs: 5,
      cost,
      outputPath: "/o",
    }
    expect(readFinishResult({ outputPath: "/o", report })).toEqual({ outputPath: "/o", report })
    expect(
      readFinishResult({ outputPath: "/o", report: { ...report, cost: { ...cost, usd: "1" } } }),
    ).toBeNull()
  })
})
