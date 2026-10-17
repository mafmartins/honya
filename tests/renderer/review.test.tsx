// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiContext } from "../../src/renderer/api"
import { ReviewPanel } from "../../src/renderer/translate/ReviewPanel"
import type { CheckResult, HonyaApi, ReviewLine, ReviewView } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

function line(eventIndex: number, flagged: boolean, accepted = false): ReviewLine {
  return {
    eventIndex,
    english: `English ${String(eventIndex)}`,
    words: `Words ${String(eventIndex)}`,
    note: flagged ? `note ${String(eventIndex)}` : null,
    edited: false,
    flagged,
    accepted,
  }
}

function view(lines: ReviewLine[]): ReviewView {
  return {
    sessionId: "session-1",
    scriptName: "subs.ass",
    seriesName: "Frieren",
    variant: "pt-pt",
    preset: "save",
    outputPath: "/s/subs.pt-pt.ass",
    lines,
    openFlags: lines.filter((l) => l.flagged && !l.accepted).length,
  }
}

const TWO_FLAGS = view([line(1, false), line(2, true), line(3, false), line(4, true)])
const ONE_LEFT = view([line(1, false), line(2, true, true), line(3, false), line(4, true)])
const NONE_LEFT = view([line(1, false), line(2, true, true), line(3, false), line(4, true, true)])

function mount(api: HonyaApi, onFinish: () => void = () => undefined): void {
  render(
    <ApiContext.Provider value={api}>
      <ReviewPanel sessionId="session-1" onFinish={onFinish} />
    </ApiContext.Provider>,
  )
}

