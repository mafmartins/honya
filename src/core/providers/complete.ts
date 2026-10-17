import type { ProviderId, Usage } from "../pipeline/types"
import type { ReplySchema } from "../pipeline/schemas"
import { ProviderError, providerError, providerName } from "./errors"

export type Effort = "low" | "medium"

export interface ChatInput {
  provider: ProviderId
  model: string
  apiKey: string
  // Instructions that stay the same across a run's requests, sent as the system prompt
  // so providers that cache prompt prefixes can reuse it.
  system?: string
  prompt: string
  images?: { id: string; png: Uint8Array }[]
  // Constrains the reply to this JSON schema (each provider's structured output mode).
  schema?: ReplySchema
  fetch: typeof fetch
  // How much the model may think before answering; the provider default when absent.
  effort?: Effort
  // How long to wait for a reply before giving up; 3 minutes unless a test shortens it.
  timeoutMs?: number
}

export type { Usage }

const REQUEST_TIMEOUT_MS = 3 * 60 * 1000

// An unusable reply says why, so the cause can be logged; `excerpt` is the start of
// the reply text when there was some.
export type Unusable = { refused: true; reason: string; excerpt?: string; usage: Usage | null }
export type JsonReply = { value: unknown; usage: Usage | null } | Unusable

type ChatImage = { id: string; png: Uint8Array }
type HeaderMap = Record<string, string>

interface TextPart {
  type: "text"
  text: string
}

interface ClaudeSystemPart extends TextPart {
  cache_control: { type: "ephemeral" }
}

interface ClaudeImagePart {
  type: "image"
  source: {
    type: "base64"
    media_type: "image/png"
    data: string
  }
}

interface OpenAiImagePart {
  type: "image_url"
  image_url: { url: string }
}

interface MistralImagePart {
  type: "image_url"
  image_url: string
}

interface GeminiTextPart {
  text: string
}

interface GeminiImagePart {
  inlineData: {
    mimeType: "image/png"
    data: string
  }
}

interface JsonSchemaFormat {
  type: "json_schema"
  json_schema: { name: string; strict: true; schema: Readonly<Record<string, unknown>> }
}

interface ClaudeBody {
  model: string
  max_tokens: number
  system?: ClaudeSystemPart[]
  output_config?: {
    effort?: Effort
    format?: { type: "json_schema"; schema: Readonly<Record<string, unknown>> }
  }
  messages: { role: "user"; content: string | (TextPart | ClaudeImagePart)[] }[]
}

type ChatMessage<Image> =
  { role: "system"; content: string } | { role: "user"; content: string | (TextPart | Image)[] }

interface OpenAiBody {
  model: string
  reasoning_effort?: Effort
  response_format?: JsonSchemaFormat
  messages: ChatMessage<OpenAiImagePart>[]
}

interface MistralBody {
  model: string
  reasoning_effort?: "none"
  response_format?: JsonSchemaFormat
  messages: ChatMessage<MistralImagePart>[]
}

interface GeminiBody {
  systemInstruction?: { parts: GeminiTextPart[] }
  generationConfig?: {
    thinkingConfig?: { thinkingLevel: Effort }
    responseMimeType?: "application/json"
    responseJsonSchema?: Readonly<Record<string, unknown>>
  }
  contents: { role: "user"; parts: (GeminiTextPart | GeminiImagePart)[] }[]
}

type ProviderBody = ClaudeBody | OpenAiBody | MistralBody | GeminiBody

interface ProviderRequest {
  url: string
  headers: HeaderMap
  body: ProviderBody
}

const CLAUDE_MAX_TOKENS = 16000

export async function completeJson(input: ChatInput): Promise<JsonReply> {
  const body = await send(input, buildRequest(input))
  return readJsonBody(body)
}

export async function completeText(
  input: ChatInput,
): Promise<{ text: string } | { refused: true }> {
  const body = await send(input, buildRequest(input))
  const parsed = parseJson(body)
  if (!isRecord(parsed)) {
    return { refused: true }
  }
  const text = assistantText(parsed)
  if (text === undefined) {
    return { refused: true }
  }
  return { text }
}

