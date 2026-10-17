import { describe, expect, it } from "vitest"
import { lineProblems, ruleProblems, variantProblems } from "../../src/core/pipeline/lint"

function problems(words: string, variant: "pt-pt" | "pt-br" = "pt-pt"): string[] {
  return variantProblems(words, variant).map((p) => p.problem)
}

describe("variant checks", () => {
  it("catches brazilian forms in a pt-pt line", () => {
    for (const line of [
      "Droga!",
      "Que legal!",
      "Nossa, que susto!",
      "Oi, Tanjiro.",
      "Ei, cara.",
      "Vou pra casa.",
      "A gente vai junto.",
      "Perdi o celular.",
      "Onde fica o banheiro?",
      "O café da manhã está pronto.",
      "Aquele garoto é estranho.",
      "Estou fazendo o jantar.",
      "Me diz a verdade.",
      "Espera.\\NMe conta tudo.",
    ]) {
      expect(problems(line), line).not.toEqual([])
    }
  })

  it("leaves good pt-pt lines alone", () => {
    for (const line of [
      "Raios!",
      "Anda cá!",
      "Vem cá!",
      "O que estás a fazer?",
      "Diz-me a verdade.",
      "A droga é perigosa.",
      "Isso é legal, segundo a lei.",
      "Bem, vou indo.",
      "Tens a cara cheia de fuligem.",
      "Se quiseres, vou contigo.",
      "Obrigado pela refeição! {note: Droga! é ok}",
    ]) {
      expect(problems(line), line).toEqual([])
    }
  })

  it("catches european forms in a pt-br line", () => {
    expect(problems("Apanhei o comboio.", "pt-br")).not.toEqual([])
    expect(problems("O que estás a fazer?", "pt-br")).not.toEqual([])
    expect(problems("Que fixe!", "pt-br")).not.toEqual([])
    expect(problems("Droga! Vem cá!", "pt-br")).toEqual([])
  })

  it("notes the problem in portuguese", () => {
    expect(variantProblems("Droga!", "pt-pt")[0]?.note).toBe("forma brasileira")
    expect(variantProblems("Que fixe!", "pt-br")[0]?.note).toBe("forma europeia")
  })
})

describe("glossary rules", () => {
  const rules = [
    { kind: "glossary" as const, source: "Hashira", pt: "Pilar" },
    { kind: "prose" as const, text: "Keep honorifics." },
  ]

  it("requires the chosen form when the english term is in the line", () => {
    expect(ruleProblems("He is a Hashira.", "Ele é um Hashira.", rules)).toEqual([
      { problem: '"Hashira" must be translated as "Pilar"', note: "regra: Hashira = Pilar" },
    ])
    expect(ruleProblems("He is a Hashira.", "Ele é um pilar.", rules)).toEqual([])
    expect(ruleProblems("The Hashiras meet.", "Os Pilares reúnem-se.", rules)).toEqual([])
    expect(ruleProblems("Hello.", "Olá.", rules)).toEqual([])
  })

  it("combines rules and variant checks", () => {
    expect(lineProblems("Damn, a Hashira!", "Droga, um Hashira!", "pt-pt", rules)).toHaveLength(2)
  })
})
