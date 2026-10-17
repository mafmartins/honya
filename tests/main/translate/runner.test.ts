import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { Completer } from "../../../src/core/pipeline/run"
import { echo, isBrief } from "../../support/fakeModel"
import { providerError } from "../../../src/core/providers/errors"
import { createSessionStore } from "../../../src/main/translate/session"
import {
  createRunner,
  type RunnerDeps,
  type TranslateEvent,
  type TranslateRequest,
} from "../../../src/main/translate/runner"

function scriptWith(count: number, style = "Default"): string {
  const events = Array.from({ length: count }, (_, i) => {
    const mm = String(Math.floor(i / 60)).padStart(2, "0")
    const ss = String(i % 60).padStart(2, "0")
    return `Dialogue: 0,0:${mm}:${ss}.00,0:${mm}:${ss}.50,${style},,0,0,0,,Line ${String(i)}.`
  }).join("\n")
  return `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`
}

const REQUEST: TranslateRequest = {
  scriptPath: "/s/subs.ass",
  variant: "pt-pt",
  seriesId: "s",
  provider: "claude",
  preset: "save",
  frameSetting: "none",
  videoPath: null,
  dialogueStyles: ["Default"],
}

function ignoreEvent(): void {}

interface Harness {
  deps: RunnerDeps
  events: TranslateEvent[]
  scripts: Map<string, string>
  state: { complete: Completer; key: boolean; ffmpeg: boolean; onEmit: (e: TranslateEvent) => void }
}

function harness(lines = 60): Harness {
  const events: TranslateEvent[] = []
  const scripts = new Map([["/s/subs.ass", scriptWith(lines)]])
  const state: Harness["state"] = {
    complete: echo,
    key: true,
    ffmpeg: true,
    onEmit: ignoreEvent,
  }
  let ids = 0
  let clock = 0
  const deps: RunnerDeps = {
    sessions: createSessionStore(mkdtempSync(join(tmpdir(), "honya-runner-"))),
    loadCard: (variant, seriesId) => ({
      card: { variant, seriesId, revision: 1, cpsLimit: 17, voice: "", rules: [] },
      seriesName: "Series",
    }),
    hasKey: () => state.key,
    completerFor: () => (request) => state.complete(request),
    grabFrames: () => Promise.resolve({ frames: new Map(), notes: [] }),
    ffmpegReady: () => state.ffmpeg,
    readScript: (path) => scripts.get(path) ?? "",
    now: () => (clock += 1000),
    newId: () => {
      ids += 1
      return `00000000-0000-4000-8000-${String(ids).padStart(12, "0")}`
    },
    sleep: () => Promise.resolve(),
    emit: (event) => {
      events.push(event)
      state.onEmit(event)
    },
  }
  return { deps, events, scripts, state }
}

