import { Heart, Search } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgendaService } from '../../agenda/service'
import { localDateTime, type AgendaEventEntity } from '../../agenda/types'
import { useAuthVault } from '../../auth/AuthVaultContext'
import { nomeDoCasal, pendencias, situacaoGeral, type SituacaoGeral } from '../../casamentos/core'
import { CasamentoService, eCerimonia } from '../../casamentos/service'
import { ETAPAS, ETAPA_LABELS, type CasamentoEntity, type EtapaDoCasamento } from '../../casamentos/types'
import type { ChurchEntity } from '../../district/types'
import { useReloadOnSync } from '../../sync/useReloadOnSync'

const casamentosService = new CasamentoService(); const agenda = new AgendaService()
const SITUACOES: readonly SituacaoGeral[] = ['Em andamento', 'Com pendências', 'Casamento agendado', 'Realizado', 'Cancelado']
const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('pt-BR')

export function dataLegivel(chave: string): string {
  const [ano, mes, dia] = chave.slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : ''
}

export function igrejaDoCasamento(casamento: CasamentoEntity): string | null {
  return casamento.cerimonia.igrejaId ?? casamento.igrejaPretendidaId ?? casamento.noiva.igrejaId ?? casamento.noivo.igrejaId
}

/** A aba Casamentos da Visitação. */
export function CasamentosLista({ churches }: { churches: readonly ChurchEntity[] }) {
  const { account, masterKey } = useAuthVault()
  const [casamentos, setCasamentos] = useState<CasamentoEntity[]>([])
  const [eventos, setEventos] = useState<AgendaEventEntity[]>([])
  const [busca, setBusca] = useState(''); const [igreja, setIgreja] = useState(''); const [etapa, setEtapa] = useState<EtapaDoCasamento | ''>(''); const [situacao, setSituacao] = useState<SituacaoGeral | ''>('')
  const [erro, setErro] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const [proximos, compromissos] = await Promise.all([casamentosService.listar(account.id, masterKey), agenda.listEvents(account.id, masterKey)])
      setCasamentos(proximos); setEventos(compromissos.filter(({ casamentoId }) => casamentoId)); setErro('')
    } catch (motivo) { setErro(motivo instanceof Error ? motivo.message : 'Não foi possível abrir os casamentos.') }
  }, [account, masterKey])
  useReloadOnSync(load)

  const agora = localDateTime(new Date())
  const linhas = useMemo(() => casamentos.map((casamento) => {
    const doCasamento = eventos.filter(({ casamentoId }) => casamentoId === casamento.id)
    const temCerimonia = doCasamento.some(eCerimonia)
    return {
      casamento, temCerimonia, igrejaId: igrejaDoCasamento(casamento),
      proximo: doCasamento.filter(({ endAt }) => endAt >= agora).sort((a, b) => a.startAt.localeCompare(b.startAt))[0],
      situacao: situacaoGeral(casamento, temCerimonia), pendentes: pendencias(casamento),
    }
  }), [agora, casamentos, eventos])

  const termo = semAcento(busca.trim())
  const visiveis = linhas.filter((linha) =>
    (!termo || semAcento(nomeDoCasal(linha.casamento)).includes(termo))
    && (!igreja || linha.igrejaId === igreja) && (!etapa || linha.casamento.etapa === etapa) && (!situacao || linha.situacao === situacao))
  const nomeDaIgreja = (id: string | null) => churches.find((church) => church.id === id)?.name

  return <>
    {erro && <div className="alert alert--error" role="alert">{erro}</div>}
    <div className="linha-de-busca">
      <div className="visitacao-busca">
        <Search aria-hidden="true" />
        <input type="search" className="field__input" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar casal" aria-label="Buscar casal" />
      </div>
      <Link className="botao-novo" to="/app/casamentos/novo">Novo casamento</Link>
    </div>
    <div className="filtros-casamentos">
      <label className="field"><span className="field__label">Igreja</span><select className="field__input" value={igreja} onChange={(event) => setIgreja(event.target.value)}><option value="">Todas</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label>
      <label className="field"><span className="field__label">Etapa</span><select className="field__input" value={etapa} onChange={(event) => setEtapa(event.target.value as EtapaDoCasamento | '')}><option value="">Todas</option>{ETAPAS.map((item) => <option key={item} value={item}>{ETAPA_LABELS[item]}</option>)}</select></label>
      <label className="field"><span className="field__label">Situação</span><select className="field__input" value={situacao} onChange={(event) => setSituacao(event.target.value as SituacaoGeral | '')}><option value="">Todas</option>{SITUACOES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>

    {!casamentos.length
      ? <div className="empty-state"><Heart /><strong>Nenhum casamento</strong></div>
      : !visiveis.length
        ? <div className="empty-state"><Search /><strong>Nenhum casamento com esses filtros</strong></div>
        : <ul className="lista-casamentos">{visiveis.map(({ casamento, igrejaId, proximo, situacao: estado, pendentes }) => <li key={casamento.id} className="cartao-casamento">
          <div className="cartao-casamento__topo">
            <h3>{nomeDoCasal(casamento)}</h3>
            <span className={`status-pill ${estado === 'Cancelado' ? '' : estado === 'Com pendências' ? 'status-pill--warning' : 'status-pill--success'}`}>{estado}</span>
          </div>
          <dl className="cartao-casamento__dados">
            <div><dt>Igreja</dt><dd>{nomeDaIgreja(igrejaId) ?? '—'}</dd></div>
            <div><dt>Etapa</dt><dd>{ETAPA_LABELS[casamento.etapa]}</dd></div>
            {casamento.dataPretendida && <div><dt>Data pretendida</dt><dd>{dataLegivel(casamento.dataPretendida)}</dd></div>}
            {casamento.cerimonia.data && <div><dt>Data confirmada</dt><dd>{dataLegivel(casamento.cerimonia.data)}{casamento.cerimonia.inicio ? ` · ${casamento.cerimonia.inicio}` : ''}</dd></div>}
            <div><dt>Próximo compromisso</dt><dd>{proximo ? `${proximo.title} · ${dataLegivel(proximo.startAt)} ${proximo.startAt.slice(11, 16)}` : '—'}</dd></div>
            <div><dt>Pendências</dt><dd>{pendentes.length ? `${pendentes.length} · ${pendentes[0]}` : 'Nenhuma'}</dd></div>
          </dl>
          <Link className="button button--secondary" to={`/app/casamentos/${casamento.id}`} aria-label={`Abrir acompanhamento de ${nomeDoCasal(casamento)}`}>Abrir acompanhamento</Link>
        </li>)}</ul>}
  </>
}
