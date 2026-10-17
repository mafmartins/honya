// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ApiContext } from "../../src/renderer/api"
import { StatsPage } from "../../src/renderer/workspace/pages/StatsPage"
import type { SessionStats } from "../../src/shared/api"
import { fakeApi, type FakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

const STATS: SessionStats = {
  lines: { ai: 280, manual: 8, untranslated: 2, total: 290 },
  flags: { open: 3, accepted: 2, edited: 4, retranslated: 1 },
  strongLines: 14,
  retranslatedLines: 5,
  cost: { usd: 0.07, unpriced: [], input: 27965, output: 13299, requests: 14 },
  models: [
    { model: "claude-haiku-5-5", requests: 12, input: 25000, output: 12000, usd: 0.05 },
    { model: "claude-sonnet-5-5", requests: 2, input: 2965, output: 1299, usd: 0.02 },
  ],
  activeMs: 725000,
  framesGrabbed: 7,
}

function renderStats(api: FakeApi, sessionId: string | null): void {
  render(
    <ApiContext.Provider value={api}>
      <StatsPage sessionId={sessionId} />
    </ApiContext.Provider>,
  )
}

describe("session stats page", () => {
  it("asks to open a session when none is open", () => {
    renderStats(fakeApi(), null)
    expect(screen.getByRole("heading", { level: 1, name: "Session stats" })).toBeTruthy()
    expect(screen.getByText("Open a session to see its stats.")).toBeTruthy()
  })

  it("shows lines, flags, work and the cost in euros with the rate used", async () => {
    const api = fakeApi({ sessionStats: () => Promise.resolve(STATS) })
    await api.updateSettings({ eurRate: 0.86 })
    renderStats(api, "s1")
    expect(await screen.findByText("≈ €0.06 ($0.07 at 0.86)")).toBeTruthy()
    const lines = screen.getByRole("region", { name: "Lines" })
    expect(within(lines).getByText("Translated by the AI").nextSibling?.textContent).toBe("280")
    expect(within(lines).getByText("Translated by you").nextSibling?.textContent).toBe("8")
    expect(within(lines).getByText("Still untranslated").nextSibling?.textContent).toBe("2")
    expect(within(lines).getByText("Total").nextSibling?.textContent).toBe("290")
    const flags = screen.getByRole("region", { name: "Flags" })
    expect(within(flags).getByText("Open").nextSibling?.textContent).toBe("3")
    expect(within(flags).getByText("Retranslated").nextSibling?.textContent).toBe("1")
    const work = screen.getByRole("region", { name: "Work" })
    expect(within(work).getByText("Lines sent to the strong model").nextSibling?.textContent).toBe(
      "14",
    )
    expect(within(work).getByText("Lines retranslated on request").nextSibling?.textContent).toBe(
      "5",
    )
    expect(within(work).getByText("Time spent").nextSibling?.textContent).toBe("12 min 5 s")
    expect(within(work).getByText("Frames grabbed").nextSibling?.textContent).toBe("7")

    const cost = screen.getByRole("region", { name: "Cost" })
    expect(
      within(cost).getByText("14 requests · 27,965 tokens in · 13,299 tokens out"),
    ).toBeTruthy()
    const row = within(cost).getByText("claude-haiku-5-5").closest("tr")
    expect(Array.from(row?.querySelectorAll("td") ?? []).map((cell) => cell.textContent)).toEqual([
      "claude-haiku-5-5",
      "12",
      "25,000",
      "12,000",
      "€0.04",
    ])
    expect(within(cost).getByText("Costs are estimates from list prices.")).toBeTruthy()
  })

  it("says when there is no cost yet", async () => {
    const api = fakeApi({
      sessionStats: () =>
        Promise.resolve({
          ...STATS,
          cost: { usd: null, unpriced: [], input: 0, output: 0, requests: 0 },
          models: [],
        }),
    })
    renderStats(api, "s1")
    expect(await screen.findByText("No cost yet")).toBeTruthy()
  })
})
