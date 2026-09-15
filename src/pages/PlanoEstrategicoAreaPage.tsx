import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { SimboloDaArea } from '../components/plano/SimboloDaArea'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import {
  ROTULO_DA_SITUACAO, anosDosRelatorios, comparar, coberturaDoPeriodo, leituraDoDistrito, rotuloCurto, rotuloCurtoDoTrimestre,
  trimestreAnterior, type Periodo,
} from '../integrated-report/painel'
import { rotuloDoTrimestre } from '../integrated-report/types'
import { useRelatorioIntegrado } from '../integrated-report/useRelatorioIntegrado'
import {
  TITULO_DO_PLANO, anoDeReferencia, areaPorSlug, comparacaoDaArea, evolucaoDoAno, formatarNumero, indicadoresQueCompoem,
  leituraPrincipalDaIgreja, origensNoPeriodo, resultadoDaArea, textoDaDiferenca, type AreaDoPlano,
} from '../plano-estrategico/areas'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const districts = new DistrictService()
const numeroOuTraco = (numero: number | null) => numero === null ? '—' : formatarNumero(numero)

/** "3º tri → 4º tri", ou com o ano quando a comparação atravessa o ano. */
function rotuloDaComparacao(de: string | null, para: string | null): string {
  if (!de || !para) return 'Comparação'
  const mesmoAno = de.slice(0, 4) === para.slice(0, 4)
  return mesmoAno ? `${rotuloCurtoDoTrimestre(de)} → ${rotuloCurtoDoTrimestre(para)}` : `${rotuloDoTrimestre(de)} → ${rotuloDoTrimestre(para)}`
}

export function PlanoEstrategicoAreaPage() {
  const { area: slug } = useParams()
  const area = areaPorSlug(slug ?? '')
  if (!area) return <Navigate to="/app" replace />
  return <DetalheDaArea key={area.slug} area={area} />
}

