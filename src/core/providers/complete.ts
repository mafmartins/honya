import type { LineResult, ProviderId } from "../pipeline/types"
import { providerError } from "./errors"

export interface ChatInput {
  provider: ProviderId
  model: string
  apiKey: string
  prompt: string
  images?: { id: string; png: Uint8Array }[]
  fetch: typeof fetch
  effort?: "low"
}

type ChatReply = { lines: LineResult[] } | { refused: true }
type ChatImage = { id: string; png: Uint8Array }
type HeaderMap = Record<string, string>

interface TextPart {
  type: "text"
  text: string
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

interface ClaudeBody {
  model: string
  max_tokens: number
  output_config?: { effort: "low" }
  messages: { role: "user"; content: string | (TextPart | ClaudeImagePart)[] }[]
}

interface OpenAiBody {
  model: string
  reasoning_effort?: "low"
  messages: { role: "user"; content: string | (TextPart | OpenAiImagePart)[] }[]
}

interface MistralBody {
  model: string
  reasoning_effort?: "none"
  messages: { role: "user"; content: string | (TextPart | MistralImagePart)[] }[]
}

interface GeminiBody {
  generationConfig?: { thinkingConfig: { thinkingLevel: "low" } }
  contents: { role: "user"; parts: (GeminiTextPart | GeminiImagePart)[] }[]
}

type ProviderBody = ClaudeBody | OpenAiBody | MistralBody | GeminiBody

interface ProviderRequest {
  url: string
  headers: HeaderMap
  body: ProviderBody
}

const JSON_INSTRUCTION =
  'Return JSON { "lines": [{ "id", "words", "mark", "reason", "glossary" }] } and keep every \\N.'

const CLAUDE_MAX_TOKENS = 16000

export async function completeChat(input: ChatInput): Promise<ChatReply> {
  const body = await send(input, buildRequest(input, true))
  return readChatBody(body)
}

export async function completeText(
  input: ChatInput,
): Promise<{ text: string } | { refused: true }> {
  const body = await send(input, buildRequest(input, false))
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
  try {
    response = await input.fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
    })
    text = await response.text()
  } catch {
    throw providerError(input.provider, null, null)
  }
  if (response.status !== 200) {
    throw providerError(input.provider, response.status, text)
  }
  return text
}

function buildRequest(input: ChatInput, lines: boolean): ProviderRequest {
  const images = input.images ?? []
  const text = lines ? instructed(input.prompt) : input.prompt
  switch (input.provider) {
    case "claude":
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: claudeHeaders(input.apiKey),
        body: claudeBody(input.model, text, images, input.effort),
      }
    case "gpt":
      return {
        url: "https://api.openai.com/v1/chat/completions",
        headers: bearerHeaders(input.apiKey),
        body: openAiBody(input.model, text, images, input.effort),
      }
    case "gemini":
      return {
        url: geminiUrl(input.model, input.apiKey),
        headers: { "Content-Type": "application/json" },
        body: geminiBody(text, images, input.effort),
      }
    case "mistral":
      return {
        url: "https://api.mistral.ai/v1/chat/completions",
        headers: bearerHeaders(input.apiKey),
        body: mistralBody(input.model, text, images, input.effort),
      }
  }
}

function instructed(prompt: string): string {
  return `${JSON_INSTRUCTION}\n${prompt}`
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

function claudeBody(
  model: string,
  text: string,
  images: readonly ChatImage[],
  effort: ChatInput["effort"],
): ClaudeBody {
  const body: ClaudeBody = {
    model,
    max_tokens: CLAUDE_MAX_TOKENS,
    messages: [{ role: "user", content: claudeContent(text, images) }],
  }
  if (effort === "low") {
    body.output_config = { effort: "low" }
  }
  return body
}

function openAiBody(
  model: string,
  text: string,
  images: readonly ChatImage[],
  effort: ChatInput["effort"],
): OpenAiBody {
  const body: OpenAiBody = {
    model,
    messages: [{ role: "user", content: openAiContent(text, images) }],
  }
  if (effort === "low") {
    body.reasoning_effort = "low"
  }
  return body
}

function mistralBody(
  model: string,
  text: string,
  images: readonly ChatImage[],
  effort: ChatInput["effort"],
): MistralBody {
  const body: MistralBody = {
    model,
    messages: [{ role: "user", content: mistralContent(text, images) }],
  }
  if (effort === "low") {
    body.reasoning_effort = "none"
  }
  return body
}

function geminiBody(
  text: string,
  images: readonly ChatImage[],
  effort: ChatInput["effort"],
): GeminiBody {
  const body: GeminiBody = {
    contents: [{ role: "user", parts: geminiParts(text, images) }],
  }
  if (effort === "low") {
    body.generationConfig = { thinkingConfig: { thinkingLevel: "low" } }
  }
  return body
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
    parts.push({ type: "text", text: image.id })
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
    parts.push({ type: "text", text: image.id })
    parts.push({
      type: "image_url",
      image_url: { url: pngDataUrl(image.png) },
    })
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
    parts.push({ type: "text", text: image.id })
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
    parts.push({ text: image.id })
    parts.push({
      inlineData: { mimeType: "image/png", data: pngBase64(image.png) },
    })
  }
  return parts
}

