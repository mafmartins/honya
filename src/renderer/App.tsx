import { useState } from "react"
import type {
  PickedScript,
  PickedVideo,
  Preset,
  HonyaApi,
  ProviderId,
  TranslateRequest,
  Variant,
} from "../shared/api"
import { ErrorContext } from "./action"
import { ApiContext } from "./api"
import { ErrorLine } from "./ErrorLine"
import { ProfilesScreen } from "./screens/ProfilesScreen"
import { StartScreen } from "./screens/StartScreen"
import { TranslateScreen } from "./screens/TranslateScreen"

export type FrameSetting = "none" | "marked" | "every"

export type TranslateTarget =
  | {
      kind: "new"
      request: Omit<TranslateRequest, "dialogueStyles">
      scriptName: string
      seriesName: string
    }
  | { kind: "resume"; id: string }

export interface Session {
  script: PickedScript | null
  variant: Variant
  seriesId: string | null
  provider: ProviderId
  preset: Preset
  video: PickedVideo | null
  frameSetting: FrameSetting
}

const FIRST_SESSION: Session = {
  script: null,
  variant: "pt-pt",
  seriesId: null,
  provider: "claude",
  preset: "save",
  video: null,
  frameSetting: "none",
}

export function App({ api }: { api: HonyaApi }): React.JSX.Element {
  const [screen, setScreen] = useState<
    { name: "start" } | { name: "profiles" } | { name: "translate"; target: TranslateTarget }
  >({ name: "start" })
  const [session, setSession] = useState<Session>(FIRST_SESSION)
  const [error, setError] = useState<string | null>(null)
  const change = (patch: Partial<Session>): void => {
    setSession((current) => ({ ...current, ...patch }))
  }
  return (
    <ApiContext.Provider value={api}>
      <ErrorContext.Provider value={setError}>
        <article className="card">
          <ErrorLine message={error} />
          {screen.name === "start" ? (
            <StartScreen
              session={session}
              onChange={change}
              onOpenProfiles={() => {
                setScreen({ name: "profiles" })
              }}
              onTranslate={(target) => {
                setScreen({ name: "translate", target })
              }}
            />
          ) : screen.name === "translate" ? (
            <TranslateScreen
              target={screen.target}
              onBack={() => {
                setScreen({ name: "start" })
              }}
              onAnother={() => {
                setSession((current) => ({
                  ...current,
                  script: null,
                  video: null,
                  frameSetting: "none",
                }))
                setScreen({ name: "start" })
              }}
            />
          ) : (
            <ProfilesScreen
              variant={session.variant}
              onVariantChange={(variant) => {
                change({ variant, seriesId: null })
              }}
              onBack={() => {
                setScreen({ name: "start" })
              }}
            />
          )}
        </article>
      </ErrorContext.Provider>
    </ApiContext.Provider>
  )
}
