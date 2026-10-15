export function appendNote(words: string, reason: string): string {
  return `${words} {note: ${reason}}`
}
