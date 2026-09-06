/**
 * Os dois relatórios do ACMS que alimentam as metas.
 *
 * O leitor anterior só aceitava um formato inventado
 * (`igreja|AAAA-MM-DD|métrica|quantidade`), que nenhum relatório de verdade
 * produz — então nada do ACMS entrava. Estes dois leem o que o sistema
 * realmente exporta.
 *
 * Nenhum dos dois carrega nome de pessoa: são igrejas, meses e números.
 */

// Guardados já sem acento: `março` normalizado vira `marco`, e comparar a
// forma acentuada com a forma normalizada fazia março sumir de todas as
// igrejas em silêncio.
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export class RelatorioNaoReconhecidoError extends Error {}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
}

function linhasUteis(texto: string): string[] {
  return texto.split('\n').map((linha) => linha.replace(/\s+/gu, ' ').trim()).filter(Boolean)
}

/**
 * Célula do relatório de movimento: `-` é ausência, e ausência é zero.
 *
 * Só número inteiro conta. A linha de resumo do distrito termina em
 * `34 90 37,8` — total, alvo e porcentagem —, e ler `37,8` como se fosse um mês
 * fazia a linha inteira passar por igreja: o distrito aparecia duas vezes e o
 * total dobrava. Batismo é gente, e gente não vem com vírgula.
 */
function celula(token: string): number | null {
  if (token === '-' || token === '–') return 0
  if (!/^-?\d+$/u.test(token)) return null
  const numero = Number(token)
  return Number.isFinite(numero) ? numero : null
}

/**
 * `1.151,00` é mil cento e cinquenta e um. `-20.00` é vinte negativo.
 *
 * O mesmo relatório usa as duas convenções: valores em português e porcentagens
 * em inglês. Distinguir pela vírgula é o que evita ler mil como um.
 */
export function numeroBrasileiro(token: string): number | null {
  const limpo = token.trim()
  if (!limpo || !/^-?[\d.,]+$/u.test(limpo)) return null
  const normalizado = limpo.includes(',') ? limpo.replace(/\./gu, '').replace(',', '.') : limpo
  const valor = Number(normalizado)
  return Number.isFinite(valor) ? valor : null
}

export interface IgrejaMovimento { nome: string; meses: number[]; total: number }
export interface MovimentoLido { ano: number; ateOMes: number; igrejas: IgrejaMovimento[] }

/**
 * "Análise de Movimentos por Distrito/Igreja": batismos por igreja, mês a mês.
 *
 * A linha de cada igreja termina em treze células — doze meses e o total. Antes
 * delas pode vir `<membros> <I|G>`, e às vezes esse par escorrega para a linha
 * anterior por causa do desenho do PDF; por isso a leitura vem do fim para o
 * começo, onde a estrutura é estável, em vez de contar colunas do início.
 */
export function parseMovimentoDeBatismos(texto: string): MovimentoLido {
  const linhas = linhasUteis(texto)
  const cabecalho = linhas.map((linha) => /at[ée] ao m[êe]s:\s*(\d{1,2})\/(\d{4})/iu.exec(linha)).find(Boolean)
  if (!cabecalho) {
    throw new RelatorioNaoReconhecidoError('Este arquivo não parece a Análise de Movimentos do ACMS: falta a linha "Até ao mês". Nada foi alterado.')
  }
  const ateOMes = Number(cabecalho[1]); const ano = Number(cabecalho[2])

  const igrejas: IgrejaMovimento[] = []
  for (const linha of linhas) {
    if (/^total da entidade/iu.test(semAcento(linha))) continue
    const tokens = linha.split(' ')
    if (tokens.length < 14) continue
    const cauda = tokens.slice(-13).map(celula)
    if (cauda.some((valor) => valor === null)) continue

    let resto = tokens.slice(0, -13)
    // `31 G` ou `171 I`: quantidade de membros e o tipo do grupo. Informativo
    // aqui, e removido para o que sobra ser só o nome.
    if (resto.length >= 2 && /^[IG]$/u.test(resto.at(-1) ?? '') && /^\d+$/u.test(resto.at(-2) ?? '')) resto = resto.slice(0, -2)
    const nome = resto.join(' ').trim()
    // Sem nome é a linha de resumo do distrito, que repete os mesmos números:
    // somá-la dobraria o distrito inteiro.
    if (!nome || !/\p{L}{3,}/u.test(nome)) continue

    const meses = cauda.slice(0, 12) as number[]
    igrejas.push({ nome, meses, total: cauda[12] as number })
  }

  if (!igrejas.length) {
    throw new RelatorioNaoReconhecidoError('Nenhuma igreja foi reconhecida na Análise de Movimentos. Nada foi alterado.')
  }
  return { ano, ateOMes, igrejas }
}

