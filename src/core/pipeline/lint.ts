import type { Rule, Variant } from "../library/types"

// Checks a translation can fail without a model having to judge it: forms from the
// other variant, and the profile's glossary rules. `problem` is the English sentence
// the fix request shows the model; `note` is what review shows if it stays.

export interface LineProblem {
  problem: string
  note: string
}

interface Marker {
  pattern: RegExp
  problem: string
}

// Letters on either side mean the word is part of a longer one ("droga" in "drogaria").
const L = "\\p{L}"
function word(text: string): string {
  return `(?<![${L}])${text}(?![${L}])`
}
function marker(source: string, problem: string): Marker {
  return { pattern: new RegExp(source, "iu"), problem }
}

const SENTENCE_START = "(?:^|[.!?…]\\s+|\\\\N)"

// Brazilian forms that read wrong in a PT-PT subtitle. Kept to forms that are clearly
// Brazilian in subtitles, so a hit is worth a second look.
const BRAZILIAN: readonly Marker[] = [
  marker(
    `${SENTENCE_START}droga[!.…,]`,
    '"Droga!" is Brazilian; use "Raios!", "Bolas!", "Merda!" or similar',
  ),
  marker(`${SENTENCE_START}(?:que\\s+)?legal[!.…]`, '"legal" for "cool" is Brazilian; use "fixe"'),
  marker(
    `${SENTENCE_START}nossa[!,…]`,
    '"Nossa!" is Brazilian; use "Caramba!", "Credo!" or "Uau!"',
  ),
  marker(`${SENTENCE_START}oi[!,.]`, '"Oi" is Brazilian; use "Olá" or "Ei"'),
  marker(word("ué"), '"ué" is Brazilian'),
  marker(
    `${SENTENCE_START}beleza[!?.]`,
    '"Beleza" for "okay" is Brazilian; use "Está bem" or "Combinado"',
  ),
  marker(
    `(?:,\\s*|${SENTENCE_START})cara[!?.,]`,
    '"cara" for "dude" is Brazilian; use "pá" or drop it',
  ),
  marker(word("pra"), '"pra" is Brazilian spelling; use "para"'),
  marker(word("a gente"), '"a gente" is Brazilian in this register; use "nós"'),
  marker(word("ônibus"), '"ônibus" is Brazilian; use "autocarro"'),
  marker(word("celular"), '"celular" is Brazilian; use "telemóvel"'),
  marker(word("banheiro"), '"banheiro" is Brazilian; use "casa de banho"'),
  marker(word("café da manhã"), '"café da manhã" is Brazilian; use "pequeno-almoço"'),
  marker(word("geladeira"), '"geladeira" is Brazilian; use "frigorífico"'),
  marker(word("sorvete"), '"sorvete" is Brazilian; use "gelado"'),
  marker(word("garot[oa]s?"), '"garoto/garota" is Brazilian; use "miúdo", "rapaz" or "rapariga"'),
  marker(word("moça"), '"moça" is Brazilian; use "rapariga" or "menina"'),
  marker(
    word("(?:estou|estás|está|estamos|estão|estava|estavas|estávamos|estavam)\\s+\\p{L}+ndo"),
    'the gerund after "estar" is Brazilian; use "estar a" + infinitive',
  ),
  marker(
    `${SENTENCE_START}(?:me|te)\\s+\\p{L}`,
    'a pronoun before the verb at the start of a sentence is Brazilian; put it after ("Diz-me")',
  ),
]

// European forms that read wrong in a PT-BR subtitle.
const EUROPEAN: readonly Marker[] = [
  marker(word("comboios?"), '"comboio" is European; use "trem"'),
  marker(word("autocarros?"), '"autocarro" is European; use "ônibus"'),
  marker(word("telemóve(?:l|is)"), '"telemóvel" is European; use "celular"'),
  marker(word("casa de banho"), '"casa de banho" is European; use "banheiro"'),
  marker(word("pequeno-almoço"), '"pequeno-almoço" is European; use "café da manhã"'),
  marker(word("raparigas?"), '"rapariga" is European (and rude in Brazil); use "garota" or "moça"'),
  marker(word("miúd[oa]s?"), '"miúdo" is European; use "garoto" or "criança"'),
  marker(word("fixe"), '"fixe" is European; use "legal"'),
  marker(word("bué"), '"bué" is European slang'),
  marker(word("gaj[oa]s?"), '"gajo" is European slang; use "cara"'),
  marker(
    word("(?:estou|estás|está|estamos|estão|estava|estavam)\\s+a\\s+\\p{L}+(?:ar|er|ir)"),
    '"estar a" + infinitive is European; use the gerund ("estou fazendo")',
  ),
]

export function variantProblems(words: string, variant: Variant): LineProblem[] {
  const text = withoutNote(words)
  const markers = variant === "pt-pt" ? BRAZILIAN : EUROPEAN
  const note = variant === "pt-pt" ? "forma brasileira" : "forma europeia"
  return markers.filter((m) => m.pattern.test(text)).map((m) => ({ problem: m.problem, note }))
}

// A glossary rule applies when its English term is in the line; the translation must
// then contain the chosen Portuguese form.
export function ruleProblems(
  english: string,
  words: string,
  rules: readonly Rule[],
): LineProblem[] {
  const text = withoutNote(words).toLocaleLowerCase("pt")
  const problems: LineProblem[] = []
  for (const rule of rules) {
    if (rule.kind !== "glossary" || rule.source.trim() === "" || rule.pt.trim() === "") {
      continue
    }
    const source = new RegExp(word(escape(rule.source.trim())), "iu")
    if (source.test(english) && !text.includes(rule.pt.trim().toLocaleLowerCase("pt"))) {
      problems.push({
        problem: `"${rule.source}" must be translated as "${rule.pt}"`,
        note: `regra: ${rule.source} = ${rule.pt}`,
      })
    }
  }
  return problems
}

export function lineProblems(
  english: string,
  words: string,
  variant: Variant,
  rules: readonly Rule[],
): LineProblem[] {
  return [...ruleProblems(english, words, rules), ...variantProblems(words, variant)]
}

function withoutNote(words: string): string {
  return words.replace(/\s*\{note: [^}]*\}$/, "")
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
