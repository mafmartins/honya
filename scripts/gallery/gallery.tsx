import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import type { HonyaApi, ReviewLine } from "../../src/shared/api"
import { ErrorContext } from "../../src/renderer/action"
import { ApiContext } from "../../src/renderer/api"
import type { Session } from "../../src/renderer/App"
import { ErrorLine } from "../../src/renderer/ErrorLine"
import { ProfilesScreen } from "../../src/renderer/screens/ProfilesScreen"
import { StartScreen } from "../../src/renderer/screens/StartScreen"
import { DonePanel } from "../../src/renderer/translate/DonePanel"
import { HaltPanel } from "../../src/renderer/translate/HaltPanel"
import { LivePanel } from "../../src/renderer/translate/LivePanel"
import { ProposalPanel } from "../../src/renderer/translate/ProposalPanel"
import { ReviewPanel } from "../../src/renderer/translate/ReviewPanel"
import { StylesStep } from "../../src/renderer/translate/StylesStep"
import { fakeApi } from "../../tests/renderer/fakeApi"

// Every screen and state of the app with sample data, for design work (Figma import).
// Built by `npm run gallery` into dist/gallery/; never part of the app.

const noop = (): void => undefined

const REVIEW_LINES: ReviewLine[] = [
  ["Before the demons show up.", "Antes que os demónios apareçam.", null],
  ["Thanks for the meal!", "Obrigado pela refeição!", "linha longa para o cue"],
  ["Hey, Uncle Saburo,", "Olhe, Tio Saburo,", null],
  ["And my sister!", "E a minha irmã!", "forma brasileira"],
].map(([english, words, note], index) => ({
  eventIndex: 95 + index,
  english: english ?? "",
  words: words ?? "",
  note: note ?? null,
  edited: false,
  flagged: note !== null,
  accepted: false,
}))

async function demoApi(withUnfinished: boolean): Promise<HonyaApi> {
  const api = fakeApi({
    latestUnfinished: () =>
      Promise.resolve(
        withUnfinished
          ? {
              id: "s1",
              scriptName: "subs.ass",
              seriesName: "Kimetsu no Yaiba",
              phase: "stopped",
              completedBatches: 5,
              totalBatches: 13,
              openFlags: 0,
            }
          : null,
      ),
    loadReview: () =>
      Promise.resolve({
        sessionId: "s1",
        scriptName: "subs.ass",
        seriesName: "Kimetsu no Yaiba",
        variant: "pt-pt",
        preset: "save",
        outputPath: "/Users/you/Downloads/subs.pt-pt.ass",
        lines: REVIEW_LINES,
        openFlags: 2,
      }),
  })
  await api.setKey("claude", "x")
  await api.setKey("gemini", "x")
  const series = await api.createSeries("pt-pt", "Kimetsu no Yaiba")
  await api.createSeries("pt-pt", "Sousou no Frieren")
  await api.saveSeriesRules("pt-pt", series.id, [
    { kind: "glossary", source: "Hashira", pt: "Pilar" },
    { kind: "prose", text: "Keep -san and -sama." },
  ])
  const { base } = await api.loadBase("pt-pt")
  await api.saveBase({
    ...base,
    rules: [{ kind: "prose", text: "Use tu between friends and siblings." }],
    examples: [{ name: "kimetsu-01.pt-pt.ass", text: "" }],
  })
  return api
}

function Frame(props: {
  id: string
  title: string
  api: HonyaApi
  error?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="gallery-frame" id={props.id}>
      <h2 className="gallery-title">{props.title}</h2>
      <ApiContext.Provider value={props.api}>
        <ErrorContext.Provider value={noop}>
          <article className="card">
            <ErrorLine message={props.error ?? null} />
            {props.children}
          </article>
        </ErrorContext.Provider>
      </ApiContext.Provider>
    </section>
  )
}

function Job({ output = true }: { output?: boolean }): React.JSX.Element {
  return (
    <>
      <header className="card-header">
        <button type="button" className="link">
          Back
        </button>
        <p>Translate</p>
      </header>
      <div className="job">
        <p>subs.ass · Kimetsu no Yaiba · pt-pt · gemini · save</p>
        {output ? <p>Output: /Users/you/Downloads/subs.pt-pt.ass</p> : null}
      </div>
    </>
  )
}

const EMPTY_SESSION: Session = {
  script: null,
  variant: "pt-pt",
  seriesId: null,
  provider: "gemini",
  preset: "save",
  video: null,
  frameSetting: "none",
}

