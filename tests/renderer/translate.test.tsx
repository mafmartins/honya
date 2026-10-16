// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { StrictMode, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ErrorContext } from "../../src/renderer/action"
import { App, type TranslateTarget } from "../../src/renderer/App"
import { ApiContext } from "../../src/renderer/api"
import { ErrorLine } from "../../src/renderer/ErrorLine"
import { TranslateScreen } from "../../src/renderer/screens/TranslateScreen"
import type { HonyaApi, TranslateEvent, TranslateRequest } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

const REQUEST: Omit<TranslateRequest, "dialogueStyles"> = {
  scriptPath: "/s/subs.ass",
  variant: "pt-pt",
  seriesId: "a",
  provider: "claude",
  preset: "save",
  frameSetting: "none",
  videoPath: null,
}

const NEW_TARGET: TranslateTarget = {
  kind: "new",
  request: REQUEST,
  scriptName: "subs.ass",
  seriesName: "Frieren",
}

function Harness(props: { api: HonyaApi; target: TranslateTarget }): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  return (
    <ApiContext.Provider value={props.api}>
      <ErrorContext.Provider value={setError}>
        <ErrorLine message={error} />
        <TranslateScreen
          target={props.target}
          onBack={() => undefined}
          onAnother={() => undefined}
        />
      </ErrorContext.Provider>
    </ApiContext.Provider>
  )
}

function batch(sessionId: string, index = 2): TranslateEvent {
  return {
    type: "batch",
    sessionId,
    index,
    total: 12,
    linesDone: 50,
    lineTotal: 290,
    lines: [
      { eventIndex: 1, english: "Hello", words: "Olá", note: null },
      { eventIndex: 2, english: "Long one", words: "Longa", note: "linha longa" },
    ],
  }
}

