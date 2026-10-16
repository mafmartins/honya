import { describe, expect, it } from "vitest"
import { ProviderError, type ProviderErrorKind } from "../../src/core/providers/errors"
import { withRetry, RETRY_DELAYS_MS } from "../../src/core/providers/retry"
import type { Completer } from "../../src/core/pipeline/run"
import { LINES_SCHEMA } from "../../src/core/pipeline/schemas"

const request = { tier: "cheap" as const, system: "", prompt: "[0] Hello.", schema: LINES_SCHEMA }
const success = { value: { lines: [], terms: [] } }

function failing(
  kind: ProviderErrorKind,
  times: number,
): { completer: Completer; calls: () => number } {
  let calls = 0
  const completer: Completer = async () => {
    await Promise.resolve()
    calls += 1
    if (calls <= times) {
      throw new ProviderError(kind, "claude", `${kind} failure`, null)
    }
    return success
  }
  return { completer, calls: () => calls }
}

function recorder(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = []
  return {
    delays,
    sleep: async (ms) => {
      await Promise.resolve()
      delays.push(ms)
    },
  }
}

describe("withRetry", () => {
  it("retries rate-limit, server and network errors with 1s, 4s, 15s", async () => {
    expect(RETRY_DELAYS_MS).toEqual([1000, 4000, 15000])
    for (const kind of ["rate-limit", "server", "network"] as const) {
      const { completer, calls } = failing(kind, 3)
      const { sleep, delays } = recorder()
      const retried: { delayMs: number; error: ProviderError }[] = []
      const wrapped = withRetry(completer, sleep, (delayMs, error) => {
        retried.push({ delayMs, error })
      })

      await expect(wrapped(request)).resolves.toEqual(success)
      expect(calls()).toBe(4)
      expect(delays).toEqual([1000, 4000, 15000])
      expect(retried.map((r) => r.delayMs)).toEqual([1000, 4000, 15000])
      expect(retried.every((r) => r.error.kind === kind)).toBe(true)
    }
  })

  it("gives up after the last delay", async () => {
    let calls = 0
    const completer: Completer = async () => {
      await Promise.resolve()
      calls += 1
      throw new ProviderError("server", "mistral", "server failure", 503)
    }
    const { sleep, delays } = recorder()
    const wrapped = withRetry(completer, sleep, () => undefined)

    const error = await wrapped(request).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ kind: "server", status: 503 })
    expect(calls).toBe(4)
    expect(delays).toEqual([1000, 4000, 15000])
  })

  it("never retries auth or request errors", async () => {
    for (const kind of ["auth", "request"] as const) {
      const { completer, calls } = failing(kind, 1)
      const { sleep, delays } = recorder()
      const wrapped = withRetry(completer, sleep, () => undefined)

      await expect(wrapped(request)).rejects.toMatchObject({ kind })
      expect(calls()).toBe(1)
      expect(delays).toEqual([])
    }
  })

  it("passes non-provider errors through", async () => {
    let calls = 0
    const completer: Completer = async () => {
      await Promise.resolve()
      calls += 1
      throw new Error("boom")
    }
    const { sleep, delays } = recorder()
    const wrapped = withRetry(completer, sleep, () => undefined)

    await expect(wrapped(request)).rejects.toThrow("boom")
    expect(calls).toBe(1)
    expect(delays).toEqual([])
  })
})
