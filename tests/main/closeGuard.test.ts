import { describe, expect, it } from "vitest"
import { createCloseGuard } from "../../src/main/closeGuard"

function setup(running: boolean) {
  const calls: string[] = []
  const state = { running }
  const guard = createCloseGuard({
    running: () => state.running,
    ask: () => calls.push("ask"),
    close: () => calls.push("close"),
  })
  return { guard, calls, state }
}

describe("close guard", () => {
  it("lets the window close when no run is going", () => {
    const { guard, calls } = setup(false)
    expect(guard.onClose()).toBe(true)
    expect(calls).toEqual([])
  })

  it("holds the close during a run and asks the page once", () => {
    const { guard, calls } = setup(true)
    expect(guard.onClose()).toBe(false)
    expect(guard.onClose()).toBe(false)
    expect(calls).toEqual(["ask"])
  })

  it("closes on a yes and lets that close through", () => {
    const { guard, calls } = setup(true)
    guard.onClose()
    guard.answer(true)
    expect(calls).toEqual(["ask", "close"])
    expect(guard.onClose()).toBe(true)
  })

  it("stays open on a no and asks again next time", () => {
    const { guard, calls } = setup(true)
    guard.onClose()
    guard.answer(false)
    expect(calls).toEqual(["ask"])
    expect(guard.onClose()).toBe(false)
    expect(calls).toEqual(["ask", "ask"])
  })

  it("ignores an answer nobody asked for", () => {
    const { guard, calls } = setup(true)
    guard.answer(true)
    expect(calls).toEqual([])
    expect(guard.onClose()).toBe(false)
  })
})