describe("review panel", () => {
  it("shows the header and the first flag, and accepts it unchanged", async () => {
    const acceptReviewLine = vi.fn(() => Promise.resolve(ONE_LEFT))
    mount(fakeApi({ loadReview: () => Promise.resolve(TWO_FLAGS), acceptReviewLine }))
    await screen.findByText("Frieren · subs.ass · 2 flags")
    expect(screen.getByText("pt-pt · save")).toBeTruthy()
    expect(screen.getByText("{note: note 2}")).toBeTruthy()
    expect(screen.getByLabelText<HTMLTextAreaElement>("translation").value).toBe("Words 2")
    expect(screen.getByRole("button", { name: "Finish" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    await waitFor(() => {
      expect(acceptReviewLine).toHaveBeenCalledWith("session-1", 2, null)
    })
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLTextAreaElement>("translation").value).toBe("Words 4")
    })
  })

  it("finishes at once when no flag is open", async () => {
    const onFinish = vi.fn()
    mount(fakeApi({ loadReview: () => Promise.resolve(view([line(1, false)])) }), onFinish)
    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1)
    })
  })

  it("checks an edit and accepts it when the change is not lasting", async () => {
    let release: (value: { status: "none" }) => void = () => undefined
    const checkEdit = vi.fn(
      () =>
        new Promise<{ status: "none" }>((resolve) => {
          release = resolve
        }),
    )
    const acceptReviewLine = vi.fn(() => Promise.resolve(ONE_LEFT))
    mount(fakeApi({ loadReview: () => Promise.resolve(TWO_FLAGS), checkEdit, acceptReviewLine }))
    const box = await screen.findByLabelText("translation")
    fireEvent.change(box, { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    await screen.findByText("Checking whether this is a lasting change…")
    expect(screen.getByRole("button", { name: "Accept" }).hasAttribute("disabled")).toBe(true)
    release({ status: "none" })
    await waitFor(() => {
      expect(acceptReviewLine).toHaveBeenCalledWith("session-1", 2, "Changed")
    })
  })

  it("confirms a proposal with the sibling unchecked and the rule saved to base", async () => {
    const proposal = {
      siblings: [{ eventIndex: 3, words: "Other new" }],
      rule: { kind: "glossary" as const, source: "sword", pt: "espada" },
    }
    const confirmEdit = vi.fn(() => Promise.resolve(ONE_LEFT))
    mount(
      fakeApi({
        loadReview: () => Promise.resolve(TWO_FLAGS),
        checkEdit: () => Promise.resolve({ status: "proposal", proposal }),
        confirmEdit,
      }),
    )
    fireEvent.change(await screen.findByLabelText("translation"), { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    await screen.findByText("Words 3 → Other new")
    expect(screen.getByText("sword → espada")).toBeTruthy()
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Don't save" }).checked).toBe(true)
    fireEvent.click(screen.getByRole("checkbox", { name: "Also change these 1 lines" }))
    fireEvent.click(screen.getByRole("radio", { name: "Save to base" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    await waitFor(() => {
      expect(confirmEdit).toHaveBeenCalledWith("session-1", 2, "Changed", proposal, false, "base")
    })
  })

  it("returns to the edit on Cancel", async () => {
    mount(
      fakeApi({
        loadReview: () => Promise.resolve(TWO_FLAGS),
        checkEdit: () =>
          Promise.resolve({ status: "proposal", proposal: { siblings: [], rule: null } }),
      }),
    )
    fireEvent.change(await screen.findByLabelText("translation"), { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    expect((await screen.findByLabelText<HTMLTextAreaElement>("translation")).value).toBe("Changed")
  })

  it("keeps the edit with a note when the check fails", async () => {
    const acceptReviewLine = vi.fn(() => Promise.resolve(ONE_LEFT))
    mount(
      fakeApi({
        loadReview: () => Promise.resolve(TWO_FLAGS),
        checkEdit: () => Promise.resolve({ status: "failed" }),
        acceptReviewLine,
      }),
    )
    fireEvent.change(await screen.findByLabelText("translation"), { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    await screen.findByText("The check couldn't run. Your edit is kept on this line only.")
    expect(acceptReviewLine).toHaveBeenCalledWith("session-1", 2, "Changed")
    expect(screen.getByRole("button", { name: "Retry check" })).toBeTruthy()
    expect(screen.getByLabelText<HTMLTextAreaElement>("translation").value).toBe("Changed")
  })

  it("enables Finish once the last flag is accepted", async () => {
    const onFinish = vi.fn()
    mount(
      fakeApi({
        loadReview: () => Promise.resolve(view([line(2, true), line(3, false)])),
        acceptReviewLine: () => Promise.resolve(view([line(2, true, true), line(3, false)])),
      }),
      onFinish,
    )
    await screen.findByLabelText("translation")
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Finish" }).hasAttribute("disabled")).toBe(false)
    })
    fireEvent.click(screen.getByRole("button", { name: "Finish" }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it("moves among flags and accepts an edit on an unflagged line from the list", async () => {
    const acceptReviewLine = vi.fn(() => Promise.resolve(NONE_LEFT))
    mount(fakeApi({ loadReview: () => Promise.resolve(TWO_FLAGS), acceptReviewLine }))
    await screen.findByLabelText("translation")
    fireEvent.click(screen.getByRole("button", { name: "Next flag" }))
    expect(screen.getByLabelText<HTMLTextAreaElement>("translation").value).toBe("Words 4")
    fireEvent.click(screen.getByRole("button", { name: "Previous flag" }))
    expect(screen.getByLabelText<HTMLTextAreaElement>("translation").value).toBe("Words 2")
    const all = screen.getByRole("list", { name: "all lines" })
    fireEvent.click(within(all).getByRole("button", { name: /Words 3/ }))
    const box = screen.getByLabelText("translation")
    expect((box as HTMLTextAreaElement).value).toBe("Words 3")
    fireEvent.change(box, { target: { value: "Edited 3" } })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    await waitFor(() => {
      expect(acceptReviewLine).toHaveBeenCalledWith("session-1", 3, "Edited 3")
    })
  })

  it("keeps a late proposal on the line that was checked", async () => {
    let release: (value: CheckResult) => void = () => undefined
    const checkEdit = vi.fn(
      () =>
        new Promise<CheckResult>((resolve) => {
          release = resolve
        }),
    )
    const proposal = { siblings: [], rule: null }
    const confirmEdit = vi.fn(() => Promise.resolve(ONE_LEFT))
    mount(fakeApi({ loadReview: () => Promise.resolve(TWO_FLAGS), checkEdit, confirmEdit }))
    fireEvent.change(await screen.findByLabelText("translation"), { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    await screen.findByText("Checking whether this is a lasting change…")
    const next = screen.getByRole("button", { name: "Next flag" })
    expect(next.hasAttribute("disabled")).toBe(true)
    fireEvent.click(next)
    release({ status: "proposal", proposal })
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }))
    await waitFor(() => {
      expect(confirmEdit).toHaveBeenCalledWith("session-1", 2, "Changed", proposal, false, null)
    })
  })

  it("offers Try again when the review fails to load", async () => {
    const loadReview = vi
      .fn<HonyaApi["loadReview"]>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(TWO_FLAGS)
    mount(fakeApi({ loadReview }))
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))
    await screen.findByText("Frieren · subs.ass · 2 flags")
    expect(loadReview).toHaveBeenCalledTimes(2)
  })

  it("does not accept or confirm anything on Cancel", async () => {
    const acceptReviewLine = vi.fn(() => Promise.resolve(ONE_LEFT))
    const confirmEdit = vi.fn(() => Promise.resolve(ONE_LEFT))
    mount(
      fakeApi({
        loadReview: () => Promise.resolve(TWO_FLAGS),
        checkEdit: () =>
          Promise.resolve({ status: "proposal", proposal: { siblings: [], rule: null } }),
        acceptReviewLine,
        confirmEdit,
      }),
    )
    fireEvent.change(await screen.findByLabelText("translation"), { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    await screen.findByLabelText("translation")
    expect(acceptReviewLine).not.toHaveBeenCalled()
    expect(confirmEdit).not.toHaveBeenCalled()
  })

  it("clears the note when Retry check finds no lasting change", async () => {
    const checkEdit = vi
      .fn<HonyaApi["checkEdit"]>()
      .mockResolvedValueOnce({ status: "failed" })
      .mockResolvedValue({ status: "none" })
    const acceptReviewLine = vi.fn(() => Promise.resolve(ONE_LEFT))
    mount(fakeApi({ loadReview: () => Promise.resolve(TWO_FLAGS), checkEdit, acceptReviewLine }))
    fireEvent.change(await screen.findByLabelText("translation"), { target: { value: "Changed" } })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    fireEvent.click(await screen.findByRole("button", { name: "Retry check" }))
    await waitFor(() => {
      expect(screen.queryByText(/The check couldn't run/)).toBeNull()
    })
    expect(acceptReviewLine).toHaveBeenCalledWith("session-1", 2, "Changed")
  })
})