async function main(): Promise<void> {
  const api = await demoApi(false)
  const resumable = await demoApi(true)
  const seriesId = (await api.listSeries("pt-pt")).series[0]?.id ?? null
  const ready: Session = {
    ...EMPTY_SESSION,
    script: { path: "/Users/you/Downloads/subs.ass", name: "subs.ass", text: "" },
    seriesId,
    video: { path: "/Users/you/Videos/kimetsu-02.mkv", name: "kimetsu-02.mkv" },
    frameSetting: "marked",
  }
  const frames: React.JSX.Element[] = [
    <Frame key="start" id="start" title="Start · empty" api={api}>
      <StartScreen
        session={EMPTY_SESSION}
        onChange={noop}
        onOpenProfiles={noop}
        onTranslate={noop}
      />
    </Frame>,
    <Frame key="start-ready" id="start-ready" title="Start · ready to translate" api={api}>
      <StartScreen session={ready} onChange={noop} onOpenProfiles={noop} onTranslate={noop} />
    </Frame>,
    <Frame key="start-resume" id="start-resume" title="Start · unfinished run" api={resumable}>
      <StartScreen
        session={EMPTY_SESSION}
        onChange={noop}
        onOpenProfiles={noop}
        onTranslate={noop}
      />
    </Frame>,
    <Frame
      key="start-error"
      id="start-error"
      title="Start · error line"
      api={api}
      error="Gemini rejected the key. Replace it on Profiles."
    >
      <StartScreen session={ready} onChange={noop} onOpenProfiles={noop} onTranslate={noop} />
    </Frame>,
    <Frame key="profiles" id="profiles" title="Profiles" api={api}>
      <ProfilesScreen variant="pt-pt" onVariantChange={noop} onBack={noop} />
    </Frame>,
    <Frame key="styles" id="styles" title="Translate · choose dialogue styles" api={api}>
      <Job />
      <StylesStep
        styles={[
          { name: "Default", guess: "dialogue" },
          { name: "Italics", guess: "dialogue" },
          { name: "Sign-Dialogue", guess: "ambiguous" },
          { name: "OP-Romaji", guess: "skip" },
        ]}
        onConfirm={noop}
        onBack={noop}
      />
    </Frame>,
    <Frame key="live" id="live" title="Translate · running" api={api}>
      <Job />
      <LivePanel
        progress={{ index: 6, total: 13, linesDone: 150, lineTotal: 304 }}
        waiting="Starting…"
        activity="Asking the strong model about 3 lines"
        lines={[
          { eventIndex: 140, english: "Come here!", words: "Anda cá!", note: null },
          { eventIndex: 141, english: "Damn it!", words: "Raios!", note: null },
          {
            eventIndex: 142,
            english: "He misses Dad a lot\\Nafter he passed away.",
            words: "Ele sente muito a falta do pai\\Ndesde que ele faleceu.",
            note: "linha longa para o cue",
          },
          { eventIndex: 143, english: "Big brother!", words: "Mano!", note: null },
        ]}
        stopping={false}
        onStop={noop}
      />
    </Frame>,
    <Frame key="stopped" id="stopped" title="Translate · stopped" api={api}>
      <Job output={false} />
      <HaltPanel kind="stopped" onResume={noop} onBack={noop} />
    </Frame>,
    <Frame key="review" id="review" title="Translate · review flags" api={api}>
      <Job />
      <ReviewPanel sessionId="s1" onFinish={noop} />
    </Frame>,
    <Frame key="proposal" id="proposal" title="Translate · rule offer after an edit" api={api}>
      <Job />
      <ProposalPanel
        proposal={{
          siblings: [{ eventIndex: 98, words: "E a minha irmã também!" }],
          rule: { kind: "glossary", source: "Hashira", pt: "Pilar" },
        }}
        lines={REVIEW_LINES}
        busy={false}
        onConfirm={noop}
        onCancel={noop}
      />
    </Frame>,
    <Frame key="done" id="done" title="Translate · done" api={api}>
      <Job />
      <DonePanel result={await api.finishTranslation("s1")} onReveal={noop} onAnother={noop} />
    </Frame>,
  ]
  // #start, #review, … shows one screen alone, for importing screens one at a time.
  const only = window.location.hash.slice(1)
  const shown = frames.filter((frame) => only === "" || frame.key === only)
  const root = document.getElementById("gallery")
  if (root === null) {
    return
  }
  createRoot(root).render(
    <StrictMode>
      <div className={only === "" ? "gallery" : "gallery single"}>{shown}</div>
    </StrictMode>,
  )
}

void main()
