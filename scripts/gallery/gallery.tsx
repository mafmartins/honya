import { StrictMode, useEffect, useRef, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import type {
  ExportPreview,
  HonyaApi,
  LineView,
  SessionStats,
  SessionSummary,
  SessionView,
} from "../../src/shared/api"
import { ErrorContext } from "../../src/renderer/action"
import { ApiContext } from "../../src/renderer/api"
import { Menu } from "../../src/renderer/workspace/Menu"
import { ProfilePage } from "../../src/renderer/workspace/pages/ProfilePage"
import { ProjectsPage } from "../../src/renderer/workspace/pages/ProjectsPage"
import { SettingsPage } from "../../src/renderer/workspace/pages/SettingsPage"
import { StatsPage } from "../../src/renderer/workspace/pages/StatsPage"
import type { Route } from "../../src/renderer/workspace/route"
import { SessionPage } from "../../src/renderer/workspace/session/SessionPage"
import { Shell } from "../../src/renderer/workspace/Shell"
import { fakeApi, type FakeApi } from "../../tests/renderer/fakeApi"

// Every screen of the workspace with sample data, as 1440×900 windows, for design work
// (Figma import) and visual checks. Built by `npm run gallery` into dist/gallery/;
// never part of the app. ?screen=<key> shows one screen alone.

const noop = (): void => undefined

// Episode 2's opening, as the translator would see it halfway through.
const SCRIPT: readonly [number, string, string, string | null, "ai" | "manual" | null][] = [
  [1.2, "Tanjiro", "Nezuko, stay close to me.", "Nezuko, fica perto de mim.", "ai"],
  [3.4, "Tanjiro", "The mountain is colder at night.", "A montanha é mais fria à noite.", "ai"],
  [6.1, "Urokodaki", "Who are you?", "Quem és tu?", "ai"],
  [8.0, "Tanjiro", "My name is Tanjiro Kamado.", "Chamo-me Tanjiro Kamado.", "ai"],
  [10.6, "Tanjiro", "Giyu Tomioka sent me.", "Foi o Giyu Tomioka que me mandou.", "manual"],
  [13.2, "Urokodaki", "Why did you hesitate?", "Porque é que hesitaste?", "ai"],
  [15.9, "Urokodaki", "You're too kind for this.", "És demasiado bondoso para isto.", "ai"],
  [
    18.4,
    "Urokodaki",
    "A Demon Slayer must decide in an instant.",
    "Um Caçador de Demónios tem de decidir num instante.",
    "ai",
  ],
  [21.7, "Tanjiro", "I understand.", "Compreendo.", "ai"],
  [23.5, "Urokodaki", "Then follow me.", "Então segue-me.", "ai"],
  [26.0, "", "(wind howling)", null, null],
  [28.3, "Tanjiro", "He's so fast!", "Ele é tão rápido!", "ai"],
  [30.9, "Tanjiro", "Nezuko, hold on tight.", "Nezuko, segura-te bem.", "ai"],
  [33.2, "Urokodaki", "Take this mask.", "Leva esta máscara.", "ai"],
  [35.6, "Urokodaki", "It wards off evil.", "Afasta o mal.", "ai"],
  [38.1, "Tanjiro", "Thank you, sir!", "Obrigado, senhor!", "ai"],
  [40.4, "Urokodaki", "Don't thank me yet.", "Ainda não me agradeças.", "ai"],
  [42.9, "Urokodaki", "Training starts at dawn.", "O treino começa ao amanhecer.", "ai"],
  [45.2, "Tanjiro", "Big brother will protect you.", null, null],
  [47.6, "Sabito", "You're slow.", null, null],
  [49.8, "Sabito", "Cut the boulder and you pass.", null, null],
  [52.3, "Tanjiro", "A boulder? With a sword?", null, null],
  [54.7, "Makomo", "Don't give up, Tanjiro.", null, null],
  [57.0, "Makomo", "Your body already knows the way.", null, null],
  [59.4, "Tanjiro", "Total Concentration Breathing...", null, null],
  [62.0, "Tanjiro", "Water Breathing, First Form!", null, null],
  [64.8, "Sabito", "Not bad.", null, null],
  [67.1, "Makomo", "We'll be watching.", null, null],
]

// Which lines the AI flagged, and why.
const FLAGS: ReadonlyMap<number, string> = new Map([
  [7, "Too long for the cue: 51 characters, 49 max. Try “Um Caçador decide num instante.”"],
  [13, "“mask” here is the fox mask from episode 1 — check the glossary."],
  [16, "Tone: Urokodaki is curt with Tanjiro; “Ainda não” may read too soft."],
])

// The first `inPortuguese` lines play a script that came with them already translated.
function demoLines(translatedUpTo: number, inPortuguese = 0): LineView[] {
  return SCRIPT.map(([seconds, speaker, english, words, origin], index) => {
    const done = index < translatedUpTo ? words : null
    const missing = index < inPortuguese && words !== null
    return {
      index,
      start: Math.round(seconds * 1000),
      end: Math.round((seconds + 2.1) * 1000),
      speaker,
      english: missing ? "" : english,
      englishMissing: missing,
      words: done,
      origin: done === null ? null : missing ? "manual" : origin,
      flag: done === null || missing ? null : (FLAGS.get(index) ?? null),
      budget: Math.max(18, Math.round(english.length * 1.2)),
    }
  })
}

function demoStats(lines: readonly LineView[]): SessionStats {
  const count = (test: (line: LineView) => boolean): number => lines.filter(test).length
  return {
    lines: {
      ai: count((line) => line.words !== null && line.origin === "ai"),
      manual: count((line) => line.words !== null && line.origin === "manual"),
      untranslated: count((line) => line.words === null),
      total: lines.length,
    },
    flags: {
      open: count((line) => line.flag !== null),
      accepted: 2,
      edited: 3,
      retranslated: 1,
    },
    strongLines: 6,
    retranslatedLines: 1,
    cost: { usd: 0.0712, unpriced: [], input: 27965, output: 13299, requests: 14 },
    models: [
      { model: "claude-haiku-5-5", requests: 11, input: 21840, output: 10220, usd: 0.0391 },
      { model: "claude-sonnet-5-5", requests: 3, input: 6125, output: 3079, usd: 0.0321 },
    ],
    activeMs: 725000,
    framesGrabbed: 7,
  }
}

interface Demo {
  api: FakeApi
  projectId: string
  sessionId: string
  // A session with no script yet.
  emptyId: string
}

// The fake API with three projects, styles with rules, two saved keys and a session
// half translated. `translatedUpTo` lines of the script have Portuguese; `running`
// makes the AI busy on that session.
async function demo(
  options: {
    translatedUpTo?: number
    inPortuguese?: number
    running?: boolean
    setupDone?: boolean
  } = {},
): Promise<Demo> {
  const lines = demoLines(options.translatedUpTo ?? 18, options.inPortuguese)
  let sessionId = ""
  let projectId = ""
  const view = (): SessionView => ({
    id: sessionId,
    projectId,
    projectName: "Kimetsu no Yaiba",
    variant: "pt-pt",
    scriptName: "kimetsu-02.en.ass",
    videoName: null,
    provider: "claude",
    preset: "balanced",
    lines,
    needsStyles: null,
    stats: demoStats(lines),
    finished: false,
  })
  const summary = (): SessionSummary => ({
    id: sessionId,
    projectId,
    projectName: "Kimetsu no Yaiba",
    scriptName: "kimetsu-02.en.ass",
    translated: lines.filter((line) => line.words !== null).length,
    total: lines.length,
    openFlags: lines.filter((line) => line.flag !== null).length,
    updatedAt: "2026-10-17T18:40:00.000Z",
    finished: false,
  })
  const first = (): SessionSummary => ({
    id: "demo-done",
    projectId,
    projectName: "Kimetsu no Yaiba",
    scriptName: "kimetsu-01.en.ass",
    translated: 312,
    total: 312,
    openFlags: 0,
    updatedAt: "2026-10-15T21:10:00.000Z",
    finished: true,
  })
  const others: SessionSummary[] = [
    {
      id: "demo-frieren",
      projectId: "",
      projectName: "Sousou no Frieren",
      scriptName: "frieren-07.en.ass",
      translated: 288,
      total: 288,
      openFlags: 0,
      updatedAt: "2026-10-12T16:05:00.000Z",
      finished: true,
    },
  ]
  const preview: ExportPreview = {
    translated: lines.filter((line) => line.words !== null).length,
    english: lines.filter((line) => line.words === null).length,
    openFlags: lines.filter((line) => line.flag !== null).length,
    defaultPath: "/Users/you/Anime/Kimetsu/kimetsu-02.pt-pt.ass",
    suggestions: [
      { rule: { kind: "glossary", source: "Demon Slayer", pt: "Caçador de Demónios" }, lines: [7] },
      { rule: { kind: "prose", text: "Name the sender first: “Foi o X que…”." }, lines: [4] },
    ],
  }
  const own = (id: string): boolean => id === sessionId
  const base = fakeApi()
  const api: FakeApi = {
    ...base,
    openSession: (id) => (own(id) ? Promise.resolve(view()) : base.openSession(id)),
    sessionStats: (id) => (own(id) ? Promise.resolve(demoStats(lines)) : base.sessionStats(id)),
    exportPreview: (id) => (own(id) ? Promise.resolve(preview) : base.exportPreview(id)),
    pickExportPath: (path) => Promise.resolve(path),
    aiActive: () => Promise.resolve(options.running === true ? sessionId : null),
    recentSessions: () => Promise.resolve([summary(), first(), ...others]),
    projectSessions: (id) =>
      id === projectId ? Promise.resolve([summary(), first()]) : base.projectSessions(id),
    launchInfo: async () => ({ ...(await base.launchInfo()), continueSession: summary() }),
  }
  if (options.setupDone !== false) {
    await api.setKey("claude", "x")
    await api.setKey("gemini", "x")
    await api.updateSettings({ setupDone: true })
  }
  const kimetsu = await api.createProject("Kimetsu no Yaiba", "pt-pt")
  await api.createProject("Sousou no Frieren", "pt-pt")
  await api.createProject("Dandadan", "pt-br")
  projectId = kimetsu.id
  sessionId = await api.newSession(kimetsu.id)
  const emptyId = await api.newSession(kimetsu.id)
  await api.saveRules({ kind: "project", id: kimetsu.id }, [
    { kind: "glossary", source: "Hashira", pt: "Pilar" },
    { kind: "glossary", source: "Demon Slayer Corps", pt: "Corpo de Caçadores de Demónios" },
    { kind: "prose", text: "Keep -san and -sama." },
    { kind: "prose", text: "Tanjiro calls Nezuko “mana”, never “irmã”, when he talks to her." },
  ])
  await api.saveRules({ kind: "style", variant: "pt-pt" }, [
    { kind: "prose", text: "Use tu between friends and siblings." },
    { kind: "prose", text: "Avoid the gerund: “estou a fazer”, not “estou fazendo”." },
    { kind: "glossary", source: "Okay", pt: "Está bem" },
  ])
  await api.addReference({ kind: "project", id: kimetsu.id }, "kimetsu-01.pt-pt.ass", "", [])
  await api.addReference({ kind: "style", variant: "pt-pt" }, "frieren-03.pt-pt.ass", "", [])
  return { api, projectId, sessionId, emptyId }
}

// Waits for the page to show `selector` inside `root`, then returns it.
async function find(root: HTMLElement, selector: string): Promise<HTMLElement> {
  for (let tries = 0; tries < 100; tries += 1) {
    const found = root.querySelector<HTMLElement>(selector)
    if (found !== null) {
      return found
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`gallery: ${selector} never showed`)
}

async function findButton(root: HTMLElement, text: string): Promise<HTMLButtonElement> {
  for (let tries = 0; tries < 100; tries += 1) {
    const found = [...root.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === text,
    )
    if (found !== undefined) {
      return found
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`gallery: no ${text} button`)
}

// Types into a React-controlled field: setRangeText changes the value without React's
// own setter, so the input event reaches onChange.
function type(field: HTMLInputElement, value: string): void {
  field.setRangeText(value, 0, field.value.length, "end")
  field.dispatchEvent(new Event("input", { bubbles: true }))
}

interface FrameSpec {
  key: string
  title: string
  node: ReactNode
  // Clicks and typing after the first render, to reach the state shown.
  steps?: (root: HTMLElement) => Promise<void>
}

function Frame({ spec }: { spec: FrameSpec }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  useEffect(() => {
    const element = root.current
    if (element === null || spec.steps === undefined || started.current) {
      return
    }
    started.current = true
    spec.steps(element).catch((error: unknown) => {
      console.error(error)
    })
  }, [spec])
  return (
    <section className="gallery-frame" id={spec.key}>
      <h2 className="gallery-title">{spec.title}</h2>
      <div ref={root} className="gallery-window">
        {spec.node}
      </div>
    </section>
  )
}

// The shell's layout with a fixed page, for screens the launch window would cover.
function Window({
  api,
  route,
  projectId,
  sessionId,
  children,
}: {
  api: HonyaApi
  route: Route
  projectId: string | null
  sessionId: string | null
  children: ReactNode
}): React.JSX.Element {
  return (
    <ApiContext.Provider value={api}>
      <ErrorContext.Provider value={noop}>
        <div className="shell">
          <Menu
            route={route}
            projectId={projectId}
            sessionId={sessionId}
            onNavigate={noop}
            onOpenSession={noop}
            onOpenProject={noop}
          />
          <main className="shell-main">{children}</main>
        </div>
      </ErrorContext.Provider>
    </ApiContext.Provider>
  )
}

const ACTIONS = {
  onOpenSession: noop,
  onNewSession: noop,
  onDeleted: noop,
  onChanged: noop,
}

async function frames(): Promise<FrameSpec[]> {
  const fresh = await demo({ setupDone: false })
  const fresh2 = await demo({ setupDone: false })
  const launch = await demo()
  const main = await demo()
  const running = await demo({ translatedUpTo: 12, running: true })
  const partly = await demo({ translatedUpTo: 10, inPortuguese: 10 })
  // A script whose styles Honya couldn't sort out alone.
  const styles: HonyaApi = {
    ...main.api,
    openSession: async (id) => {
      const view = await main.api.openSession(id)
      return id === main.emptyId
        ? {
            ...view,
            scriptName: "kimetsu-03.en.ass",
            needsStyles: [
              { name: "Default", guess: "dialogue" },
              { name: "Italics", guess: "dialogue" },
              { name: "Sign-Dialogue", guess: "ambiguous" },
              { name: "OP-Romaji", guess: "skip" },
            ],
          }
        : view
    },
  }
  const sessionWindow = (from: Demo, node: ReactNode): ReactNode => (
    <Window
      api={from.api}
      route={{ page: "session", sessionId: from.sessionId }}
      projectId={from.projectId}
      sessionId={from.sessionId}
    >
      {node}
    </Window>
  )
  const page = (route: Route, node: ReactNode): ReactNode => (
    <Window api={main.api} route={route} projectId={main.projectId} sessionId={main.sessionId}>
      {node}
    </Window>
  )
  return [
    {
      key: "setup-1",
      title: "Setup · step 1, key tested",
      node: <Shell api={fresh.api} />,
      steps: async (root) => {
        const key = await find(root, ".dialog input[type=password]")
        if (key instanceof HTMLInputElement) {
          type(key, "sk-ant-api03-••••••••••••")
        }
        ;(await findButton(root, "Test the key")).click()
      },
    },
    {
      key: "setup-2",
      title: "Setup · step 2, defaults",
      node: <Shell api={fresh2.api} />,
      steps: async (root) => {
        const key = await find(root, ".dialog input[type=password]")
        if (key instanceof HTMLInputElement) {
          type(key, "sk-ant-api03-••••••••••••")
        }
        ;(await findButton(root, "Test the key")).click()
        await find(root, ".test-ok")
        ;(await findButton(root, "Continue")).click()
      },
    },
    {
      key: "launch",
      title: "Launch window",
      node: <Shell api={launch.api} />,
    },
    {
      key: "session-empty",
      title: "Session · no script yet",
      node: (
        <Window
          api={main.api}
          route={{ page: "session", sessionId: main.emptyId }}
          projectId={main.projectId}
          sessionId={main.emptyId}
        >
          <SessionPage sessionId={main.emptyId} />
        </Window>
      ),
    },
    {
      key: "session-styles",
      title: "Session · which styles are dialogue",
      node: (
        <Window
          api={styles}
          route={{ page: "session", sessionId: main.emptyId }}
          projectId={main.projectId}
          sessionId={main.emptyId}
        >
          <SessionPage sessionId={main.emptyId} />
        </Window>
      ),
    },
    {
      key: "session",
      title: "Session · a flagged line selected",
      node: sessionWindow(main, <SessionPage sessionId={main.sessionId} />),
      steps: async (root) => {
        const flag = await find(root, ".line-row .line-flag")
        flag.closest<HTMLElement>(".line-row")?.click()
      },
    },
    {
      key: "session-in-portuguese",
      title: "Session · lines the file had in Portuguese",
      node: sessionWindow(partly, <SessionPage sessionId={partly.sessionId} />),
      steps: async (root) => {
        const row = await find(root, ".line-row")
        row.click()
      },
    },
    {
      key: "session-running",
      title: "Session · AI running",
      node: sessionWindow(running, <SessionPage sessionId={running.sessionId} />),
      steps: async (root) => {
        await find(root, ".session-run")
        running.api.emitWorkspace({
          type: "run-progress",
          sessionId: running.sessionId,
          index: 1,
          total: 2,
          linesDone: demoLines(12).filter((line) => line.words !== null).length,
          lineTotal: SCRIPT.length,
          activity: "Translating batch 1 of 2",
          indexes: Array.from({ length: 10 }, (_, i) => i + 12),
        })
      },
    },
    {
      key: "export",
      title: "Export dialog",
      node: sessionWindow(main, <SessionPage sessionId={main.sessionId} />),
      steps: async (root) => {
        ;(await findButton(root, "Export…")).click()
      },
    },
    {
      key: "project",
      title: "Project page",
      node: page(
        { page: "project", id: main.projectId },
        <ProfilePage owner={{ kind: "project", id: main.projectId }} {...ACTIONS} />,
      ),
    },
    {
      key: "style",
      title: "Language style page",
      node: page(
        { page: "style", variant: "pt-pt" },
        <ProfilePage owner={{ kind: "style", variant: "pt-pt" }} {...ACTIONS} />,
      ),
    },
    {
      key: "settings",
      title: "Settings",
      node: page({ page: "settings" }, <SettingsPage />),
    },
    {
      key: "stats",
      title: "Session stats",
      node: page({ page: "stats" }, <StatsPage sessionId={main.sessionId} />),
    },
    {
      key: "projects",
      title: "Projects",
      node: page({ page: "projects" }, <ProjectsPage onOpen={noop} />),
    },
  ]
}

async function show(): Promise<void> {
  const all = await frames()
  // ?screen=session, ?screen=export, … shows one screen alone, at the window's size.
  // (The hash is left to tools such as Figma's capture.)
  const wanted = new URLSearchParams(window.location.search).get("screen") ?? ""
  const only = all.some((spec) => spec.key === wanted) ? wanted : ""
  const shown = all.filter((spec) => only === "" || spec.key === only)
  const root = document.getElementById("gallery")
  if (root === null) {
    return
  }
  createRoot(root).render(
    <StrictMode>
      <div className={only === "" ? "gallery" : "gallery single"}>
        {shown.map((spec) => (
          <Frame key={spec.key} spec={spec} />
        ))}
      </div>
    </StrictMode>,
  )
}

void show()
