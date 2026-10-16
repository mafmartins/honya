// JSON schemas sent with each request so the provider constrains its reply. They stay
// inside the subset every provider's strict mode accepts: every property required, no
// extra properties, no length or number limits.

export interface ReplySchema {
  name: string
  schema: Readonly<Record<string, unknown>>
}

const TERMS = {
  type: "array",
  items: {
    type: "object",
    properties: {
      source: { type: "string" },
      pt: { type: "string" },
    },
    required: ["source", "pt"],
    additionalProperties: false,
  },
}

const IDS = { type: "array", items: { type: "string" } }

export const LINES_SCHEMA: ReplySchema = {
  name: "translated_lines",
  schema: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
            mark: { type: "string", enum: ["clean", "mild", "hard-call", "doubt"] },
            note: { type: "string" },
          },
          required: ["id", "text", "mark", "note"],
          additionalProperties: false,
        },
      },
      terms: TERMS,
    },
    required: ["lines", "terms"],
    additionalProperties: false,
  },
}

export const BRIEF_SCHEMA: ReplySchema = {
  name: "episode_brief",
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      terms: TERMS,
      hard: IDS,
      frames: IDS,
    },
    required: ["summary", "terms", "hard", "frames"],
    additionalProperties: false,
  },
}
