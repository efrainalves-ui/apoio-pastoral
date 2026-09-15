import { CheckCircle2, ClipboardList, Megaphone } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { EvangelismCampaignEntity } from '../../evangelism/types'
import { nomeDaCampanhaDoRelatorio } from '../../integrated-report/campanhas'
import type { AcoesDaIgreja, CampanhasParaRegistrar } from '../../integrated-report/ligacoes'
import { rotuloCurtoDoTrimestre } from '../../integrated-report/painel'
import { rotuloDoTrimestre } from '../../integrated-report/types'
import { Button } from '../ui/Button'
import { formatarNumero } from './Graficos'

export interface CampanhasCadastradas { churchId: string; trimestre: string; campanhas: EvangelismCampaignEntity[] }

interface Props {
  acoes: readonly AcoesDaIgreja[]
  nomeDaIgreja: (churchId: string) => string
  /** Quantas campanhas daquela igreja e trimestre já nasceram do relatório: a numeração continua delas. */
  jaDoRelatorio: (churchId: string, trimestre: string) => number
  cadastradasAgora: readonly CampanhasCadastradas[]
  busy: boolean
  aoCadastrar: (linha: CampanhasParaRegistrar) => Promise<void>
  abertas?: boolean
}

const contagem = (numero: number, singular: string, plural: string) => `${numero} ${numero === 1 ? singular : plural}`

export function resumoDasAcoes(acao: AcoesDaIgreja): string {
  return [
    acao.campanhasFaltando ? contagem(acao.campanhasFaltando, 'campanha para cadastrar', 'campanhas para cadastrar') : '',
    acao.cadastrosFaltando ? contagem(acao.cadastrosFaltando, 'cadastro para completar', 'cadastros para completar') : '',
  ].filter(Boolean).join(' · ')
}

/**
 * O que o relatório informa e pode ser completado em outro módulo, por igreja.
 *
 * Cada igreja é uma dobra fechada com a conta total; os botões só aparecem ao
 * abrir. O valor do relatório já vale — nada aqui pede conferência.
 */
export function AcoesDeCadastro({ acoes, nomeDaIgreja, jaDoRelatorio, cadastradasAgora, busy, aoCadastrar, abertas = false }: Props) {
  const [confirmando, setConfirmando] = useState('')

  async function confirmar(linha: CampanhasParaRegistrar) {
    await aoCadastrar(linha)
    setConfirmando('')
  }

  return <div className="ri-acoes">
    {cadastradasAgora.map((grupo) => <div className="ri-cadastradas" role="status" key={`${grupo.churchId}|${grupo.trimestre}`}>
      <CheckCircle2 aria-hidden="true" />
      <div>
        <strong>{grupo.campanhas.length === 1 ? 'Campanha cadastrada no Evangelismo' : `${grupo.campanhas.length} campanhas cadastradas no Evangelismo`}</strong>
        <ul>{grupo.campanhas.map((campanha) => <li key={campanha.id}>
          <span className="ri-cadastradas__nome">{campanha.name}<small>{nomeDaIgreja(grupo.churchId)} · {rotuloDoTrimestre(grupo.trimestre)}</small></span>
          <span className="status-pill status-pill--success">Cadastrada</span>
          <span className="ri-cadastradas__links">
            <Link className="text-link" to={`/app/evangelismo/${campanha.id}`}>Abrir no Evangelismo</Link>
            <Link className="text-link" to={`/app/evangelismo/${campanha.id}?editar=1`}>Editar informações</Link>
          </span>
        </li>)}</ul>
      </div>
    </div>)}

    {acoes.length === 0 && cadastradasAgora.length === 0 && <p className="ri-vazio"><CheckCircle2 aria-hidden="true" size={18} />Nenhuma ação de cadastro</p>}

    {acoes.map((acao) => {
      const igreja = nomeDaIgreja(acao.churchId)
      return <details className="ri-dobra" key={acao.churchId} open={abertas}>
        <summary>
          <span><strong>{igreja}</strong><small>{resumoDasAcoes(acao)}</small></span>
          <span className="ri-dobra__total" aria-hidden="true">{acao.campanhasFaltando + acao.cadastrosFaltando}</span>
        </summary>
        <div className="ri-dobra__corpo">
          {acao.campanhas.map((linha) => {
            const chave = `${linha.churchId}|${linha.trimestre}`
            const inicio = jaDoRelatorio(linha.churchId, linha.trimestre)
            const nomes = Array.from({ length: linha.faltam }, (_, posicao) => nomeDaCampanhaDoRelatorio(igreja, inicio + posicao + 1, linha.declaradas, linha.semanaSanta))
            return <div className="ri-acao" key={chave}>
              <Megaphone className="ri-acao__icone" aria-hidden="true" />
              <span className="ri-acao__texto">
                <strong>{igreja} · {rotuloDoTrimestre(linha.trimestre)}</strong>
                <small>{linha.faltam === 1 ? '1 campanha informada e ainda não cadastrada' : `${linha.faltam} campanhas informadas e ainda não cadastradas`}</small>
              </span>
              {confirmando === chave
                ? <div className="ri-confirmacao" role="group" aria-label={`Cadastrar campanha de ${igreja}`}>
                    <dl>
                      <div><dt>Igreja</dt><dd>{igreja}</dd></div>
                      <div><dt>Período</dt><dd>{rotuloDoTrimestre(linha.trimestre)}</dd></div>
                      <div><dt>{nomes.length === 1 ? 'Nome' : 'Nomes'}</dt><dd>{nomes.join(' · ')}</dd></div>
                      <div><dt>Origem</dt><dd>Relatório Integrado</dd></div>
                    </dl>
                    <div className="ri-confirmacao__acoes">
                      <Button disabled={busy} onClick={() => void confirmar(linha)}>Confirmar cadastro</Button>
                      <Button variant="quiet" onClick={() => setConfirmando('')}>Cancelar</Button>
                    </div>
                  </div>
                : <Button variant="secondary" onClick={() => setConfirmando(chave)}>{linha.faltam === 1 ? 'Cadastrar campanha' : 'Cadastrar campanhas'}</Button>}
            </div>
          })}
          {acao.cadastros.map((linha) => <div className="ri-acao" key={linha.indicadorId}>
            <ClipboardList className="ri-acao__icone" aria-hidden="true" />
            <span className="ri-acao__texto">
              <strong>{linha.rotulo}</strong>
              <small>Relatório ({rotuloCurtoDoTrimestre(linha.trimestre)}): {formatarNumero(linha.relatorio)} · Cadastro: {formatarNumero(linha.cadastro)}</small>
            </span>
            <span className="ri-acao__falta">{contagem(linha.faltam, 'para cadastrar', 'para cadastrar')}</span>
            <Link className="button button--quiet" to={linha.para}>Completar cadastro</Link>
          </div>)}
        </div>
      </details>
    })}
  </div>
}