function pngBase64(png: Uint8Array): string {
  return Buffer.from(png).toString("base64")
}

function pngDataUrl(png: Uint8Array): string {
  return `data:image/png;base64,${pngBase64(png)}`
}

function readChatBody(text: string): ChatReply {
  const parsed = parseJson(text)
  if (parsed === undefined) {
    return { refused: true }
  }
  const direct = readLines(parsed)
  if (direct !== undefined) {
    return { lines: direct }
  }
  if (!isRecord(parsed)) {
    return { refused: true }
  }
  const assistant = assistantText(parsed)
  if (assistant === undefined) {
    return { refused: true }
  }
  const nested = readLines(jsonFromAssistant(assistant))
  if (nested === undefined) {
    return { refused: true }
  }
  return { lines: nested }
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

function relaxLineBreaks(text: string): string {
  return text.replace(/(?<!\\)\\N/g, "\\\\N")
}

function readLines(value: unknown): LineResult[] | undefined {
  if (!isRecord(value) || !isUnknownArray(value.lines)) {
    return undefined
  }
  const lines: LineResult[] = []
  for (const item of value.lines) {
    const line = readLine(item)
    if (line === undefined) {
      return undefined
    }
    lines.push(line)
  }
  return lines
}

function readLine(value: unknown): LineResult | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const id = readLineId(value.id)
  const words = value.words
  const mark = value.mark
  if (id === undefined || typeof words !== "string" || !isMark(mark)) {
    return undefined
  }
  const line: LineResult = { id, words, mark }
  if (!copyOptional(line, value)) {
    return undefined
  }
  return line
}

function readLineId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}

function copyOptional(line: LineResult, value: Record<string, unknown>): boolean {
  if ("reason" in value && value.reason !== undefined && value.reason !== null) {
    if (typeof value.reason !== "string") {
      return false
    }
    line.reason = value.reason
  }
  if ("glossary" in value && value.glossary !== undefined && value.glossary !== null) {
    const glossary = readGlossary(value.glossary)
    if (glossary === undefined) {
      return false
    }
    line.glossary = glossary
  }
  if ("hardIds" in value && value.hardIds !== undefined && value.hardIds !== null) {
    const hardIds = readStringList(value.hardIds)
    if (hardIds === undefined) {
      return false
    }
    line.hardIds = hardIds
  }
  if ("frameIds" in value && value.frameIds !== undefined && value.frameIds !== null) {
    const frameIds = readStringList(value.frameIds)
    if (frameIds === undefined) {
      return false
    }
    line.frameIds = frameIds
  }
  return true
}

function readGlossary(value: unknown): { source: string; pt: string }[] | undefined {
  if (!isUnknownArray(value)) {
    return undefined
  }
  const entries: { source: string; pt: string }[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.source !== "string" || typeof item.pt !== "string") {
      return undefined
    }
    entries.push({ source: item.source, pt: item.pt })
  }
  return entries
}

function readStringList(value: unknown): string[] | undefined {
  if (!isUnknownArray(value)) {
    return undefined
  }
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== "string") {
      return undefined
    }
    items.push(item)
  }
  return items
}

function isMark(value: unknown): value is LineResult["mark"] {
  return value === "clean" || value === "doubt" || value === "hard-call" || value === "mild"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}
