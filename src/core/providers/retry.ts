import type { Completer } from "../pipeline/run"
import { ProviderError, type ProviderErrorKind } from "./errors"

export const RETRY_DELAYS_MS: readonly number[] = [1000, 4000, 15000]

const RETRYABLE: ReadonlySet<ProviderErrorKind> = new Set<ProviderErrorKind>([
  "rate-limit",
  "server",
  "network",
])

export function withRetry(
  complete: Completer,
  sleep: (ms: number) => Promise<void>,
  onRetry: (delayMs: number, error: ProviderError) => void,
): Completer {
  return async (request) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await complete(request)
      } catch (error) {
        const delayMs = RETRY_DELAYS_MS[attempt]
        if (
          !(error instanceof ProviderError) ||
          !RETRYABLE.has(error.kind) ||
          delayMs === undefined
        ) {
          throw error
        }
        onRetry(delayMs, error)
        await sleep(delayMs)
      }
    }
  }
}
