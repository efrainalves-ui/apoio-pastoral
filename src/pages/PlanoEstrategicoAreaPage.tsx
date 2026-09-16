import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Minus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { SimboloDaArea } from '../components/plano/SimboloDaArea'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { anosDosRelatorios, comparar, leituraDoDistrito, rotuloCurto, rotuloCurtoDoTrimestre, type Comparacao, type Periodo } from '../integrated-report/painel'
import { rotuloDoTrimestre } from '../integrated-report/types'
import { useRelatorioIntegrado } from '../integrated-report/useRelatorioIntegrado'
import {
  TITULO_DO_PLANO, anoDeReferencia, areaPorSlug, comparacaoDaArea, evolucaoDoAno, formatarNumero, indicadoresQueCompoem,
  resultadoDaArea, variacaoDaComparacao, type AreaDoPlano,
} from '../plano-estrategico/areas'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const districts = new DistrictService()
const DISTRITO = 'distrito'
const numeroOuTraco = (numero: number | null) => numero === null ? '—' : formatarNumero(numero)

/** A variação em porcentagem: sinal, seta e cor dizem a mesma coisa. */
function Variacao({ comparacao }: { comparacao: Pick<Comparacao, 'diferenca' | 'percentual'> }) {
  const { texto, tom } = variacaoDaComparacao(comparacao)
  const Icone = tom === 'alta' ? ArrowUp : tom === 'queda' ? ArrowDown : tom === 'estavel' ? Minus : null
  return <span className={`plano-variacao plano-variacao--${tom}`}>{Icone && <Icone aria-hidden="true" />}{texto}</span>
}

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
  const [escopo, setEscopo] = useState<string>(DISTRITO)

  if (!pronto) return <div className="app-loading" role="status">Abrindo a área…</div>

  const nomeDaIgreja = (id: string) => igrejas.find((igreja) => igreja.id === id)?.name ?? 'Igreja'
  const ano = anoEscolhido ?? anoDeReferencia(relatorios, anoCorrente)
  const periodo: Periodo = { ano, trimestre }
  // O distrito continua somando as igrejas ativas; escolher uma igreja só troca o recorte.
  const igrejasDoEscopo = escopo === DISTRITO ? ativas : [escopo]
  const resultado = resultadoDaArea(relatorios, igrejasDoEscopo, area, periodo)
  const comparacao = comparacaoDaArea(relatorios, igrejasDoEscopo, area, periodo)
  const evolucao = evolucaoDoAno(relatorios, igrejasDoEscopo, area, ano)
  const trimestresComDados = evolucao.filter(({ resultado: item }) => item.numero !== null)
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

    {/* Distrito ou uma igreja: a página inteira acompanha a escolha, sem abrir outra tela. */}
    <div className="plano-escopo">
      <label className="field">
        <span className="field__label">Visualizar resultado de</span>
        <select className="field__input" value={escopo} onChange={(evento) => setEscopo(evento.target.value)}>
          <option value={DISTRITO}>Distrito — resultado geral</option>
          {igrejasEmOrdem.map((churchId) => <option key={churchId} value={churchId}>{nomeDaIgreja(churchId)}</option>)}
        </select>
      </label>
    </div>

    <section className="plano-resultado" aria-labelledby="plano-resultado-titulo">
      <h2 className="plano-resultado__titulo" id="plano-resultado-titulo">{escopo === DISTRITO ? 'Resultado do distrito' : nomeDaIgreja(escopo)}</h2>
      {resultado.numero === null
        ? <p className="plano-resultado__vazio">Sem informação neste período</p>
        : <p className="plano-resultado__numero">{formatarNumero(resultado.numero)}</p>}
      <dl className="plano-resultado__dados">
        <div><dt>Período</dt><dd>{rotuloDoPeriodo}</dd></div>
        <div><dt>{rotuloDaComparacao(comparacao.de, comparacao.para)}</dt><dd><Variacao comparacao={comparacao} /></dd></div>
      </dl>
    </section>

    {trimestresComDados.length > 0 && <Card title="Evolução durante o ano" eyebrow={String(ano)}>
      <div
        className="serie-trimestral plano-serie"
        role="img"
        aria-label={`${area.nome} em ${ano}. ${trimestresComDados.map(({ chave, resultado: item }) => `${rotuloDoTrimestre(chave)}: ${formatarNumero(item.numero ?? 0)}`).join('; ')}.`}
      >
        {trimestresComDados.map(({ chave, resultado: item }) => <div key={chave} className={`serie-trimestral__coluna ${`${ano}-${trimestre}` === chave ? 'plano-serie__coluna--escolhida' : ''}`}>
          <span className="serie-trimestral__trilho">
            <span className="serie-trimestral__barra" style={{ height: `${Math.round(((item.numero ?? 0) / maior) * 100)}%` }} />
          </span>
          <strong>{formatarNumero(item.numero ?? 0)}</strong>
          <small>{rotuloCurtoDoTrimestre(chave)}</small>
        </div>)}
      </div>
    </Card>}

    {trimestresComDados.length > 0 && <Card title="Comparação entre trimestres" eyebrow={String(ano)}>
      <div className="plano-tabela">
        <table>
          <thead><tr><th scope="col">Trimestre</th><th scope="col">Resultado</th><th scope="col">Variação</th></tr></thead>
          <tbody>{trimestresComDados.map(({ chave, resultado: item }) => {
            const indice = evolucao.findIndex((ponto) => ponto.chave === chave)
            // O primeiro trimestre do ano não tem trimestre anterior aqui: fica o traço.
            const anterior = indice > 0 ? evolucao[indice - 1]!.resultado.numero : null
            return <tr key={chave}>
              <th scope="row">{rotuloDoTrimestre(chave)}</th>
              <td>{formatarNumero(item.numero ?? 0)}</td>
              <td><Variacao comparacao={comparar(anterior, item.numero)} /></td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </Card>}

    <Card title="Indicadores que compõem o resultado" eyebrow={rotuloDoPeriodo} action={<Link className="text-link" to="/app/metas/relatorio-integrado">Relatório Integrado<ChevronRight aria-hidden="true" /></Link>}>
      {/*
        Linhas limpas: nome à esquerda, número à direita e o detalhe da área.
        Seção, pergunta do relatório, arquivos e regra de cálculo continuam no
        código e no Relatório Integrado — na tela, atrapalhavam a leitura.
      */}
      <ul className="plano-indicadores">{indicadoresQueCompoem(area).map(({ indicador, principal, recorte }) => {
        const numero = principal ? resultado.numero : leituraDoDistrito(relatorios, ativas, indicador.id, periodo).numero
        return <li key={indicador.id} className={`plano-indicador ${principal ? 'plano-indicador--principal' : ''}`}>
          <span className="plano-indicador__marca" aria-hidden="true" />
          <span className="plano-indicador__nome">{rotuloCurto(indicador)}{recorte ? ` · ${recorte}` : ''}</span>
          <span className="plano-indicador__numero">{numeroOuTraco(numero)}</span>
        </li>
      })}</ul>
    </Card>
  </div>
}
