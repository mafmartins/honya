import type { ProviderId } from "../pipeline/types"

export type ProviderErrorKind = "auth" | "rate-limit" | "server" | "network" | "request"

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  readonly provider: ProviderId
  readonly status: number | null

  constructor(
    kind: ProviderErrorKind,
    provider: ProviderId,
    message: string,
    status: number | null,
  ) {
    super(message)
    this.name = "ProviderError"
    this.kind = kind
    this.provider = provider
    this.status = status
  }
}

export function providerName(provider: ProviderId): string {
  switch (provider) {
    case "claude":
      return "Claude"
    case "gpt":
      return "OpenAI"
    case "gemini":
      return "Gemini"
    case "mistral":
      return "Mistral"
  }
}

export function providerError(
  provider: ProviderId,
  status: number | null,
  body: string | null,
): ProviderError {
  const name = providerName(provider)
  if (status === null) {
    return new ProviderError(
      "network",
      provider,
      `Couldn't reach ${name}. Check your connection.`,
      null,
    )
  }
  if (status === 401 || status === 403) {
    return new ProviderError(
      "auth",
      provider,
      `${name} rejected the key. Replace it on Profiles.`,
      status,
    )
  }
  if (status === 429) {
    return new ProviderError(
      "rate-limit",
      provider,
      `${name} is rate limiting requests. Try again in a few minutes.`,
      status,
    )
  }
  if (status >= 500) {
    return new ProviderError(
      "server",
      provider,
      `${name} had a server error (${String(status)}). Try again later.`,
      status,
    )
  }
  const detail = providerDetail(body) ?? `HTTP ${String(status)}`
  return new ProviderError("request", provider, `${name} refused the request: ${detail}`, status)
}

function providerDetail(body: string | null): string | undefined {
  if (body === null) {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) {
    return undefined
  }
  const error = parsed.error
  if (isRecord(error) && typeof error.message === "string") {
    return error.message
  }
  if (typeof parsed.message === "string") {
    return parsed.message
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
