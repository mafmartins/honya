import { createContext, useContext } from "react"
import type { HonyaApi } from "../shared/api"

export const ApiContext = createContext<HonyaApi | null>(null)

export function useApi(): HonyaApi {
  const api = useContext(ApiContext)
  if (api === null) {
    throw new Error("ApiContext is missing.")
  }
  return api
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong."
}
