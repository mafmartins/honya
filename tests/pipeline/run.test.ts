import { describe, expect, it } from "vitest"
import {
  runTranslation,
  resumeTranslation,
  totalBatches,
  type RunEvent,
} from "../../src/core/pipeline/run"
import type { Completer, RunInput } from "../../src/core/pipeline/run"

function scriptWith(count: number): string {
  const events = Array.from({ length: count }, (_, i) => {
    const start = `0:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.00`
    const end = `0:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.50`
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,Line ${String(i)}.`
  }).join("\n")
  return `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`
}

const echo: Completer = (request) => {
  const lines = [...request.prompt.matchAll(/^(\d+):/gm)].flatMap((m) =>
    m[1] === undefined ? [] : [{ id: m[1], words: `pt ${m[1]}`, mark: "clean" as const }],
  )
  return Promise.resolve({ lines })
}

function baseInput(count: number): Omit<RunInput, "complete"> {
  return {
    ass: scriptWith(count),
    dialogueStyles: new Set(["Default"]),
    card: { variant: "pt-pt", seriesId: "s", revision: 1, cpsLimit: 17, voice: "", rules: [] },
    preset: "save",
    sleep: async () => {},
  }
}

describe("runTranslation", () => {
  it("retries a short reply, escalates, then keeps english", async () => {
    let calls = 0
    const complete: Completer = () => {
      calls += 1
      return Promise.resolve({ refused: true })
    }
    const result = await runTranslation({
      ass: scriptWith(1),
      dialogueStyles: new Set(["Default"]),
      card: { variant: "pt-pt", seriesId: "s", revision: 1, cpsLimit: 17, voice: "", rules: [] },
      preset: "save",
      complete,
      sleep: async () => {},
    })
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(result.ass).toContain("Line 0.")
    expect(result.ass).toContain("{note: tradução falhou}")
  })

  it("resumes at batch three", async () => {
    const seen: number[] = []
    const complete: Completer = (request) => {
      seen.push(request.tier === "cheap" ? 1 : 2)
      const ids: string[] = []
      for (const m of request.prompt.matchAll(/^(\d+):/gm)) {
        const id = m[1]
        if (id === undefined) {
          continue
        }
        ids.push(id)
      }
      return Promise.resolve({
        lines: ids.map((id) => ({ id, words: `pt ${id}`, mark: "clean" as const })),
      })
    }
    const first = await runTranslation({
      ass: scriptWith(60),
      dialogueStyles: new Set(["Default"]),
      card: { variant: "pt-pt", seriesId: "s", revision: 1, cpsLimit: 17, voice: "", rules: [] },
      preset: "save",
      complete,
      sleep: async () => {},
      stopAfterBatches: 2,
    })
    expect(first.saved.completedBatches).toBe(2)
    const second = await resumeTranslation(first.saved, {
      ass: scriptWith(60),
      dialogueStyles: new Set(["Default"]),
      card: { variant: "pt-pt", seriesId: "s", revision: 1, cpsLimit: 17, voice: "", rules: [] },
      preset: "save",
      complete,
      sleep: async () => {},
    })
    expect(second.saved.completedBatches).toBe(3)
    expect(second.ass).toContain("pt 50")
  })

  it("emits brief, batch and batch-done events in order", async () => {
    const events: RunEvent[] = []
    await runTranslation({
      ...baseInput(60),
      complete: echo,
      onEvent: (event) => events.push(event),
    })
    const shape = events.map((e) =>
      e.type === "batch-done"
        ? `${e.type} ${String(e.index)}/${String(e.total)} ${String(e.lines.length)}`
        : e.type === "batch"
          ? `${e.type} ${String(e.index)}/${String(e.total)}`
          : e.type,
    )
    expect(shape).toEqual([
      "brief",
      "batch 1/3",
      "batch-done 1/3 25",
      "batch 2/3",
      "batch-done 2/3 25",
      "batch 3/3",
      "batch-done 3/3 10",
    ])
  })

  it("records lines answered by the strong model", async () => {
    const events: RunEvent[] = []
    const complete: Completer = (request) => {
      if (request.tier === "cheap") {
        return Promise.resolve({ refused: true })
      }
      return echo(request)
    }
    const result = await runTranslation({
      ...baseInput(3),
      preset: "best",
      complete,
      onEvent: (event) => events.push(event),
    })
    expect(result.saved.results.size).toBe(3)
    expect([...result.saved.strongIds].sort()).toEqual([...result.saved.results.keys()].sort())
    expect(events).toContainEqual({ type: "escalate", count: 3 })
  })

  it("rejects when the completer throws", async () => {
    const complete: Completer = () => Promise.reject(new Error("401"))
    await expect(runTranslation({ ...baseInput(3), complete })).rejects.toThrow("401")
  })

  it("counts batches like chunkDialogue", () => {
    expect(totalBatches(0)).toBe(0)
    expect(totalBatches(25)).toBe(1)
    expect(totalBatches(26)).toBe(2)
  })
})

describe("frames per batch", () => {
  const card = {
    variant: "pt-pt" as const,
    seriesId: "s",
    revision: 1,
    cpsLimit: 17,
    voice: "",
    rules: [],
  }

  function completer(sentImages: string[][], briefFrameIds: string[]): Completer {
    return (request) => {
      if (request.prompt.includes('"frameIds": string[]')) {
        return Promise.resolve({
          lines: [{ id: "brief", words: "brief", mark: "clean" as const, frameIds: briefFrameIds }],
        })
      }
      sentImages.push((request.images ?? []).map((image) => image.id))
      const ids = [...request.prompt.matchAll(/^(\d+):/gm)].flatMap((m) =>
        m[1] === undefined ? [] : [m[1]],
      )
      return Promise.resolve({
        lines: ids.map((id) => ({ id, words: `pt ${id}`, mark: "clean" as const })),
      })
    }
  }

  function provider(
    asked: string[][],
  ): (ids: readonly string[]) => Promise<ReadonlyMap<string, Uint8Array>> {
    return (ids) => {
      asked.push([...ids])
      return Promise.resolve(new Map(ids.map((id) => [id, new Uint8Array([1])])))
    }
  }

  it("asks for every line's frame one batch at a time", async () => {
    const asked: string[][] = []
    const sent: string[][] = []
    await runTranslation({
      ass: scriptWith(30),
      dialogueStyles: new Set(["Default"]),
      card,
      preset: "save",
      complete: completer(sent, []),
      sleep: async () => {},
      frameSetting: "every",
      frames: provider(asked),
    })
    const range = (from: number, to: number): string[] =>
      Array.from({ length: to - from }, (_, i) => String(from + i))
    expect(asked).toEqual([range(0, 25), range(25, 30)])
    expect(sent).toEqual([range(0, 25), range(25, 30)])
  })

  it("asks only for the frames the brief marked, and not at all for batches without one", async () => {
    const asked: string[][] = []
    const sent: string[][] = []
    await runTranslation({
      ass: scriptWith(30),
      dialogueStyles: new Set(["Default"]),
      card,
      preset: "save",
      complete: completer(sent, ["3", "27"]),
      sleep: async () => {},
      frameSetting: "marked",
      frames: provider(asked),
    })
    expect(asked).toEqual([["3"], ["27"]])
    expect(sent).toEqual([["3"], ["27"]])
  })
})
