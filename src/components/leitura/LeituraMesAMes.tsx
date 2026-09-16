import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { formatarTempo, mesesDoAno, relatorioMensal } from '../../reading/core'
import type { ReadingBookData, ReadingEntity, ReadingSessionData } from '../../reading/types'

type Livro = ReadingEntity<ReadingBookData>
type Sessao = ReadingEntity<ReadingSessionData>

const numero = (valor: number) => new Intl.NumberFormat('pt-BR').format(valor)
const nomeDoMes = (mes: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(`${mes}-15T12:00:00`))
const mesCurto = (mes: string) => new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${mes}-15T12:00:00`)).replace('.', '')
const dataCurta = (data: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(`${data}T12:00:00`))
/** Cada número junto do que ele conta: "1 livro", "80 páginas". */
const contar = (quantidade: number, um: string, varios: string) => `${numero(quantidade)} ${quantidade === 1 ? um : varios}`

/** O mês em uma linha: só o que tem número, para não encher a tela de zeros. */
function resumoDoMes({ livros, paginas, minutos }: { livros: number; paginas: number; minutos: number }): string {
  const partes = [
    livros > 0 ? contar(livros, 'livro', 'livros') : '',
    paginas > 0 ? contar(paginas, 'página', 'páginas') : '',
    minutos > 0 ? formatarTempo(minutos) : '',
  ].filter(Boolean)
  return partes.length ? partes.join(' · ') : 'Sem leitura registrada'
}

/**
 * O ano mês a mês.
 *
 * Os números são os mesmos do relatório de cada mês — livros concluídos, e
 * páginas e tempo das sessões daquele mês —, então o ano, o mês e esta lista
 * contam a mesma coisa. O mês com leitura fica em destaque e abre os livros e as
 * sessões dele; o mês vazio fica recolhido, e só aparece inteiro a pedido.
 */
export function LeituraMesAMes({ livros, sessoes, ano, mesSelecionado, onEscolherMes }: {
  livros: readonly Livro[]
  sessoes: readonly Sessao[]
  ano: string
  mesSelecionado: string
  onEscolherMes: (mes: string) => void
}) {
  const [aberto, setAberto] = useState('')
  const [todos, setTodos] = useState(false)

  const meses = mesesDoAno(livros, sessoes, ano)
  const comLeitura = meses.filter(({ temRegistro }) => temRegistro)
  const vazios = meses.filter(({ temRegistro }) => !temRegistro)
  const maior = Math.max(...meses.map(({ paginas }) => paginas), 1)
  const visiveis = todos ? meses : comLeitura

  function abrirMes(mes: string) {
    setAberto(aberto === mes ? '' : mes)
    onEscolherMes(mes)
  }

  return <div className="mes-a-mes">
    {!visiveis.length
      ? <div className="empty-state"><BookOpen /><strong>Nenhuma leitura registrada em {ano}</strong></div>
      : <ul className="mes-a-mes__lista">{visiveis.map((linha) => {
        const aberta = aberto === linha.mes
        const relatorio = aberta ? relatorioMensal(livros, sessoes, linha.mes) : null
        return <li key={linha.mes} className={`mes-linha${linha.temRegistro ? '' : ' mes-linha--vazio'}${linha.mes === mesSelecionado ? ' mes-linha--atual' : ''}`}>
          <button type="button" className="mes-linha__botao" aria-expanded={aberta} onClick={() => abrirMes(linha.mes)}>
            {/* O espaço separa o nome dos números no que o leitor de tela anuncia. */}
            <span className="mes-linha__nome">{nomeDoMes(linha.mes)}</span>{' '}
            <span className="mes-linha__numeros">{resumoDoMes(linha)}</span>
            <span className="mes-linha__barra" aria-hidden="true"><span style={{ width: `${Math.round(linha.paginas / maior * 100)}%` }} /></span>
            {aberta ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </button>
          {relatorio && <div className="mes-detalhe">
            {relatorio.livrosLidos.length > 0 && <ul className="mes-detalhe__livros">{relatorio.livrosLidos.map((lido) =>
              <li key={lido.id}>{lido.title}{relatorio.livrosConcluidos.some(({ id }) => id === lido.id) ? ' · concluído' : ''}</li>)}</ul>}
            {relatorio.historico.length
              ? <ul className="mes-detalhe__sessoes">{relatorio.historico.map((sessao) => <li key={sessao.id}>
                <span>{dataCurta(sessao.date)}</span>
                <span>{contar(sessao.pages, 'página', 'páginas')} · {formatarTempo(sessao.minutes)}</span>
              </li>)}</ul>
              : <p className="muted">Nenhuma leitura registrada neste mês.</p>}
          </div>}
        </li>
      })}</ul>}

    {!todos && vazios.length > 0 && <p className="mes-a-mes__vazios">
      <span>Sem leitura</span>
      {vazios.map(({ mes }) => <span key={mes} className="mes-vazio">{mesCurto(mes)}</span>)}
    </p>}

    {vazios.length > 0 && <button type="button" className="text-button" onClick={() => setTodos(!todos)}>
      {todos ? 'Mostrar só os meses com leitura' : 'Mostrar todos os meses'}
    </button>}
  </div>
}
