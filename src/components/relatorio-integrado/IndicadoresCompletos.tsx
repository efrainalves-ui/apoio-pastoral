import { ChevronDown } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import {
  comparacaoDoPeriodo, INDICADORES_NUMERICOS, leituraDaIgreja, leituraDoDistrito, possiveisErros, possivelErroNoValor,
  rotuloCurto, serieTrimestral, type PossivelErro,
} from '../../integrated-report/painel'
import type { RelatorioIntegradoEntity } from '../../integrated-report/types'
import { formatarNumero, MarcaDePossivelErro, Variacao } from './Graficos'
import { MarcaDoIndicador } from '../plano/MarcaDaArea'

type Filtro = 'respondidos' | 'alta' | 'queda' | 'erro' | 'todos'
/* Abre só no que alguma igreja respondeu: são mais de sessenta perguntas, e a maioria das vazias não diz nada. */
const FILTROS: ReadonlyArray<{ valor: Filtro; rotulo: string }> = [
  { valor: 'respondidos', rotulo: 'Com resposta' }, { valor: 'alta', rotulo: 'Em alta' }, { valor: 'queda', rotulo: 'Em queda' }, { valor: 'erro', rotulo: 'Com asterisco' }, { valor: 'todos', rotulo: 'Todos' },
]
const TRIMESTRES = [1, 2, 3, 4]

interface Props {
  relatorios: readonly RelatorioIntegradoEntity[]
  igrejas: readonly string[]
  nomeDaIgreja: (churchId: string) => string
  ano: number
  area: string
  trimestreAtivo: number | null
  aoEscolher: (indicadorId: string) => void
}

/**
 * Todos os indicadores com número, compactos.
 *
 * O nome curto fica na linha e o texto do relatório aparece ao abrir. Abrir uma
 * linha mostra as igrejas daquele indicador, sem sair da página.
 */
