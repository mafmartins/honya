// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ErrorContext } from "../../src/renderer/action"
import type { TranslateTarget } from "../../src/renderer/App"
import { ApiContext } from "../../src/renderer/api"
import { ErrorLine } from "../../src/renderer/ErrorLine"
import { TranslateScreen } from "../../src/renderer/screens/TranslateScreen"
import type { HonyaApi } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

const TARGET: TranslateTarget = { kind: "resume", id: "session-1" }

function Harness(props: { api: HonyaApi; onAnother?: () => void }): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  return (
    <ApiContext.Provider value={props.api}>
      <ErrorContext.Provider value={setError}>
        <ErrorLine message={error} />
        <TranslateScreen
          target={TARGET}
          onBack={() => undefined}
          onAnother={props.onAnother ?? (() => undefined)}
        />
      </ErrorContext.Provider>
    </ApiContext.Provider>
  )
}

async function finishRun(api: ReturnType<typeof fakeApi>): Promise<void> {
  await screen.findByRole("button", { name: "Stop" })
  act(() => {
    api.emitTranslate({ type: "finished", sessionId: "session-1", openFlags: 0 })
  })
}

function row(label: string): string | undefined {
  return screen.queryByText(label)?.nextElementSibling?.textContent ?? undefined
}

describe("done panel", () => {
  it("finishes a zero-flag run and shows the report", async () => {
    const finishTranslation = vi.fn((id: string) => fakeApi().finishTranslation(id))
    const api = fakeApi({ finishTranslation })
    render(<Harness api={api} />)
    await finishRun(api)
    await screen.findByText("Done")
    expect(finishTranslation).toHaveBeenCalledTimes(1)
    expect(finishTranslation).toHaveBeenCalledWith("session-1")
    expect(row("Lines translated")).toBe("288 of 290")
    expect(row("Sent to the strong model")).toBe("14")
    expect(row("Left in English")).toBe("2")
    expect(row("Over the reading speed limit")).toBe("5")
    expect(row("Flags")).toBe("6: 4 edited, 2 accepted as they were")
    expect(row("Rules saved")).toBe("3 to the series, 1 to the base")
    expect(row("Frames")).toBe("7 used, 1 couldn't be grabbed")
    expect(row("Events copied unchanged")).toBe("12")
    expect(row("Time")).toBe("12 min 5 s")
    expect(row("Saved to")).toBe("/s/subs.pt-pt.ass")
  })

  it("hides the frames and unchanged rows when they are zero", async () => {
    const base = await fakeApi().finishTranslation("x")
    const api = fakeApi({
      finishTranslation: () =>
        Promise.resolve({
          ...base,
          report: {
            ...base.report,
            framesUsed: 0,
            frameFailures: 0,
            unchanged: 0,
            elapsedMs: 42000,
          },
        }),
    })
    render(<Harness api={api} />)
    await finishRun(api)
    await screen.findByText("Done")
    expect(screen.queryByText("Frames")).toBeNull()
    expect(screen.queryByText("Events copied unchanged")).toBeNull()
    expect(row("Time")).toBe("0 min 42 s")
  })

  it("shows the error and succeeds on Try again", async () => {
    const base = await fakeApi().finishTranslation("x")
    const finishTranslation = vi
      .fn<HonyaApi["finishTranslation"]>()
      .mockRejectedValueOnce(new Error("Couldn't write the file."))
      .mockResolvedValueOnce(base)
    const api = fakeApi({ finishTranslation })
    render(<Harness api={api} />)
    await finishRun(api)
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't write the file.")
    expect(screen.queryByText("Writing the file…")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await screen.findByText("Done")
    expect(finishTranslation).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("reveals the file and starts another translation", async () => {
    const revealOutput = vi.fn(() => Promise.resolve())
    const onAnother = vi.fn()
    const api = fakeApi({ revealOutput })
    render(<Harness api={api} onAnother={onAnother} />)
    await finishRun(api)
    fireEvent.click(await screen.findByRole("button", { name: "Show in Finder" }))
    expect(revealOutput).toHaveBeenCalledWith("session-1")
    fireEvent.click(screen.getByRole("button", { name: "Translate another" }))
    expect(onAnother).toHaveBeenCalledTimes(1)
  })
})
