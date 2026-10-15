export interface LineSignals {
  id: string
  cheap: "clean" | "doubt" | "hard-call" | "mild"
  briefHard: boolean
  unfit: boolean
}

export type Preset = "save" | "balanced" | "best"