describe("translate screen", () => {
  it("starts at once with the dialogue styles when nothing is ambiguous", async () => {
    const startTranslation = vi.fn(() => Promise.resolve("session-1"))
    const api = fakeApi({
      startTranslation,
      prepareTranslation: () =>
        Promise.resolve({
          styles: [
            { name: "Default", guess: "dialogue" },
            { name: "Sign", guess: "skip" },
          ],
          outputPath: "/s/subs.pt-pt.ass",
          scriptName: "subs.ass",
        }),
    })
    render(<Harness api={api} target={NEW_TARGET} />)
    expect(await screen.findByRole("button", { name: "Stop" })).toBeTruthy()
    expect(startTranslation).toHaveBeenCalledWith({ ...REQUEST, dialogueStyles: ["Default"] })
    expect(screen.getByText("subs.ass · Frieren · pt-pt · claude · save")).toBeTruthy()
    expect(screen.getByText("Output: /s/subs.pt-pt.ass")).toBeTruthy()
  })

  it("asks about ambiguous styles and starts only after they are chosen", async () => {
    const startTranslation = vi.fn(() => Promise.resolve("session-1"))
    const api = fakeApi({
      startTranslation,
      prepareTranslation: () =>
        Promise.resolve({
          styles: [
            { name: "Default", guess: "dialogue" },
            { name: "Misc", guess: "ambiguous" },
          ],
          outputPath: "/s/o.ass",
          scriptName: "subs.ass",
        }),
    })
    render(<Harness api={api} target={NEW_TARGET} />)
    const start = await screen.findByRole("button", { name: "Start translating" })
    expect(start instanceof HTMLButtonElement && start.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText("Misc dialogue"))
    expect(start instanceof HTMLButtonElement && start.disabled).toBe(false)
    expect(startTranslation).not.toHaveBeenCalled()
    fireEvent.click(start)
    await screen.findByRole("button", { name: "Stop" })
    expect(startTranslation).toHaveBeenCalledWith({
      ...REQUEST,
      dialogueStyles: ["Default", "Misc"],
    })
  })

  it("says so when no style holds dialogue", async () => {
    const startTranslation = vi.fn(() => Promise.resolve("session-1"))
    const api = fakeApi({
      startTranslation,
      prepareTranslation: () =>
        Promise.resolve({
          styles: [{ name: "Sign", guess: "skip" }],
          outputPath: "/s/o.ass",
          scriptName: "subs.ass",
        }),
    })
    render(<Harness api={api} target={NEW_TARGET} />)
    expect(
      await screen.findByText("This script has no dialogue lines in the chosen styles."),
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy()
    expect(startTranslation).not.toHaveBeenCalled()
  })

  it("shows progress, lines with notes, and activity", async () => {
    const api = fakeApi()
    render(<Harness api={api} target={NEW_TARGET} />)
    await screen.findByRole("button", { name: "Stop" })
    act(() => {
      api.emitTranslate(batch("session-1"))
      api.emitTranslate({ type: "activity", sessionId: "session-1", text: "Waiting 4s to retry" })
    })
    expect(screen.getByText("Batch 2 of 12")).toBeTruthy()
    expect(screen.getByText("50 of 290 lines")).toBeTruthy()
    expect(screen.getByText("Waiting 4s to retry")).toBeTruthy()
    const bar = document.querySelector("progress")
    expect(bar?.value).toBe(50)
    expect(bar?.max).toBe(290)
    const rows = screen.getByRole("list", { name: "live lines" }).querySelectorAll("li")
    expect(rows).toHaveLength(2)
    expect(rows[0]?.className).toBe("")
    expect(rows[1]?.className).toBe("noted")
    expect(screen.getByText("{note: linha longa}").className).toBe("note")
  })

  it("shows an event emitted before startTranslation resolves", async () => {
    const holder: { api: ReturnType<typeof fakeApi> | null } = { api: null }
    const api = fakeApi({
      startTranslation: () => {
        holder.api?.emitTranslate(batch("session-1", 3))
        holder.api?.emitTranslate(batch("other", 9))
        return Promise.resolve("session-1")
      },
    })
    holder.api = api
    render(<Harness api={api} target={NEW_TARGET} />)
    expect(await screen.findByText("Batch 3 of 12")).toBeTruthy()
    expect(screen.queryByText("Batch 9 of 12")).toBeNull()
  })

  it("ignores events for another session", async () => {
    const api = fakeApi()
    render(<Harness api={api} target={NEW_TARGET} />)
    await screen.findByRole("button", { name: "Stop" })
    act(() => {
      api.emitTranslate(batch("other"))
      api.emitTranslate({ type: "failed", sessionId: "other", message: "boom" })
    })
    expect(screen.queryByText("Batch 2 of 12")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy()
  })

  it("stops after the batch and offers Continue", async () => {
    const stopTranslation = vi.fn(() => Promise.resolve())
    const resumeTranslation = vi.fn((id: string) => Promise.resolve(id))
    const api = fakeApi({ stopTranslation, resumeTranslation })
    render(<Harness api={api} target={NEW_TARGET} />)
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }))
    const stopping = await screen.findByRole("button", { name: "Stopping after this batch…" })
    expect(stopping instanceof HTMLButtonElement && stopping.disabled).toBe(true)
    expect(stopTranslation).toHaveBeenCalledOnce()
    act(() => {
      api.emitTranslate({ type: "stopped", sessionId: "session-1" })
    })
    expect(screen.getByText("Stopped. Finished batches are saved.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(resumeTranslation).toHaveBeenCalledWith("session-1")
    expect(await screen.findByRole("button", { name: "Stop" })).toBeTruthy()
  })

  it("shows a failure and retries", async () => {
    const resumeTranslation = vi.fn((id: string) => Promise.resolve(id))
    const api = fakeApi({ resumeTranslation })
    render(<Harness api={api} target={NEW_TARGET} />)
    await screen.findByRole("button", { name: "Stop" })
    act(() => {
      api.emitTranslate({ type: "failed", sessionId: "session-1", message: "Claude is busy." })
    })
    expect((await screen.findByRole("alert")).textContent).toBe("Claude is busy.")
    expect(screen.getByRole("button", { name: "Back to Start" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(resumeTranslation).toHaveBeenCalledWith("session-1")
    await screen.findByRole("button", { name: "Stop" })
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("shows the review placeholder on finished", async () => {
    const api = fakeApi()
    render(<Harness api={api} target={NEW_TARGET} />)
    await screen.findByRole("button", { name: "Stop" })
    act(() => {
      api.emitTranslate({ type: "finished", sessionId: "session-1", openFlags: 2 })
    })
    expect(screen.getByText("Review")).toBeTruthy()
  })

  it("resumes a target by id and keeps a finished event that comes early", async () => {
    const holder: { api: ReturnType<typeof fakeApi> | null } = { api: null }
    const resumeTranslation = vi.fn((id: string) => {
      holder.api?.emitTranslate({ type: "finished", sessionId: id, openFlags: 0 })
      return Promise.resolve(id)
    })
    const api = fakeApi({ resumeTranslation })
    holder.api = api
    render(<Harness api={api} target={{ kind: "resume", id: "s9" }} />)
    expect(resumeTranslation).toHaveBeenCalledWith("s9")
    expect(await screen.findByText("Review")).toBeTruthy()
  })

  it("shows a prepare error and keeps Back", async () => {
    const api = fakeApi({ prepareTranslation: () => Promise.reject(new Error("Cannot read it.")) })
    render(<Harness api={api} target={NEW_TARGET} />)
    expect((await screen.findByRole("alert")).textContent).toBe("Cannot read it.")
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy()
  })

  it("recovers from a resume that is refused", async () => {
    const api = fakeApi({
      resumeTranslation: () => Promise.reject(new Error("That translation no longer exists.")),
    })
    render(<Harness api={api} target={{ kind: "resume", id: "s9" }} />)
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That translation no longer exists.",
    )
    expect(screen.getByRole("button", { name: "Back to Start" })).toBeTruthy()
  })

  it("starts once under StrictMode, for a new and a resume target", async () => {
    const startTranslation = vi.fn(() => Promise.resolve("session-1"))
    const resumeTranslation = vi.fn((id: string) => Promise.resolve(id))
    const api = fakeApi({ startTranslation, resumeTranslation })
    render(
      <StrictMode>
        <Harness api={api} target={NEW_TARGET} />
      </StrictMode>,
    )
    await screen.findByRole("button", { name: "Stop" })
    expect(startTranslation).toHaveBeenCalledTimes(1)
    cleanup()
    render(
      <StrictMode>
        <Harness api={api} target={{ kind: "resume", id: "s9" }} />
      </StrictMode>,
    )
    await screen.findByRole("button", { name: "Stop" })
    expect(resumeTranslation).toHaveBeenCalledTimes(1)
  })

  it("re-enables Stop when stopping is refused", async () => {
    const api = fakeApi({ stopTranslation: () => Promise.reject(new Error("Nothing is running.")) })
    render(<Harness api={api} target={NEW_TARGET} />)
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }))
    expect((await screen.findByRole("alert")).textContent).toBe("Nothing is running.")
    const stop = screen.getByRole("button", { name: "Stop" })
    expect(stop instanceof HTMLButtonElement && stop.disabled).toBe(false)
  })

  it("unsubscribes on unmount", () => {
    const off = vi.fn()
    const api = fakeApi({ onTranslateEvent: () => off })
    const view = render(<Harness api={api} target={{ kind: "resume", id: "s9" }} />)
    view.unmount()
    expect(off).toHaveBeenCalledOnce()
  })
})

describe("start to translate", () => {
  it("sends the full request from the Start screen, and resumes by id", async () => {
    const startTranslation = vi.fn(() => Promise.resolve("session-1"))
    const resumeTranslation = vi.fn((id: string) => Promise.resolve(id))
    const api = fakeApi({
      startTranslation,
      resumeTranslation,
      pickScript: () => Promise.resolve({ path: "/s/ep01.ass", name: "ep01.ass", text: "x" }),
      pickVideo: () => Promise.resolve({ path: "/v/ep01.mkv", name: "ep01.mkv" }),
      listSeries: () =>
        Promise.resolve({ series: [{ id: "a", name: "Frieren", ruleCount: 0 }], problems: [] }),
      latestUnfinished: () =>
        Promise.resolve({
          id: "s1",
          scriptName: "ep01.ass",
          seriesName: "Frieren",
          phase: "stopped",
          completedBatches: 1,
          totalBatches: 5,
          openFlags: 0,
        }),
    })
    render(<App api={api} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose script…" }))
    await screen.findByText("ep01.ass")
    fireEvent.change(await screen.findByLabelText("series"), { target: { value: "a" } })
    fireEvent.change(await screen.findByLabelText("claude key"), { target: { value: "sk-test" } })
    fireEvent.click(screen.getByRole("button", { name: "Save key" }))
    fireEvent.click(screen.getByRole("button", { name: "Choose video…" }))
    await screen.findByText("ep01.mkv")
    fireEvent.change(screen.getByLabelText("frame setting"), { target: { value: "marked" } })
    const translate = screen.getByRole("button", { name: "Translate" })
    await waitFor(() => {
      expect(translate instanceof HTMLButtonElement && translate.disabled).toBe(false)
    })
    fireEvent.click(translate)
    await screen.findByRole("button", { name: "Stop" })
    expect(startTranslation).toHaveBeenCalledWith({
      scriptPath: "/s/ep01.ass",
      variant: "pt-pt",
      seriesId: "a",
      provider: "claude",
      preset: "save",
      frameSetting: "marked",
      videoPath: "/v/ep01.mkv",
      dialogueStyles: ["Default"],
    })
    cleanup()
    render(<App api={api} />)
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }))
    await screen.findByRole("button", { name: "Stop" })
    expect(resumeTranslation).toHaveBeenCalledWith("s1")
  })
})
