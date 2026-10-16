import { describe, expect, it } from "vitest"
import { callEntry, problemEntry } from "../../src/main/providerLog"

const call = {
  time: "2026-10-16T17:00:00.000Z",
  provider: "gemini" as const,
  model: "gemini-3.8-flash",
  tier: "cheap" as const,
}

describe("provider log", () => {
  it("records every request with the tokens it used", () => {
    const entry = callEntry({ ...call, usage: { input: 1200, output: 300, cached: 800 } })
    expect(JSON.parse(entry)).toEqual({ ...call, input: 1200, cached: 800, output: 300 })
  })

  it("records why a reply was unusable, with the start of the reply", () => {
    const entry = callEntry({
      ...call,
      usage: null,
      problem: "the reply text is not JSON",
      excerpt: "Sorry",
    })
    expect(JSON.parse(entry)).toEqual({
      ...call,
      problem: "the reply text is not JSON",
      excerpt: "Sorry",
    })
  })

  it("records a reply the pipeline could only partly use", () => {
    const entry = problemEntry({
      time: call.time,
      provider: "gemini",
      tier: "cheap",
      problem: "left out lines 2",
    })
    expect(JSON.parse(entry)).toEqual({
      time: call.time,
      provider: "gemini",
      tier: "cheap",
      problem: "left out lines 2",
    })
  })

  it("never writes the key or the request url", () => {
    const entry = callEntry({ ...call, usage: null, problem: "x", excerpt: "y" })
    expect(entry).not.toContain("key=")
    expect(entry).not.toContain("https://")
  })
})
