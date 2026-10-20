import { describe, expect, it } from "vitest"
import {
  readAppSettings,
  readExportPreview,
  readKeyTest,
  readLaunchInfo,
  readLineView,
  readRetranslated,
  readModelOptions,
  readPickedSessionView,
  readProjectView,
  readSessionStats,
  readSessionSummary,
  readSessionView,
  readStyleView,
  readWorkspaceEvent,
} from "../../src/preload/readers"

const line = {
  index: 3,
  start: 4200,
  end: 5320,
  speaker: "Tanjiro",
  english: "Hi.",
  englishMissing: false,
  words: "Olá.",
  origin: "ai",
  flag: null,
  budget: 18,
}

const stats = {
  lines: { ai: 1, manual: 0, untranslated: 1, total: 2 },
  flags: { open: 0, accepted: 1, edited: 0, retranslated: 0 },
  strongLines: 0,
  retranslatedLines: 0,
  cost: { usd: 0.01, unpriced: [], input: 100, output: 50, requests: 2 },
  models: [{ model: "claude-haiku-5-5", requests: 2, input: 100, output: 50, usd: 0.01 }],
  activeMs: 1200,
  framesGrabbed: 0,
}

const sessionView = {
  id: "00000000-0000-4000-8000-000000000001",
  projectId: "p1",
  projectName: "Frieren",
  variant: "pt-pt",
  scriptName: "ep01.ass",
  videoName: null,
  provider: "claude",
  preset: "save",
  lines: [line, { ...line, index: 4, words: null, origin: null }],
  needsStyles: null,
  stats,
  finished: false,
}

const summary = { id: "p1", name: "Frieren", variant: "pt-br", sessions: 2, lastActivity: null }

const projectView = {
  summary,
  rules: {
    own: [{ kind: "glossary", source: "Hashira", pt: "Pilar" }],
    inherited: [{ kind: "prose", text: "Use tu." }],
  },
  cpsLimit: null,
  styleCps: 17,
  preset: "balanced",
  frameSetting: "marked",
  references: [{ name: "ep00.ass", text: "Olá." }],
  languageLocked: true,
}

const sessionSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  projectId: "p1",
  projectName: "Frieren",
  scriptName: "ep01.ass",
  translated: 1,
  total: 2,
  openFlags: 0,
  updatedAt: "2026-10-17T10:00:00.000Z",
  finished: false,
}

