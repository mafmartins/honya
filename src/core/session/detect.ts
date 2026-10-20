import type { DialogueCue } from "../ass/script"

// Some scripts arrive half translated: the translator overwrote the English with
// Portuguese up to some line. These words and letters tell the two languages apart well
// enough for subtitle lines; a line with no sign either way takes the language of the
// lines around it when they agree, and otherwise stays "not translated" so the AI covers
// it. Done in code: no request, no cost.
const PORTUGUESE = new Set(
  (
    "o os e um uma uns umas de do da dos das no na nos nas ao à que não é está estou estás " +
    "estava tu te ti teu tua eu ele ela eles elas nós você vocês se por para pra com sem mas mais " +
    "já também muito isso isto esse essa aqui ali então porque porquê quando onde quem como " +
    "sim obrigado obrigada vou vais vai foi és são ser ter tens tenho tem fazer olha lá ai " +
    "minha meu sua seu nada tudo ainda agora sempre nunca bem só dele dela outro outra outros outras"
  ).split(" "),
)
const ENGLISH = new Set(
  (
    "the an of to and is are was were you your i he she we they it that this what why how " +
    "who where when not don't can't i'm it's you're do does did have has be been with for but " +
    "so just my me him her them yes no oh well there here all will would can could about"
  ).split(" "),
)
const ACCENTS = /[ãõçáéíóúâêôà]/g

type Language = "pt" | "en" | null

function languageOf(text: string): Language {
  const plain = text
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\\[Nn]/g, " ")
    .toLocaleLowerCase("pt")
  const words = plain.match(/[a-zà-ÿ']+/g) ?? []
  const portuguese =
    words.filter((word) => PORTUGUESE.has(word)).length + 2 * (plain.match(ACCENTS)?.length ?? 0)
  const english = words.filter((word) => ENGLISH.has(word)).length
  if (portuguese > english) {
    return "pt"
  }
  return english > portuguese ? "en" : null
}

// Event indexes of the lines that are already in Portuguese.
export function alreadyPortuguese(cues: readonly DialogueCue[]): Set<number> {
  const languages = cues.map((cue) => languageOf(cue.visible))
  const found = new Set<number>()
  languages.forEach((language, at) => {
    if (language === "pt") {
      found.add(cues[at]?.index ?? -1)
      return
    }
    if (language !== null) {
      return
    }
    const before = languages
      .slice(0, at)
      .reverse()
      .find((other) => other !== null)
    const after = languages.slice(at + 1).find((other) => other !== null)
    if (before === "pt" && (after === "pt" || after === undefined)) {
      found.add(cues[at]?.index ?? -1)
    }
  })
  found.delete(-1)
  return found
}
