export type Screen = "start" | "styles" | "preflight" | "run" | "review" | "profiles"

export interface AppState {
  screen: Screen
  series: string
  fileName: string
  variant: "pt-pt" | "pt-br"
  preset: "save" | "balanced" | "best"
  provider: "claude" | "gpt" | "gemini" | "mistral"
  openFlagCount: number
  current: {
    words: string
    note: string | null
    english: string
    before: string
    after: string
  } | null
  proposal: { siblings: string[]; rule: string | null } | null
}

const VARIANTS = ["pt-pt", "pt-br"] as const
const PRESETS = ["save", "balanced", "best"] as const
const PROVIDERS = ["claude", "gpt", "gemini", "mistral"] as const

const CARD_STYLE =
  "background:#faf7f2;color:#2a2420;border:1.5px solid #2a2420;box-shadow:7px 7px 0 #2a2420;accent-color:#e36b1e"

export function render(state: AppState): string {
  return `<article class="card" style="${CARD_STYLE}">${screenBody(state)}</article>`
}

function screenBody(state: AppState): string {
  switch (state.screen) {
    case "start":
      return renderStart(state)
    case "styles":
      return renderStyles()
    case "preflight":
      return renderPreflight(state)
    case "run":
      return renderRun()
    case "review":
      return renderReview(state)
    case "profiles":
      return renderProfiles()
  }
}

function renderStart(state: AppState): string {
  const file = field("file", `<input type="text" name="file" value="${escapeAttr(state.fileName)}">`)
  const variant = field("variant", selectControl("variant", VARIANTS, state.variant))
  const series = field("series", `<input type="text" name="series" value="${escapeAttr(state.series)}">`)
  const provider = field("provider", selectControl("provider", PROVIDERS, state.provider))
  const preset = field("preset", selectControl("preset", PRESETS, state.preset))
  const create = `<button class="action" type="button" style="color:#e36b1e">Create series profile</button>`
  const video = field("video", `<input type="file" name="video">`)
  const frames = field("frame setting", frameSetting())
  return `<div class="split"><div>${file}${variant}${series}${provider}${preset}${create}</div><div class="decision">${video}${frames}</div></div>`
}

function renderStyles(): string {
  return [
    `<div class="split">`,
    `<div><ul class="styles"></ul></div>`,
    `<div class="decision">`,
    `<button type="button">Dialogue</button>`,
    `<button type="button">Skip</button>`,
    `<button class="action" type="button" name="styleListAccepted" value="true" style="color:#e36b1e">Accept</button>`,
    `</div></div>`,
  ].join("")
}

function renderPreflight(state: AppState): string {
  return [
    `<div class="split">`,
    `<div><p>line count</p><p></p><p>frame count</p><p></p></div>`,
    `<div class="decision">`,
    `<p>provider</p><p>${state.provider}</p>`,
    `<p>preset</p><p>${state.preset}</p>`,
    `<p>output path</p><p></p>`,
    `</div></div>`,
  ].join("")
}

function renderRun(): string {
  return [
    `<div class="split">`,
    `<div><p>batch index</p><p></p></div>`,
    `<div class="decision"><p>latest line</p><p></p></div>`,
    `</div>`,
  ].join("")
}

function renderReview(state: AppState): string {
  const header = [
    `<header class="card-header">`,
    `<p>${escapeText(state.series)} · ${escapeText(state.fileName)} · ${String(state.openFlagCount)} flags</p>`,
    `<p>${state.variant} · ${state.preset}</p>`,
    `</header>`,
  ].join("")
  return `${header}<div class="review-body"><div class="lines">${reviewLines(state)}</div>${reviewDecision(state)}</div>`
}

function renderProfiles(): string {
  const rules = `<p>base rules</p><ul class="rules"></ul>`
  const examples = `<p>example script names</p><ul class="examples"></ul>`
  const exampleFile = field("example script", `<input type="file" name="example">`)
  const series = `<p>series</p><ul class="series-list"></ul>`
  const key = field("provider key", `<input type="password" name="providerKey" value="">`)
  const cheap = field("cheap model id", `<input type="text" name="cheapModel" value="">`)
  const strong = field("strong model id", `<input type="text" name="strongModel" value="">`)
  return `<div class="split"><div>${rules}${examples}${exampleFile}</div><div class="decision">${series}${key}${cheap}${strong}</div></div>`
}

function reviewLines(state: AppState): string {
  const current = state.current
  if (current === null) {
    return ""
  }
  return `${faded(current.before)}<p class="current">${escapeText(current.words)}</p>${noteLine(current.note)}${faded(current.after)}`
}

function reviewDecision(state: AppState): string {
  const proposal = state.proposal
  if (proposal !== null) {
    const siblings = proposal.siblings.map((line) => `<li>${escapeText(line)}</li>`).join("")
    const rule = proposal.rule === null ? "" : escapeText(proposal.rule)
    return [
      `<div class="decision" style="border-left:1.5px dashed #2a2420">`,
      `<ul class="siblings">${siblings}</ul>`,
      `<p class="rule">${rule}</p>`,
      `<button type="button">Save to series</button>`,
      `<button type="button">Save to base</button>`,
      `<button class="action" type="button" style="color:#e36b1e">Decline rule</button>`,
      `</div>`,
    ].join("")
  }
  const english = state.current === null ? "" : escapeText(state.current.english)
  return [
    `<div class="decision" style="border-left:1.5px dashed #2a2420">`,
    `<p class="english">${english}</p>`,
    `<button class="accept" type="button" style="color:#e36b1e">Accept</button>`,
    `</div>`,
  ].join("")
}

function noteLine(note: string | null): string {
  if (note === null) {
    return ""
  }
  return `<p class="note" style="color:#e36b1e">{note: ${escapeText(note)}}</p>`
}

function faded(text: string): string {
  return `<p class="faded">${escapeText(text)}</p>`
}

function frameSetting(): string {
  return [
    `<select name="frames">`,
    `<option value="none">none</option>`,
    `<option value="marked">only the marked lines</option>`,
    `<option value="every">every dialogue line</option>`,
    `</select>`,
  ].join("")
}

function field(label: string, control: string): string {
  return `<label><span>${label}</span>${control}</label>`
}

function selectControl<T extends string>(name: string, choices: readonly T[], selected: T): string {
  const options = choices
    .map((choice) => {
      const selectedAttr = choice === selected ? " selected" : ""
      return `<option value="${choice}"${selectedAttr}>${choice}</option>`
    })
    .join("")
  return `<select name="${name}">${options}</select>`
}

function escapeText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function escapeAttr(text: string): string {
  return escapeText(text).replaceAll('"', "&quot;")
}
