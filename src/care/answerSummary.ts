import type { VisitEntity } from './types'

/**
 * Abaixo disto o resultado não aparece: com poucas respostas, uma porcentagem
 * pode apontar para uma pessoa, e este resumo existe justamente para não
 * identificar ninguém.
 */
export const MINIMO_PARA_MOSTRAR = 5

export interface OpcaoResumo { rotulo: string; total: number; percentual: number }

export interface PerguntaResumo {
  code: string
  numero: string
  categoria: string
  pergunta: string
  respostas: number
  tipo: 'opcoes' | 'media' | 'escala'
  opcoes?: OpcaoResumo[]
  media?: number
  unidade?: string
}

function numeroCurto(code: string): string {
  return String(Number(code.replace(/^\D+/u, '')) || code)
}

/**
 * Totais das respostas das visitas. Só entram perguntas de contar: escolha,
 * número e escala. Texto livre, pedidos de oração e observações ficam de fora
 * por natureza — não há como resumi-los sem expor o que foi dito.
 */
export function summarizeAnswers(visits: VisitEntity[]): PerguntaResumo[] {
  const porPergunta = new Map<string, { pergunta: PerguntaResumo; valores: string[] }>()

  for (const visit of visits) {
    const versao = visit.versions.at(-1)
    if (!versao) continue
    for (const answer of versao.answers) {
      if (answer.skipped) continue
      const { question } = answer
      if (question.responseType === 'text') continue
      const valores = Array.isArray(answer.value) ? answer.value : [String(answer.value)]
      if (valores.every((valor) => !valor.trim())) continue

      const atual = porPergunta.get(question.code) ?? {
        pergunta: {
          code: question.code,
          numero: numeroCurto(question.code),
          categoria: question.category,
          pergunta: question.text,
          respostas: 0,
          tipo: question.responseType === 'number' ? (question.scaleMax ? 'escala' : 'media') : 'opcoes',
          ...(question.unit ? { unidade: question.unit } : {}),
        },
        valores: [],
      }
      atual.pergunta.respostas += 1
      atual.valores.push(...valores.filter((valor) => valor.trim()))
      porPergunta.set(question.code, atual)
    }
  }

  return [...porPergunta.values()]
    .filter(({ pergunta }) => pergunta.respostas >= MINIMO_PARA_MOSTRAR)
    .map(({ pergunta, valores }) => {
      if (pergunta.tipo === 'media') {
        const numeros = valores.map(Number).filter((numero) => Number.isFinite(numero))
        return { ...pergunta, media: numeros.length ? Math.round(numeros.reduce((soma, numero) => soma + numero, 0) / numeros.length) : 0 }
      }
      const contagem = new Map<string, number>()
      for (const valor of valores) contagem.set(valor, (contagem.get(valor) ?? 0) + 1)
      const total = valores.length
      const opcoes = [...contagem.entries()]
        .map(([rotulo, quantos]) => ({ rotulo, total: quantos, percentual: Math.round((quantos / total) * 100) }))
        .sort((esquerda, direita) => pergunta.tipo === 'escala' ? Number(esquerda.rotulo) - Number(direita.rotulo) : direita.total - esquerda.total)
      return { ...pergunta, opcoes }
    })
    .sort((esquerda, direita) => esquerda.code.localeCompare(direita.code))
}
