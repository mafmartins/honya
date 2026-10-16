import { useState } from "react"
import type {
  PickedScript,
  PickedVideo,
  Preset,
  ProviderId,
  SetupApi,
  Variant,
} from "../shared/api"
import { ErrorContext } from "./action"
import { ApiContext } from "./api"
import { ErrorLine } from "./ErrorLine"
import { ProfilesScreen } from "./screens/ProfilesScreen"
import { StartScreen } from "./screens/StartScreen"

export type FrameSetting = "none" | "marked" | "every"

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

export function App({ api }: { api: SetupApi }): React.JSX.Element {
  const [screen, setScreen] = useState<"start" | "profiles">("start")
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
          {screen === "start" ? (
            <StartScreen
              session={session}
              onChange={change}
              onOpenProfiles={() => {
                setScreen("profiles")
              }}
            />
          ) : (
            <ProfilesScreen
              variant={session.variant}
              onVariantChange={(variant) => {
                change({ variant, seriesId: null })
              }}
              onBack={() => {
                setScreen("start")
              }}
            />
          )}
        </article>
      </ErrorContext.Provider>
    </ApiContext.Provider>
  )
}
