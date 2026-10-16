// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "../../src/renderer/App"
import { ReviewScreen } from "../../src/renderer/screens/ReviewScreen"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

describe("renderer shell", () => {
  it("opens on the start screen inside the card", async () => {
    render(<App api={fakeApi()} />)
    expect(await screen.findByRole("button", { name: "Profiles" })).toBeTruthy()
    expect(document.querySelector("article.card")).not.toBeNull()
  })

  it("shows review text as text, not markup", () => {
    render(
      <ReviewScreen
        series="<b>Frieren</b>"
        fileName="ep01.ass"
        variant="pt-pt"
        preset="balanced"
        openFlagCount={3}
        current={{ words: "Olá", note: "linha longa", english: "Hi", before: "", after: "" }}
      />,
    )
    expect(screen.getByText("<b>Frieren</b> · ep01.ass · 3 flags")).toBeTruthy()
    expect(screen.getByText("{note: linha longa}")).toBeTruthy()
  })
})