async function send(input: ChatInput, request: ProviderRequest): Promise<string> {
  let response: Response
  let text: string
  const timeout = AbortSignal.timeout(input.timeoutMs ?? REQUEST_TIMEOUT_MS)
  try {
    response = await input.fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: timeout,
    })
    text = await response.text()
  } catch {
    if (timeout.aborted) {
      throw new ProviderError(
        "server",
        input.provider,
        `${providerName(input.provider)} didn't answer within 3 minutes.`,
        null,
      )
    }
    throw providerError(input.provider, null, null)
  }
  if (response.status !== 200) {
    throw providerError(input.provider, response.status, text)
  }
  return text
}

function buildRequest(input: ChatInput): ProviderRequest {
  switch (input.provider) {
    case "claude":
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: claudeHeaders(input.apiKey),
        body: claudeBody(input),
      }
    case "gpt":
      return {
        url: "https://api.openai.com/v1/chat/completions",
        headers: bearerHeaders(input.apiKey),
        body: openAiBody(input),
      }
    case "gemini":
      return {
        url: geminiUrl(input.model, input.apiKey),
        headers: { "Content-Type": "application/json" },
        body: geminiBody(input),
      }
    case "mistral":
      return {
        url: "https://api.mistral.ai/v1/chat/completions",
        headers: bearerHeaders(input.apiKey),
        body: mistralBody(input),
      }
  }
}

function claudeHeaders(apiKey: string): HeaderMap {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  }
}

function bearerHeaders(apiKey: string): HeaderMap {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
}

function geminiUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
}

function claudeBody(input: ChatInput): ClaudeBody {
  const body: ClaudeBody = {
    model: input.model,
    max_tokens: CLAUDE_MAX_TOKENS,
    messages: [{ role: "user", content: claudeContent(input.prompt, input.images ?? []) }],
  }
  if (input.system !== undefined) {
    body.system = [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }]
  }
  if (input.effort !== undefined || input.schema !== undefined) {
    body.output_config = {}
    if (input.effort !== undefined) {
      body.output_config.effort = input.effort
    }
    if (input.schema !== undefined) {
      body.output_config.format = { type: "json_schema", schema: input.schema.schema }
    }
  }
  return body
}

function openAiBody(input: ChatInput): OpenAiBody {
  const messages: ChatMessage<OpenAiImagePart>[] = []
  if (input.system !== undefined) {
    messages.push({ role: "system", content: input.system })
  }
  messages.push({ role: "user", content: openAiContent(input.prompt, input.images ?? []) })
  const body: OpenAiBody = { model: input.model, messages }
  if (input.effort !== undefined) {
    body.reasoning_effort = input.effort
  }
  if (input.schema !== undefined) {
    body.response_format = jsonSchemaFormat(input.schema)
  }
  return body
}

function mistralBody(input: ChatInput): MistralBody {
  const messages: ChatMessage<MistralImagePart>[] = []
  if (input.system !== undefined) {
    messages.push({ role: "system", content: input.system })
  }
  messages.push({ role: "user", content: mistralContent(input.prompt, input.images ?? []) })
  const body: MistralBody = { model: input.model, messages }
  // Mistral's models either reason or don't; "low" turns it off, anything else leaves
  // the model's default.
  if (input.effort === "low") {
    body.reasoning_effort = "none"
  }
  if (input.schema !== undefined) {
    body.response_format = jsonSchemaFormat(input.schema)
  }
  return body
}

function geminiBody(input: ChatInput): GeminiBody {
  const body: GeminiBody = {
    contents: [{ role: "user", parts: geminiParts(input.prompt, input.images ?? []) }],
  }
  if (input.system !== undefined) {
    body.systemInstruction = { parts: [{ text: input.system }] }
  }
  if (input.effort !== undefined || input.schema !== undefined) {
    body.generationConfig = {}
    if (input.effort !== undefined) {
      body.generationConfig.thinkingConfig = { thinkingLevel: input.effort }
    }
    if (input.schema !== undefined) {
      body.generationConfig.responseMimeType = "application/json"
      body.generationConfig.responseJsonSchema = input.schema.schema
    }
  }
  return body
}

