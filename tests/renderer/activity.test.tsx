// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ActivityLine } from "../../src/renderer/workspace/ActivityLine"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("activity line", () => {
  it("shows how long the current step has been running once it takes a while", () => {
    render(<ActivityLine text="Reading the episode" />)
    expect(screen.getByText("Reading the episode")).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(screen.getByText("Reading the episode")).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(69_000)
    })
    expect(screen.getByText("Reading the episode · 1:12")).toBeTruthy()
  })

  it("starts counting again when the step changes", () => {
    const { rerender } = render(<ActivityLine key="a" text="Reading the episode" />)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(screen.getByText("Reading the episode · 0:10")).toBeTruthy()
    rerender(<ActivityLine key="b" text="Translating batch 1 of 13" />)
    expect(screen.getByText("Translating batch 1 of 13")).toBeTruthy()
  })
})