describe("workspace readers", () => {
  it("accepts a session view and rejects a malformed one", () => {
    expect(readSessionView(sessionView)).toEqual(sessionView)
    const asking = {
      ...sessionView,
      scriptName: null,
      lines: [],
      needsStyles: [{ name: "Signs", guess: "ambiguous" }],
    }
    expect(readSessionView(asking)).toEqual(asking)
    expect(readSessionView({ ...sessionView, provider: "llama" })).toBeNull()
    expect(readSessionView({ ...sessionView, lines: [{ ...line, origin: "robot" }] })).toBeNull()
    expect(readSessionView({ ...sessionView, needsStyles: [{ name: "x", guess: "y" }] })).toBeNull()
    expect(readSessionView({ ...sessionView, stats: { ...stats, lines: null } })).toBeNull()
    expect(readSessionView(null)).toBeNull()
  })

  it("keeps null as a cancelled pick and rejects other shapes", () => {
    expect(readPickedSessionView(null)).toEqual({ value: null })
    expect(readPickedSessionView(sessionView)).toEqual({ value: sessionView })
    expect(readPickedSessionView({ id: 1 })).toBeNull()
  })

  it("accepts a line view and rejects a bad one", () => {
    expect(readLineView(line)).toEqual(line)
    expect(readLineView({ ...line, words: 3 })).toBeNull()
    expect(readLineView({ ...line, budget: "18" })).toBeNull()
    expect(readLineView({ ...line, end: undefined })).toBeNull()
  })

  it("accepts a retranslated line and rejects a bad one", () => {
    expect(readRetranslated({ line, keptEdit: true })).toEqual({ line, keptEdit: true })
    expect(readRetranslated({ line, keptEdit: "no" })).toBeNull()
    expect(readRetranslated({ line: { ...line, words: 3 }, keptEdit: false })).toBeNull()
  })

  it("accepts a project view and rejects a malformed one", () => {
    expect(readProjectView(projectView)).toEqual(projectView)
    expect(readProjectView({ ...projectView, cpsLimit: 14 })).toEqual({
      ...projectView,
      cpsLimit: 14,
    })
    expect(
      readProjectView({ ...projectView, rules: { own: [{ kind: "x" }], inherited: [] } }),
    ).toBeNull()
    expect(readProjectView({ ...projectView, summary: { ...summary, variant: "en" } })).toBeNull()
    expect(readProjectView({ ...projectView, frameSetting: "some" })).toBeNull()
  })

  it("accepts a style view", () => {
    const style = { variant: "pt-pt", rules: [], cpsLimit: 17, references: [], usedBy: ["A"] }
    expect(readStyleView(style)).toEqual(style)
    expect(readStyleView({ ...style, usedBy: [1] })).toBeNull()
  })

  it("accepts an export preview and rejects a malformed one", () => {
    const preview = {
      translated: 2,
      english: 1,
      openFlags: 1,
      defaultPath: "/a/ep01.pt-pt.ass",
      suggestions: [{ rule: { kind: "prose", text: "Use Raios." }, lines: [0, 4] }],
    }
    expect(readExportPreview(preview)).toEqual(preview)
    expect(
      readExportPreview({ ...preview, suggestions: [{ rule: { kind: "prose" }, lines: [] }] }),
    ).toBeNull()
    expect(
      readExportPreview({ ...preview, suggestions: [{ rule: preview.suggestions[0]?.rule }] }),
    ).toBeNull()
    expect(readExportPreview({ ...preview, defaultPath: null })).toBeNull()
  })

  it("accepts the workspace events and rejects malformed ones", () => {
    const events = [
      {
        type: "run-progress",
        sessionId: "s",
        index: 1,
        total: 3,
        linesDone: 40,
        lineTotal: 120,
        activity: "Translating batch 1 of 3",
        indexes: [0, 1, 2],
      },
      { type: "lines", sessionId: "s", lines: [line] },
      { type: "run-ended", sessionId: "s", outcome: "done", message: null },
      { type: "run-ended", sessionId: "s", outcome: "failed", message: "The key was rejected." },
      { type: "session-changed", sessionId: "s" },
    ]
    for (const event of events) {
      expect(readWorkspaceEvent(event)).toEqual(event)
    }
    expect(readWorkspaceEvent({ type: "lines", sessionId: "s", lines: [{}] })).toBeNull()
    expect(
      readWorkspaceEvent({ type: "run-ended", sessionId: "s", outcome: "won", message: null }),
    ).toBeNull()
    expect(readWorkspaceEvent({ type: "run-progress", sessionId: "s" })).toBeNull()
    expect(
      readWorkspaceEvent({
        type: "run-progress",
        sessionId: "s",
        index: 1,
        total: 3,
        linesDone: 0,
        lineTotal: 3,
        activity: "",
        indexes: ["0"],
      }),
    ).toBeNull()
    expect(readWorkspaceEvent({ type: "other", sessionId: "s" })).toBeNull()
    expect(readWorkspaceEvent({ type: "lines", lines: [] })).toBeNull()
  })

  it("accepts settings, key tests, model options and stats", () => {
    const settings = {
      setupDone: true,
      defaultProvider: "gemini",
      defaults: { variant: "pt-br", preset: "best", frameSetting: "none" },
      eurRate: 0.92,
    }
    expect(readAppSettings(settings)).toEqual(settings)
    expect(readAppSettings({ ...settings, defaults: { variant: "pt-br" } })).toBeNull()
    expect(readKeyTest({ ok: true })).toEqual({ ok: true })
    expect(readKeyTest({ ok: false, message: "Bad key." })).toEqual({
      ok: false,
      message: "Bad key.",
    })
    expect(readKeyTest({ ok: false })).toBeNull()
    const options = {
      cheap: [{ id: "a", label: "A", recommended: true }],
      strong: [{ id: "b", label: "B", recommended: false }],
    }
    expect(readModelOptions(options)).toEqual(options)
    expect(readModelOptions({ cheap: [{ id: "a" }], strong: [] })).toBeNull()
    expect(readSessionStats(stats)).toEqual(stats)
    expect(readSessionStats({ ...stats, cost: { ...stats.cost, unpriced: [1] } })).toBeNull()
    expect(readSessionStats({ ...stats, models: [{ model: "a", requests: 1 }] })).toBeNull()
  })

  it("accepts launch info and session summaries", () => {
    expect(readSessionSummary(sessionSummary)).toEqual(sessionSummary)
    expect(readSessionSummary({ ...sessionSummary, finished: "no" })).toBeNull()
    const info = { setupDone: false, continueSession: sessionSummary, projects: [summary] }
    expect(readLaunchInfo(info)).toEqual(info)
    expect(readLaunchInfo({ ...info, continueSession: null })).toEqual({
      ...info,
      continueSession: null,
    })
    expect(readLaunchInfo({ ...info, projects: [{}] })).toBeNull()
  })
})
