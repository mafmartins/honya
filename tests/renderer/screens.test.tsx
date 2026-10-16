// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "../../src/renderer/App"
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
})
