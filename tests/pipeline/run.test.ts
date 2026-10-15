import { describe, expect, it } from "vitest"
import { runTranslation, resumeTranslation } from "../../src/core/pipeline/run"
import type { Completer } from "../../src/core/pipeline/run"

function scriptWith(count: number): string {
  const events = Array.from({ length: count }, (_, i) => {
    const start = `0:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.00`
    const end = `0:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.50`
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,Line ${String(i)}.`
  }).join("\n")
  return `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`
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
})
