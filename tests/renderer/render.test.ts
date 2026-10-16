import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildSync } from "esbuild"
import { describe, expect, it } from "vitest"
import {
  acceptStyleList,
  render,
  setStyleGuess,
  type AppState,
  type Screen,
} from "../../src/renderer/render"

function card(screen: Screen): AppState {
  return {
    screen,
    series: "Frieren",
    fileName: "episode.ass",
    variant: "pt-pt",
    preset: "balanced",
    provider: "mistral",
    openFlagCount: 3,
    current: null,
    proposal: null,
  }
}

function bundleView(): string {
  const outfile = join(mkdtempSync(join(tmpdir(), "honya-view-")), "view.js")
  buildSync({
    entryPoints: [fileURLToPath(new URL("../../src/renderer/view.ts", import.meta.url))],
    bundle: true,
    platform: "browser",
    format: "esm",
    outfile,
  })
  return outfile
}

function renderFromBrowser(modulePath: string, state: AppState): string {
  const source = [
    `import { render } from ${JSON.stringify(modulePath)}`,
    `const html = render(${JSON.stringify(state)})`,
    `if (typeof html !== "string") throw new Error("expected string")`,
    `process.stdout.write(html)`,
  ].join("\n")
  return execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    encoding: "utf8",
  })
}

function styleItem(html: string, name: string): string {
  const start = html.indexOf(`data-style="${name}"`)
  const end = html.indexOf("</li>", start)
  if (start === -1 || end === -1) {
    throw new Error(`missing style ${name}`)
  }
  return html.slice(start, end)
}

describe("render", () => {
  it("draws the split review card in paper, ink, and orange", () => {
    const html = render({
      screen: "review",
      series: "Frieren",
      fileName: "episode.ass",
      variant: "pt-pt",
      preset: "balanced",
      provider: "mistral",
      openFlagCount: 3,
      current: {
        words: "Estás a dizer-me que aquela coisa é um dragão?",
        note: "linha longa para o cue",
        english: "You're telling me that thing is a dragon?",
        before: "O Himmel teria sorrido.",
        after: "Vamos andando.",
      },
      proposal: null,
    })
    expect(html).toContain("Frieren")
    expect(html).toContain("episode.ass")
    expect(html).toContain("3 flags")
    expect(html).toContain("You're telling me that thing is a dragon?")
    expect(html).toContain("{note: linha longa para o cue}")
    expect(html).toContain("Accept")
    expect(html).toContain("#e36b1e")
    expect(html).toContain("#faf7f2")
    expect(html).toContain("#2a2420")
  })

  it("lists a guessed style and puts Dialogue and Skip only on the ambiguous name", () => {
    const state = card("styles")
    state.styles = [
      { name: "Default", guess: "dialogue" },
      { name: "Weird", guess: "ambiguous" },
    ]
    const html = render(state)
    expect(styleItem(html, "Default")).toContain("dialogue")
    expect(styleItem(html, "Default")).not.toContain("Dialogue")
    expect(styleItem(html, "Default")).not.toContain("Skip")
    expect(styleItem(html, "Weird")).toContain("ambiguous")
    expect(styleItem(html, "Weird")).toContain("Dialogue")
    expect(styleItem(html, "Weird")).toContain("Skip")
    const guessed = setStyleGuess(state, "Weird", "skip")
    const styles = guessed.styles
    if (styles === undefined) {
      throw new Error("missing styles")
    }
    const weird = styles.find((style) => style.name === "Weird")
    const kept = styles.find((style) => style.name === "Default")
    if (weird === undefined || kept === undefined) {
      throw new Error("missing style")
    }
    expect(weird.guess).toBe("skip")
    expect(kept.guess).toBe("dialogue")
  })

  it("sets styleListAccepted when the style list is accepted", () => {
    const next = acceptStyleList(card("styles"))
    expect(next.styleListAccepted).toBe(true)
  })

  it("shows preflight counts and the output path", () => {
    const state = card("preflight")
    state.preflight = {
      provider: "gpt",
      preset: "best",
      dialogueLineCount: 12,
      frameCount: 4,
      outputPath: "/tmp/episode.pt-pt.ass",
    }
    const html = render(state)
    expect(html).toContain("12")
    expect(html).toContain("4")
    expect(html).toContain("gpt")
    expect(html).toContain("best")
    expect(html).toContain("/tmp/episode.pt-pt.ass")
  })

  it("shows the run batch index and the latest line", () => {
    const state = card("run")
    state.run = {
      batchIndex: 3,
      latest: { eventIndex: 8, words: "Vamos andando.", note: null, english: "Let's go." },
    }
    const html = render(state)
    expect(html).toContain("3")
    expect(html).toContain("Vamos andando.")
  })

  it("shows a profile rule, an example name, and a series name", () => {
    const state = card("profiles")
    state.profiles = {
      rules: [
        { kind: "prose", text: "Prefer tu." },
        { kind: "glossary", source: "dragon", pt: "dragão" },
      ],
      examples: ["sample.ass"],
      series: ["Frieren"],
      providerKey: "key-1",
      cheapModel: "cheap-1",
      strongModel: "strong-1",
    }
    const html = render(state)
    expect(html).toContain("Prefer tu.")
    expect(html).toContain("dragon → dragão")
    expect(html).toContain("sample.ass")
    expect(html).toContain("Frieren")
  })

  it("matches the browser javascript for the review fixture", () => {
    const state: AppState = {
      screen: "review",
      series: "Frieren",
      fileName: "episode.ass",
      variant: "pt-pt",
      preset: "balanced",
      provider: "mistral",
      openFlagCount: 3,
      current: {
        words: "Estás a dizer-me que aquela coisa é um dragão?",
        note: "linha longa para o cue",
        english: "You're telling me that thing is a dragon?",
        before: "O Himmel teria sorrido.",
        after: "Vamos andando.",
      },
      proposal: null,
    }
    const page = readFileSync(
      fileURLToPath(new URL("../../src/renderer/index.html", import.meta.url)),
      "utf8",
    )
    const modulePath = bundleView()
    const browser = readFileSync(modulePath, "utf8")
    expect(page).toContain('from "./view.js"')
    expect(page).toContain("render(")
    expect(browser).not.toContain("ass-compiler")
    expect(browser).not.toMatch(/from\s+["'][^"']+\.ts["']/)
    expect(renderFromBrowser(modulePath, state)).toBe(render(state))
  })

  it("renders a core proposal when the display proposal is null", () => {
    const state = card("review")
    state.coreProposal = {
      siblings: [{ eventIndex: 4, words: "O Himmel teria sorrido." }],
      rule: { kind: "glossary", source: "dragon", pt: "dragão" },
    }
    const html = render(state)
    expect(html).toContain("O Himmel teria sorrido.")
    expect(html).toContain("dragon → dragão")
    expect(html).toContain("Save to series")
    expect(html).toContain("Save to base")
    expect(html).toContain("Decline rule")
  })
})