export function IndicadoresCompletos({ relatorios, igrejas, nomeDaIgreja, ano, area, trimestreAtivo, aoEscolher }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('respondidos')
  const [aberto, setAberto] = useState('')

  const linhas = useMemo(() => {
    const erros = new Map<string, PossivelErro[]>()
    for (const erro of possiveisErros(relatorios, igrejas, { ano, trimestre: null })) erros.set(erro.indicadorId, [...(erros.get(erro.indicadorId) ?? []), erro])
    return INDICADORES_NUMERICOS.filter(({ secao }) => !area || secao === area).map((indicador) => ({
      indicador,
      serie: serieTrimestral(relatorios, igrejas, indicador.id, ano),
      doAno: leituraDoDistrito(relatorios, igrejas, indicador.id, { ano, trimestre: null }),
      comparacao: comparacaoDoPeriodo(relatorios, igrejas, indicador.id, { ano, trimestre: trimestreAtivo }),
      erros: erros.get(indicador.id) ?? [],
    }))
  }, [relatorios, igrejas, ano, area, trimestreAtivo])

  const contas: Record<Filtro, number> = {
    todos: linhas.length,
    respondidos: linhas.filter(({ serie }) => serie.some(({ numero }) => numero !== null)).length,
    alta: linhas.filter(({ comparacao }) => comparacao.tendencia === 'alta').length,
    queda: linhas.filter(({ comparacao }) => comparacao.tendencia === 'queda').length,
    erro: linhas.filter(({ erros }) => erros.length > 0).length,
  }
  const visiveis = linhas.filter(({ comparacao, erros, serie }) => filtro === 'todos'
    || (filtro === 'respondidos' ? serie.some(({ numero }) => numero !== null) : filtro === 'erro' ? erros.length > 0 : comparacao.tendencia === filtro))

  return <>
    <div className="tira-filtros" role="group" aria-label="Filtrar indicadores">
      {FILTROS.map(({ valor, rotulo }) => <button key={valor} type="button" className={`chip-filtro ${filtro === valor ? 'chip-filtro--ativo' : ''}`} aria-pressed={filtro === valor} onClick={() => setFiltro(valor)}>
        {rotulo}<span className="chip-filtro__conta">{contas[valor]}</span>
      </button>)}
    </div>

    {visiveis.length === 0
      ? <p className="ri-vazio">Nenhum indicador neste filtro</p>
      : <div className="ri-tabela-fixa">
          <table className="tabela-simples ri-tabela ri-tabela--completa">
            <thead><tr>
              <th scope="col">Indicador</th>
              {TRIMESTRES.map((numero) => <th scope="col" key={numero} className={`numero-tabela${trimestreAtivo === numero ? ' ri-coluna-ativa' : ''}`}>{numero}º tri</th>)}
              <th scope="col" className="numero-tabela">Ano</th>
              <th scope="col">Tendência</th>
            </tr></thead>
            <tbody>{visiveis.map(({ indicador, serie, doAno, comparacao, erros }) => {
              const estaAberto = aberto === indicador.id
              return <Fragment key={indicador.id}>
                <tr className={estaAberto ? 'ri-linha-aberta' : undefined}>
                  <th scope="row">
                    <button type="button" className="ri-indicador" aria-expanded={estaAberto} title={indicador.rotulo} onClick={() => setAberto(estaAberto ? '' : indicador.id)}>
                      <ChevronDown aria-hidden="true" size={15} className="ri-indicador__seta" />
                      <span>{rotuloCurto(indicador)}</span>
                      {erros.length > 0 && <span className="ri-indicador__asterisco" aria-label={`${erros.length} possível(is) erro(s) de digitação`}>*</span>}
                    </button>
                    <small>{indicador.tratamento === 'somar' ? 'Soma' : 'Último trimestre'}</small>
                    <MarcaDoIndicador id={indicador.id} />
                  </th>
                  {serie.map((leitura, indice) => <td key={indice} data-rotulo={`${indice + 1}º tri`} className={`numero-tabela${leitura.numero === null ? ' ri-tabela__vazio' : ''}${trimestreAtivo === indice + 1 ? ' ri-coluna-ativa' : ''}`}>
                    {leitura.numero === null ? '—' : formatarNumero(leitura.numero)}
                  </td>)}
                  <td data-rotulo="Ano" className="numero-tabela ri-tabela__ano">{doAno.numero === null ? '—' : formatarNumero(doAno.numero)}</td>
                  <td data-rotulo="Tendência"><Variacao comparacao={comparacao} /></td>
                </tr>
                {estaAberto && <tr className="ri-detalhe"><td colSpan={7}>
                  <div className="ri-detalhe__topo">
                    <p>{indicador.rotulo}</p>
                    <button type="button" className="text-button" onClick={() => aoEscolher(indicador.id)}>Ver no gráfico</button>
                  </div>
                  <table className="tabela-simples ri-tabela ri-tabela--detalhe">
                    <thead><tr><th scope="col">Igreja</th>{TRIMESTRES.map((numero) => <th scope="col" key={numero} className="numero-tabela">{numero}º tri</th>)}<th scope="col" className="numero-tabela">Ano</th></tr></thead>
                    <tbody>{igrejas.map((churchId) => {
                      const nome = nomeDaIgreja(churchId)
                      const doAnoNaIgreja = leituraDaIgreja(relatorios, churchId, indicador.id, { ano, trimestre: null })
                      return <tr key={churchId}>
                        <th scope="row">{nome}</th>
                        {TRIMESTRES.map((trimestre) => {
                          const leitura = leituraDaIgreja(relatorios, churchId, indicador.id, { ano, trimestre })
                          const erro = possivelErroNoValor(relatorios, churchId, indicador.id, `${ano}-${trimestre}`)
                          return <td key={trimestre} data-rotulo={`${trimestre}º tri`} className={`numero-tabela ri-celula--${leitura.situacao}`}>
                            {leitura.numero === null ? (leitura.situacao === 'sem_relatorio' ? 'sem relatório' : '—') : formatarNumero(leitura.numero)}
                            {erro && <MarcaDePossivelErro erro={erro} igreja={nome} />}
                          </td>
                        })}
                        <td data-rotulo="Ano" className="numero-tabela ri-tabela__ano">{doAnoNaIgreja.numero === null ? '—' : formatarNumero(doAnoNaIgreja.numero)}</td>
                      </tr>
                    })}</tbody>
                  </table>
                </td></tr>}
              </Fragment>
            })}</tbody>
          </table>
        </div>}
  </>
}