function jsonSchemaFormat(schema: ReplySchema): JsonSchemaFormat {
  return {
    type: "json_schema",
    json_schema: { name: schema.name, strict: true, schema: schema.schema },
  }
}

function claudeContent(
  text: string,
  images: readonly ChatImage[],
): string | (TextPart | ClaudeImagePart)[] {
  if (images.length === 0) {
    return text
  }
  const parts: (TextPart | ClaudeImagePart)[] = [{ type: "text", text }]
  for (const image of images) {
    parts.push({ type: "text", text: frameLabel(image.id) })
    parts.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: pngBase64(image.png) },
    })
  }
  return parts
}

function openAiContent(
  text: string,
  images: readonly ChatImage[],
): string | (TextPart | OpenAiImagePart)[] {
  if (images.length === 0) {
    return text
  }
  const parts: (TextPart | OpenAiImagePart)[] = [{ type: "text", text }]
  for (const image of images) {
    parts.push({ type: "text", text: frameLabel(image.id) })
    parts.push({ type: "image_url", image_url: { url: pngDataUrl(image.png) } })
  }
  return parts
}

function mistralContent(
  text: string,
  images: readonly ChatImage[],
): string | (TextPart | MistralImagePart)[] {
  if (images.length === 0) {
    return text
  }
  const parts: (TextPart | MistralImagePart)[] = [{ type: "text", text }]
  for (const image of images) {
    parts.push({ type: "text", text: frameLabel(image.id) })
    parts.push({ type: "image_url", image_url: pngDataUrl(image.png) })
  }
  return parts
}

function geminiParts(
  text: string,
  images: readonly ChatImage[],
): (GeminiTextPart | GeminiImagePart)[] {
  const parts: (GeminiTextPart | GeminiImagePart)[] = [{ text }]
  for (const image of images) {
    parts.push({ text: frameLabel(image.id) })
    parts.push({ inlineData: { mimeType: "image/png", data: pngBase64(image.png) } })
  }
  return parts
}

function frameLabel(id: string): string {
  return `Frame for line [${id}]:`
}

function pngBase64(png: Uint8Array): string {
  return Buffer.from(png).toString("base64")
}

function pngDataUrl(png: Uint8Array): string {
  return `data:image/png;base64,${pngBase64(png)}`
}

function readJsonBody(text: string): JsonReply {
  const parsed = parseJson(text)
  if (!isRecord(parsed)) {
    return unusable("the reply is not a JSON object", text, null)
  }
  const usage = readUsage(parsed)
  const assistant = assistantText(parsed)
  if (assistant === undefined) {
    return unusable(`the reply has no text${noTextDetail(parsed)}`, text, usage)
  }
  const value = jsonFromAssistant(assistant)
  if (value === undefined) {
    return unusable("the reply text is not JSON", assistant, usage)
  }
  return { value, usage }
}

function unusable(reason: string, excerpt: string, usage: Usage | null): Unusable {
  return { refused: true, reason, excerpt: excerpt.slice(0, 2000), usage }
}

// Claude: input_tokens + cache reads/writes; OpenAI and Mistral: prompt/completion
// tokens; Gemini: usageMetadata, where thinking is counted apart from the answer.
export function readUsage(body: Record<string, unknown>): Usage | null {
  const usage = body.usage
  if (isRecord(usage)) {
    if (typeof usage.input_tokens === "number") {
      const read = numberOr(usage.cache_read_input_tokens)
      const written = numberOr(usage.cache_creation_input_tokens)
      return {
        input: usage.input_tokens + read + written,
        output: numberOr(usage.output_tokens),
        cached: read,
      }
    }
    if (typeof usage.prompt_tokens === "number") {
      const details = usage.prompt_tokens_details
      return {
        input: usage.prompt_tokens,
        output: numberOr(usage.completion_tokens),
        cached: isRecord(details) ? numberOr(details.cached_tokens) : 0,
      }
    }
  }
  const meta = body.usageMetadata
  if (isRecord(meta) && typeof meta.promptTokenCount === "number") {
    return {
      input: meta.promptTokenCount,
      output: numberOr(meta.candidatesTokenCount) + numberOr(meta.thoughtsTokenCount),
      cached: numberOr(meta.cachedContentTokenCount),
    }
  }
  return null
}

