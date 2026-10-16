import { createContext, useContext } from "react"
import type { SetupApi } from "../shared/api"

export const ApiContext = createContext<SetupApi | null>(null)

export function useApi(): SetupApi {
  const api = useContext(ApiContext)
  if (api === null) {
    throw new Error("ApiContext is missing.")
  }
  return api
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong."
}
