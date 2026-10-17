import type { Variant } from "../../shared/api"

// The page the main area shows.
export type Route =
  | { page: "session"; sessionId: string | null }
  | { page: "stats" }
  | { page: "projects" }
  | { page: "project"; id: string }
  | { page: "style"; variant: Variant }
  | { page: "settings" }

export function styleName(variant: Variant): string {
  return variant === "pt-pt" ? "PT-PT style" : "PT-BR style"
}
