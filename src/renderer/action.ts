import { createContext, useCallback, useContext } from "react"
import { errorMessage } from "./api"

export const ErrorContext = createContext<(message: string | null) => void>(() => undefined)

export function useReport(): (message: string | null) => void {
  return useContext(ErrorContext)
}

export function useAction(): (task: () => Promise<void>) => void {
  const report = useContext(ErrorContext)
  return useCallback(
    (task: () => Promise<void>) => {
      void task().then(
        () => {
          report(null)
        },
        (error: unknown) => {
          report(errorMessage(error))
        },
      )
    },
    [report],
  )
}