export interface MesDeEntrada { mes: number; dizimoAnterior: number; dizimoAtual: number; ofertaAnterior: number; ofertaAtual: number }
export interface IgrejaEntrada { nome: string; meses: MesDeEntrada[] }
export interface ComparativoLido { anoAnterior: number; anoAtual: number; igrejas: IgrejaEntrada[] }

/**
 * "Comparativo de Entradas — Igreja Mês a Mês": dízimo e oferta por igreja, com
 * o ano anterior ao lado do atual.
 *
 * É esse "ao lado" que torna a meta em porcentagem possível sem ninguém
 * digitar o ano passado: o próprio relatório traz os dois.
 *
 * As linhas de total são ignoradas de propósito. Elas se quebram de formas
 * diferentes conforme o desenho da página, e somar os meses é mais confiável do
 * que tentar adivinhar onde o total começou.
 */
export function parseComparativoDeEntradas(texto: string): ComparativoLido {
  const linhas = linhasUteis(texto)
  // Sem âncora no começo da linha. O cabeçalho do relatório real chega como
  // "Position Igreja Mês 2025 2026 %% 2025 2026 %%": o rótulo da coluna da
  // esquerda cai na mesma linha dos anos, e exigir que a linha comece em "Mês"
  // fazia o arquivo certo ser recusado como se fosse outro documento.
  const anos = linhas.map((linha) => /m[êe]s\s+(\d{4})\s+(\d{4})\s+%/iu.exec(linha)).find(Boolean)
  if (!anos) {
    throw new RelatorioNaoReconhecidoError('Este arquivo não parece o Comparativo de Entradas do ACMS: falta a linha com os dois anos. Nada foi alterado.')
  }
  const anoAnterior = Number(anos[1]); const anoAtual = Number(anos[2])

  const igrejas: IgrejaEntrada[] = []
  let atual: IgrejaEntrada | null = null
  for (const linha of linhas) {
    const tokens = linha.split(' ')
    const posicaoDoMes = tokens.findIndex((token) => MESES.includes(semAcento(token)))
    if (posicaoDoMes < 0) continue
    // Só o dinheiro, reconhecido pela vírgula decimal. As porcentagens usam
    // ponto, e às vezes uma delas quebra para a linha seguinte: contar posições
    // fazia a linha inteira ser descartada — e, pior, os meses daquela igreja
    // iam parar na igreja anterior, com o dinheiro atribuído a quem não era.
    const valores = tokens.slice(posicaoDoMes + 1).filter((token) => token.includes(',')).map(numeroBrasileiro)
    if (valores.length < 4 || valores.slice(0, 4).some((valor) => valor === null)) continue

    // Antes do nome do mês vem o nome da igreja, quando a linha abre uma; nas
    // continuações não vem nada, e o mês pertence à igreja anterior.
    const antes = tokens.slice(0, posicaoDoMes)
    if (antes.length > 0) {
      // `1 995 Nome da Igreja`: posição e código do ACMS, que não interessam.
      const nome = antes.filter((token, indice) => !(indice < 2 && /^[\d.]+$/u.test(token))).join(' ').trim()
      if (nome) {
        // Uma igreja partida entre páginas reaparece com o nome de novo. Somar
        // as duas metades é o certo; criar duas entradas com o mesmo nome
        // deixaria a igreja aparecendo duas vezes na conferência.
        const existente = igrejas.find((igreja) => igreja.nome === nome)
        if (existente) atual = existente
        else { atual = { nome, meses: [] }; igrejas.push(atual) }
      }
    }
    if (!atual) continue

    const [dizimoAnterior, dizimoAtual, ofertaAnterior, ofertaAtual] = valores as number[]
    // O mesmo mês repetido é o cabeçalho de página relendo o que já entrou.
    const mesLido = MESES.indexOf(semAcento(tokens[posicaoDoMes] ?? '')) + 1
    if (atual.meses.some((mes) => mes.mes === mesLido)) continue
    atual.meses.push({
      mes: mesLido,
      dizimoAnterior: dizimoAnterior ?? 0,
      dizimoAtual: dizimoAtual ?? 0,
      ofertaAnterior: ofertaAnterior ?? 0,
      ofertaAtual: ofertaAtual ?? 0,
    })
  }

  const comMeses = igrejas.filter(({ meses }) => meses.length > 0)
  if (!comMeses.length) {
    throw new RelatorioNaoReconhecidoError('Nenhuma igreja foi reconhecida no Comparativo de Entradas. Nada foi alterado.')
  }
  return { anoAnterior, anoAtual, igrejas: comMeses }
}

/** Dízimo mais oferta, que é o que a meta financeira acompanha. */
export function totalDeEntradas(meses: readonly MesDeEntrada[], ano: 'anterior' | 'atual'): number {
  return meses.reduce((soma, mes) => soma + (ano === 'atual' ? mes.dizimoAtual + mes.ofertaAtual : mes.dizimoAnterior + mes.ofertaAnterior), 0)
}
