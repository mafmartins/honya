import type { ProviderId } from "../pipeline/types"
import { completeText } from "./complete"
import { ProviderError, providerName } from "./errors"

// One tiny request to prove the key works. A refused answer still counts: the
// provider replied, so it accepted the key.
export async function testKey(
  provider: ProviderId,
  apiKey: string,
  fetchImpl: typeof fetch,
  model: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await completeText({
      provider,
      model,
      apiKey,
      prompt: "Reply with OK.",
      fetch: fetchImpl,
      effort: "low",
      timeoutMs: 20000,
    })
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ProviderError
          ? error.message
          : `Couldn't reach ${providerName(provider)}. Check your connection.`,
    }
  }
}