describe("createRunner", () => {
  it("runs every batch and ends in review", async () => {
    const h = harness()
    const runner = createRunner(h.deps)
    const id = await runner.start(REQUEST)
    await runner.idle()
    const batches = h.events.flatMap((e) => (e.type === "batch" ? [e] : []))
    expect(batches.map((b) => b.index)).toEqual([1, 2, 3])
    expect(batches.map((b) => b.linesDone)).toEqual([25, 50, 60])
    expect(batches.every((b) => b.lineTotal === 60)).toBe(true)
    expect(batches[0]?.lines[0]).toEqual({
      eventIndex: 0,
      english: "Line 0.",
      words: "pt 0",
      note: null,
    })
    expect(h.events.at(-1)).toEqual({ type: "finished", sessionId: id, openFlags: 0 })
    expect(h.deps.sessions.load(id)?.phase).toBe("review")
    expect(runner.activeId()).toBeNull()
  })

  it("adds up the tokens each request used, per model", async () => {
    const h = harness()
    h.state.complete = async (request) => ({
      ...(await echo(request)),
      spent: { model: `m-${request.tier}`, usage: { input: 100, output: 10, cached: 40 } },
    })
    const runner = createRunner(h.deps)
    const id = await runner.start(REQUEST)
    await runner.idle()
    // The brief and three batches, all on the cheap model.
    expect(h.deps.sessions.load(id)?.spend).toEqual([
      { model: "m-cheap", requests: 4, input: 400, output: 40, cached: 160 },
    ])
  })

  it("refuses a second start while running", async () => {
    const h = harness()
    const runner = createRunner(h.deps)
    await runner.start(REQUEST)
    await expect(runner.start(REQUEST)).rejects.toThrow("A translation is already running.")
    await runner.idle()
  })

  it("stops after the current step and resumes", async () => {
    const h = harness()
    const runner = createRunner(h.deps)
    h.state.onEmit = (event) => {
      if (event.type === "activity" && event.text === "Reading the episode") {
        runner.stop()
      }
    }
    const id = await runner.start(REQUEST)
    await runner.idle()
    expect(h.events.at(-1)).toEqual({ type: "stopped", sessionId: id })
    const stored = h.deps.sessions.load(id)
    expect(stored?.phase).toBe("stopped")
    expect(stored?.saved.completedBatches).toBe(1)
    h.state.onEmit = ignoreEvent
    const before = h.events.length
    await runner.resume(id)
    await runner.idle()
    const after = h.events.slice(before)
    const first = after.find((e) => e.type === "batch")
    expect(first?.type === "batch" ? first.index : 0).toBe(2)
    expect(after.at(-1)?.type).toBe("finished")
  })

  it("stops on a rejected key and retries from the next batch", async () => {
    const h = harness()
    const runner = createRunner(h.deps)
    let calls = 0
    h.state.complete = (request) => {
      calls += 1
      if (calls === 4) {
        throw providerError("claude", 401, null)
      }
      return echo(request)
    }
    const id = await runner.start(REQUEST)
    await runner.idle()
    expect(h.events.at(-1)).toEqual({
      type: "failed",
      sessionId: id,
      message: "Claude rejected the key. Replace it on Profiles.",
    })
    const stored = h.deps.sessions.load(id)
    expect(stored?.phase).toBe("failed")
    expect(stored?.saved.completedBatches).toBe(2)

    h.state.complete = echo
    const before = h.events.length
    await runner.resume(id)
    await runner.idle()
    const after = h.events.slice(before)
    const first = after.find((e) => e.type === "batch")
    expect(first?.type === "batch" ? first.index : 0).toBe(3)
    expect(after.at(-1)?.type).toBe("finished")
  })

  it("refuses to resume a changed script", async () => {
    const h = harness()
    const runner = createRunner(h.deps)
    h.state.onEmit = (event) => {
      if (event.type === "activity" && event.text === "Reading the episode") {
        runner.stop()
      }
    }
    const id = await runner.start(REQUEST)
    await runner.idle()
    h.scripts.set("/s/subs.ass", scriptWith(61))
    await expect(runner.resume(id)).rejects.toThrow(
      "subs.ass changed since this translation started.",
    )
  })

  it("rejects resuming a missing or finished session", async () => {
    const h = harness()
    const runner = createRunner(h.deps)
    await expect(runner.resume("00000000-0000-4000-8000-0000000000ff")).rejects.toThrow(
      "That translation no longer exists.",
    )
    const id = await runner.start(REQUEST)
    await runner.idle()
    const stored = h.deps.sessions.load(id)
    if (stored === null) {
      throw new Error("missing session")
    }
    h.deps.sessions.save({ ...stored, phase: "done" })
    await expect(runner.resume(id)).rejects.toThrow("That translation is already finished.")
  })

  it("refuses without a key", async () => {
    const h = harness()
    h.state.key = false
    await expect(createRunner(h.deps).start(REQUEST)).rejects.toThrow(
      "No Claude key saved. Add it on the start screen.",
    )
  })

  it("refuses when no chosen style has dialogue", async () => {
    const h = harness()
    await expect(
      createRunner(h.deps).start({ ...REQUEST, dialogueStyles: ["Signs"] }),
    ).rejects.toThrow("This script has no dialogue lines in the chosen styles.")
  })

  it("refuses frames without ffmpeg", async () => {
    const h = harness()
    h.state.ffmpeg = false
    await expect(
      createRunner(h.deps).start({ ...REQUEST, frameSetting: "marked", videoPath: "/v.mkv" }),
    ).rejects.toThrow(
      "Honya's bundled ffmpeg is missing, so frames can't be grabbed. Set frames to none or reinstall Honya.",
    )
  })

  it("counts frames as they are grabbed", async () => {
    const h = harness()
    h.deps.grabFrames = (cues, _video, _setting, progress) => {
      for (let done = 1; done <= cues.length; done += 1) {
        progress(done, cues.length)
      }
      return Promise.resolve({ frames: new Map(), notes: [] })
    }
    const runner = createRunner(h.deps)
    await runner.start({ ...REQUEST, frameSetting: "every", videoPath: "/v.mkv" })
    await runner.idle()
    const texts = h.events.flatMap((event) => (event.type === "activity" ? [event.text] : []))
    // One count per batch: 25, 25 and 10 lines.
    expect(texts).toContain("Grabbing frames · 0 of 25")
    expect(texts).toContain("Grabbing frames · 25 of 25")
    expect(texts).toContain("Grabbing frames · 10 of 10")
    expect(texts).not.toContain("Grabbing frames · 0 of 60")
  })

  it("stops between frames without starting the batch", async () => {
    const h = harness()
    let grabbed = 0
    h.deps.grabFrames = (cues, _video, _setting, progress, shouldStop) => {
      for (let index = 0; index < cues.length; index += 1) {
        if (shouldStop()) {
          break
        }
        grabbed += 1
        progress(grabbed, cues.length)
      }
      return Promise.resolve({ frames: new Map(), notes: [] })
    }
    const batchPrompts: string[] = []
    const echo = h.state.complete
    h.state.complete = (request) => {
      if (!isBrief(request)) {
        batchPrompts.push(request.prompt)
      }
      return echo(request)
    }
    const runner = createRunner(h.deps)
    h.state.onEmit = (event) => {
      if (event.type === "activity" && event.text === "Grabbing frames · 3 of 25") {
        runner.stop()
      }
    }
    const id = await runner.start({ ...REQUEST, frameSetting: "every", videoPath: "/v.mkv" })
    await runner.idle()
    expect(grabbed).toBe(3)
    expect(batchPrompts).toEqual([])
    expect(h.events.at(-1)).toEqual({ type: "stopped", sessionId: id })
    expect(h.deps.sessions.load(id)?.phase).toBe("stopped")
    expect(h.deps.sessions.load(id)?.saved.completedBatches).toBe(0)
  })

  it("reuses frames saved before a stop when the run resumes", async () => {
    const h = harness()
    const asked: number[] = []
    h.deps.grabFrames = (cues, _video, _setting, progress, shouldStop) => {
      asked.push(cues.length)
      const frames = new Map<string, Uint8Array>()
      for (const cue of cues) {
        if (shouldStop()) {
          break
        }
        frames.set(String(cue.index), new Uint8Array([7]))
        progress(frames.size, cues.length)
      }
      return Promise.resolve({ frames, notes: [] })
    }
    const runner = createRunner(h.deps)
    h.state.onEmit = (event) => {
      if (event.type === "activity" && event.text === "Grabbing frames · 3 of 25") {
        runner.stop()
      }
    }
    const id = await runner.start({ ...REQUEST, frameSetting: "every", videoPath: "/v.mkv" })
    await runner.idle()
    expect(h.deps.sessions.readFrame(id, "0")).toEqual(new Uint8Array([7]))
    h.state.onEmit = () => undefined
    await runner.resume(id)
    await runner.idle()
    expect(asked).toEqual([25, 22, 25, 10])
    expect(h.events.at(-1)?.type).toBe("finished")
  })

  it("reports retries in the activity line", async () => {
    const h = harness()
    h.deps.completerFor = (_provider, onRetry) => {
      let first = true
      return (request) => {
        if (first) {
          first = false
          onRetry(4000, providerError("claude", 429, null))
        }
        return echo(request)
      }
    }
    const runner = createRunner(h.deps)
    await runner.start(REQUEST)
    await runner.idle()
    expect(h.events).toContainEqual(
      expect.objectContaining({ type: "activity", text: "Rate limited, retrying in 4 s" }),
    )
  })

  it("checks the key before loading the script or card", async () => {
    const h = harness()
    h.state.key = false
    h.deps.loadCard = () => {
      throw new Error("That series no longer exists.")
    }
    await expect(createRunner(h.deps).start(REQUEST)).rejects.toThrow(
      "No Claude key saved. Add it on the start screen.",
    )
  })

  it("survives listeners that throw", async () => {
    const h = harness()
    h.state.onEmit = () => {
      throw new Error("listener broke")
    }
    const runner = createRunner(h.deps)
    const id = await runner.start(REQUEST)
    await runner.idle()
    expect(h.deps.sessions.load(id)?.phase).toBe("review")
  })

  it("emits finished for a review session after resume returns", async () => {
    const h = harness()
    const runner = createRunner(h.deps)
    const id = await runner.start(REQUEST)
    await runner.idle()
    const late: TranslateEvent[] = []
    await runner.resume(id)
    h.state.onEmit = (event) => late.push(event)
    await runner.idle()
    expect(late).toEqual([{ type: "finished", sessionId: id, openFlags: 0 }])
  })
})