function DetalheDaArea({ area }: { area: AreaDoPlano }) {
  const { account, masterKey } = useAuthVault()
  const { relatorios, ativas, pronto } = useRelatorioIntegrado()
  const [igrejas, setIgrejas] = useState<ChurchEntity[]>([])
  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const district = await districts.getDistrict(account.id, masterKey)
      setIgrejas(district ? await districts.listChurches(account.id, masterKey, district.id) : [])
    } catch { setIgrejas([]) }
  }, [account, masterKey])
  useReloadOnSync(carregar)
  const anoCorrente = useMemo(() => new Date().getFullYear(), [])
  const [anoEscolhido, setAnoEscolhido] = useState<number | null>(null)
  const [trimestre, setTrimestre] = useState<number | null>(null)

  if (!pronto) return <div className="app-loading" role="status">Abrindo a área…</div>

  const nomeDaIgreja = (id: string) => igrejas.find((igreja) => igreja.id === id)?.name ?? 'Igreja'
  const ano = anoEscolhido ?? anoDeReferencia(relatorios, anoCorrente)
  const periodo: Periodo = { ano, trimestre }
  const resultado = resultadoDaArea(relatorios, ativas, area, periodo)
  const comparacao = comparacaoDaArea(relatorios, ativas, area, periodo)
  const evolucao = evolucaoDoAno(relatorios, ativas, area, ano)
  const cobertura = coberturaDoPeriodo(relatorios, ativas, periodo)
  const maior = Math.max(1, ...evolucao.map(({ resultado: item }) => item.numero ?? 0))
  const rotuloDoPeriodo = trimestre === null ? `Ano de ${ano}` : rotuloDoTrimestre(`${ano}-${trimestre}`)
  const porNome = (a: string, b: string) => nomeDaIgreja(a).localeCompare(nomeDaIgreja(b), 'pt-BR')
  const igrejasEmOrdem = [...ativas].sort(porNome)

  return <div className={`page-stack plano-area-page area--${area.slug}`}>
    <Link className="text-link back-link" to="/app"><ArrowLeft />Voltar ao início</Link>
    <header className="plano-area-hero">
      <SimboloDaArea simbolo={area.simbolo} />
      <div>
        <p className="eyebrow">{TITULO_DO_PLANO}</p>
        <h1>{area.nome}</h1>
        <p className="plano-area-hero__texto">{area.explicacao}</p>
      </div>
    </header>

    <div className="plano-periodo">
      <label className="field">
        <span className="field__label">Ano</span>
        <select className="field__input" value={ano} onChange={(evento) => setAnoEscolhido(Number(evento.target.value))}>
          {anosDosRelatorios(relatorios, anoCorrente).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <div className="plano-periodo__abas" role="group" aria-label="Período">
        {[null, 1, 2, 3, 4].map((opcao) => <button
          key={opcao ?? 'ano'}
          type="button"
          aria-pressed={trimestre === opcao}
          className={`plano-periodo__aba ${trimestre === opcao ? 'plano-periodo__aba--ativa' : ''}`}
          onClick={() => setTrimestre(opcao)}
        >{opcao === null ? 'Ano' : `${opcao}º tri`}</button>)}
      </div>
    </div>

    <section className="card plano-distrito" aria-labelledby="plano-distrito-titulo">
      <h2 className="card__title" id="plano-distrito-titulo">Resultado do distrito</h2>
      <p className="plano-distrito__rotulo">{area.principal.rotulo}</p>
      <p className="plano-distrito__numero">{numeroOuTraco(resultado.numero)}</p>
      <dl className="plano-distrito__dados">
        <div><dt>Período</dt><dd>{rotuloDoPeriodo}</dd></div>
        <div><dt>Igrejas que informaram</dt><dd>{resultado.informaram} de {ativas.length}</dd></div>
        <div><dt>{rotuloDaComparacao(comparacao.de, comparacao.para)}</dt><dd className={`plano-tendencia plano-tendencia--${comparacao.tendencia}`}>{textoDaDiferenca(comparacao.diferenca, comparacao.percentual)}</dd></div>
      </dl>
    </section>

    <Card title="Evolução durante o ano" eyebrow={String(ano)}>
      <div
        className="serie-trimestral plano-serie"
        role="img"
        aria-label={`${area.principal.rotulo} em ${ano}. ${evolucao.map(({ chave, resultado: item }) => `${rotuloDoTrimestre(chave)}: ${item.numero === null ? 'sem informação' : formatarNumero(item.numero)}`).join('; ')}.`}
      >
        {evolucao.map(({ chave, resultado: item }, indice) => <div key={chave} className={`serie-trimestral__coluna ${trimestre === indice + 1 ? 'plano-serie__coluna--escolhida' : ''}`}>
          <span className="serie-trimestral__trilho">
            {item.numero === null
              ? <span className="serie-trimestral__vazio" />
              : <span className="serie-trimestral__barra" style={{ height: `${Math.round((item.numero / maior) * 100)}%` }} />}
          </span>
          <strong>{numeroOuTraco(item.numero)}</strong>
          <small>{rotuloCurtoDoTrimestre(chave)}</small>
        </div>)}
      </div>
    </Card>

    <Card title="Comparação entre trimestres" eyebrow={String(ano)}>
      <div className="plano-tabela">
        <table>
          <thead><tr><th scope="col">Trimestre</th><th scope="col">Resultado</th><th scope="col">Diferença</th><th scope="col">Igrejas que informaram</th></tr></thead>
          <tbody>{evolucao.map(({ chave, resultado: item }, indice) => {
            const anterior = indice === 0 ? resultadoDaArea(relatorios, ativas, area, trimestreAnterior(ano, 1)) : evolucao[indice - 1]!.resultado
            const diferenca = comparar(anterior.numero, item.numero)
            return <tr key={chave}>
              <th scope="row">{rotuloDoTrimestre(chave)}</th>
              <td>{numeroOuTraco(item.numero)}</td>
              <td>{textoDaDiferenca(diferenca.diferenca, diferenca.percentual, '—')}</td>
              <td>{item.informaram} de {ativas.length}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </Card>

    <Card title="Resultado por igreja" eyebrow={rotuloDoPeriodo} id="igrejas">
      {!igrejasEmOrdem.length
        ? <div className="empty-state compact-empty"><strong>Nenhuma igreja ativa no distrito</strong></div>
        : <div className="plano-tabela">
          <table>
            <thead><tr><th scope="col">Igreja</th><th scope="col">Resultado</th><th scope="col">{rotuloDaComparacao(comparacao.de, comparacao.para)}</th><th scope="col">Situação</th></tr></thead>
            <tbody>{igrejasEmOrdem.map((churchId) => {
              const leitura = leituraPrincipalDaIgreja(relatorios, churchId, area, periodo)
              const daIgreja = comparacaoDaArea(relatorios, [churchId], area, periodo)
              return <tr key={churchId}>
                <th scope="row">{nomeDaIgreja(churchId)}</th>
                <td>{numeroOuTraco(leitura.numero)}</td>
                <td>{textoDaDiferenca(daIgreja.diferenca, daIgreja.percentual, '—')}</td>
                <td><span className={`plano-situacao plano-situacao--${leitura.situacao}`}>{ROTULO_DA_SITUACAO[leitura.situacao]}</span></td>
              </tr>
            })}</tbody>
          </table>
        </div>}
    </Card>

    <Card title="Igrejas que responderam" eyebrow={rotuloDoPeriodo}>
      <div className="plano-cobertura">
        <section aria-labelledby="plano-responderam">
          <h3 id="plano-responderam">Responderam ({cobertura.responderam.length})</h3>
          {cobertura.responderam.length ? <ul>{[...cobertura.responderam].sort(porNome).map((id) => <li key={id}>{nomeDaIgreja(id)}</li>)}</ul> : <p className="muted">Nenhuma</p>}
        </section>
        <section aria-labelledby="plano-nao-responderam">
          <h3 id="plano-nao-responderam">Não responderam ({cobertura.naoResponderam.length})</h3>
          {cobertura.naoResponderam.length ? <ul>{[...cobertura.naoResponderam].sort(porNome).map((id) => <li key={id}>{nomeDaIgreja(id)}</li>)}</ul> : <p className="muted">Nenhuma</p>}
        </section>
      </div>
    </Card>

    <Card title="Indicadores que compõem o resultado" eyebrow={rotuloDoPeriodo} action={<Link className="text-link" to="/app/metas/relatorio-integrado">Relatório Integrado<ChevronRight aria-hidden="true" /></Link>}>
      <ul className="plano-indicadores">{indicadoresQueCompoem(area).map(({ indicador, principal, recorte }) => {
        const numero = principal ? resultado.numero : leituraDoDistrito(relatorios, ativas, indicador.id, periodo).numero
        const origens = origensNoPeriodo(relatorios, ativas, indicador.id, periodo)
        return <li key={indicador.id} className={`plano-indicador ${principal ? 'plano-indicador--principal' : ''}`}>
          <div className="plano-indicador__cabeca">
            <span className="plano-indicador__marca" aria-hidden="true" />
            <strong>{principal ? area.principal.rotulo : rotuloCurto(indicador)}</strong>
            <span className="plano-indicador__numero">{numeroOuTraco(numero)}</span>
          </div>
          <dl className="plano-indicador__origem">
            <div><dt>Seção</dt><dd>{indicador.secao}</dd></div>
            <div><dt>Pergunta</dt><dd>{indicador.rotulo}{recorte ? ` · ${recorte}` : ''}</dd></div>
            <div><dt>Cálculo</dt><dd>{indicador.tratamento === 'somar' ? 'Soma das igrejas; no ano, soma dos trimestres' : 'Soma das igrejas; no ano, último trimestre informado de cada igreja'}</dd></div>
            <div><dt>Arquivos</dt><dd>{origens.length
              ? origens.map((origem) => `${origem.arquivo} · ${rotuloCurtoDoTrimestre(origem.trimestre)} · ${origem.igrejas} igreja(s)${origem.paginas.length ? ` · pág. ${origem.paginas.join(', ')}` : ''}`).join('; ')
              : 'Nenhum no período'}</dd></div>
          </dl>
        </li>
      })}</ul>
    </Card>
  </div>
}