function numberOr(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

// Gemini explains an empty reply with a finish reason (SAFETY, MAX_TOKENS, ...) or a
// prompt block reason.
function noTextDetail(body: Record<string, unknown>): string {
  const feedback = body.promptFeedback
  if (isRecord(feedback) && typeof feedback.blockReason === "string") {
    return ` (blocked: ${feedback.blockReason})`
  }
  const candidates = body.candidates
  const first: unknown = isUnknownArray(candidates) ? candidates[0] : undefined
  if (isRecord(first) && typeof first.finishReason === "string") {
    return ` (finish reason ${first.finishReason})`
  }
  const choices = body.choices
  const choice: unknown = isUnknownArray(choices) ? choices[0] : undefined
  if (isRecord(choice) && typeof choice.finish_reason === "string") {
    return ` (finish reason ${choice.finish_reason})`
  }
  if (typeof body.stop_reason === "string") {
    return ` (stop reason ${body.stop_reason})`
  }
  return ""
}

function assistantText(body: Record<string, unknown>): string | undefined {
  return (
    textFromChoices(body.choices) ??
    textFromCandidates(body.candidates) ??
    textFromContent(body.content)
  )
}

function textFromChoices(value: unknown): string | undefined {
  if (!isUnknownArray(value)) {
    return undefined
  }
  const first = value[0]
  if (!isRecord(first)) {
    return undefined
  }
  const message = first.message
  if (!isRecord(message)) {
    return undefined
  }
  return textFromContent(message.content)
}

function textFromCandidates(value: unknown): string | undefined {
  if (!isUnknownArray(value)) {
    return undefined
  }
  const first = value[0]
  if (!isRecord(first)) {
    return undefined
  }
  const content = first.content
  if (!isRecord(content)) {
    return undefined
  }
  return textFromContent(content.parts)
}

function textFromContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value
  }
  if (!isUnknownArray(value)) {
    return undefined
  }
  const texts: string[] = []
  for (const part of value) {
    if (!isRecord(part) || isThinking(part)) {
      continue
    }
    if (typeof part.text !== "string") {
      continue
    }
    texts.push(part.text)
  }
  if (texts.length === 0) {
    return undefined
  }
  return texts.join("")
}

function isThinking(part: Record<string, unknown>): boolean {
  return part.thought === true || part.type === "thinking" || part.type === "redacted_thinking"
}

function jsonFromAssistant(text: string): unknown {
  const stripped = stripFence(text.trim())
  const direct = parseJson(stripped)
  if (direct !== undefined) {
    return direct
  }
  const start = stripped.indexOf("{")
  const end = stripped.lastIndexOf("}")
  if (start < 0 || end <= start) {
    return undefined
  }
  return parseJson(stripped.slice(start, end + 1))
}

function stripFence(text: string): string {
  if (!text.startsWith("```")) {
    return text
  }
  const opened = text.replace(/^```[a-z]*\s*/i, "")
  return opened.replace(/\s*```$/, "")
}

function parseJson(text: string): unknown {
  const parsed = parseJsonValue(text)
  if (parsed !== undefined) {
    return parsed
  }
  const relaxed = relaxLineBreaks(text)
  if (relaxed === text) {
    return undefined
  }
  return parseJsonValue(relaxed)
}

function parseJsonValue(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text)
    return value
  } catch {
    return undefined
  }
}

// A model sometimes writes the subtitle line break \N into JSON unescaped.
function relaxLineBreaks(text: string): string {
  return text.replace(/(?<!\\)\\N/g, "\\\\N")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}
