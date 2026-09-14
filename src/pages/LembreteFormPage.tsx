import { ChevronLeft, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { AutoTextarea } from '../components/ui/AutoTextarea'
import { DistrictService } from '../district/service'
import { AREAS_DA_CENTRAL } from '../lembretes/central'
import { textoDaRepeticao } from '../lembretes/repeticao'
import { lembreteVazio, type EscopoDaEdicao, type LembreteInput } from '../lembretes/service'
import { diaDaSemana, fusoDoAparelho, partesDaData } from '../lembretes/tempo'
import { PRIORIDADES, PRIORIDADE_LABELS, type Frequencia, type LembreteEntity, type ListaDeLembretesEntity, type PrioridadeDoLembrete, type RegraDeRepeticao } from '../lembretes/types'
import { avisarAlteracaoDeLembretes, servicoDeLembretes } from '../lembretes/useCentral'
import { PeopleService } from '../people/service'

const distrito = new DistrictService()
const pessoas = new PeopleService()

type ModoDeRepeticao = 'nao' | Frequencia | 'personalizada'
const MODOS: Record<ModoDeRepeticao, string> = { nao: 'Não repetir', diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual', personalizada: 'Personalizada' }
const UNIDADES: Record<Frequencia, [string, string]> = { diaria: ['dia', 'dias'], semanal: ['semana', 'semanas'], mensal: ['mês', 'meses'], anual: ['ano', 'anos'] }
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIAS_EXTENSO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

interface Personalizada { frequencia: Frequencia; intervalo: number; diasDaSemana: number[]; diaDoMes: number }

function modoDaRegra(regra: RegraDeRepeticao | null, data: string): ModoDeRepeticao {
  if (!regra) return 'nao'
  if (regra.intervalo !== 1) return 'personalizada'
  if (regra.frequencia === 'semanal' && regra.diasDaSemana && (regra.diasDaSemana.length !== 1 || (data && regra.diasDaSemana[0] !== diaDaSemana(data)))) return 'personalizada'
  if (regra.frequencia === 'mensal' && regra.diaDoMes && data && regra.diaDoMes !== partesDaData(data)[2]) return 'personalizada'
  return regra.frequencia
}

/** A regra que o formulário descreve. Os modos prontos seguem a data escolhida. */
function regraDoFormulario(modo: ModoDeRepeticao, personalizada: Personalizada, data: string, ate: string): RegraDeRepeticao | null {
  if (modo === 'nao' || !data) return null
  const fim = ate ? { ate } : {}
  const [, , dia] = partesDaData(data)
  if (modo === 'personalizada') {
    const { frequencia, intervalo } = personalizada
    return {
      frequencia, intervalo: Math.max(1, Math.round(intervalo) || 1), ...fim,
      ...(frequencia === 'semanal' ? { diasDaSemana: personalizada.diasDaSemana.length ? [...personalizada.diasDaSemana].sort() : [diaDaSemana(data)] } : {}),
      ...(frequencia === 'mensal' ? { diaDoMes: Math.min(31, Math.max(1, personalizada.diaDoMes || dia)) } : {}),
    }
  }
  return {
    frequencia: modo, intervalo: 1, ...fim,
    ...(modo === 'semanal' ? { diasDaSemana: [diaDaSemana(data)] } : {}),
    ...(modo === 'mensal' ? { diaDoMes: dia } : {}),
  }
}

export function LembreteFormPage() {
  const { lembreteId } = useParams()
  const [parametros] = useSearchParams()
  const navigate = useNavigate()
  const { account, masterKey } = useAuthVault()
  const ocorrencia = parametros.get('ocorrencia')
  const voltar = parametros.get('voltar')?.startsWith('/app/lembretes') ? parametros.get('voltar')! : '/app/lembretes'

  const [original, setOriginal] = useState<LembreteEntity | null>(null)
  const [entrada, setEntrada] = useState<LembreteInput>(() => ({
    ...lembreteVazio(parametros.get('lista'), fusoDoAparelho()),
    data: parametros.get('data') ?? '',
    sinalizado: parametros.get('sinalizado') === '1',
    prioridade: (PRIORIDADES as readonly string[]).includes(parametros.get('prioridade') ?? '') ? parametros.get('prioridade') as PrioridadeDoLembrete : 'normal',
  }))
  const [modo, setModo] = useState<ModoDeRepeticao>('nao')
  const [personalizada, setPersonalizada] = useState<Personalizada>({ frequencia: 'semanal', intervalo: 1, diasDaSemana: [], diaDoMes: 1 })
  const [ate, setAte] = useState('')
  const [listas, setListas] = useState<ListaDeLembretesEntity[]>([])
  const [igrejas, setIgrejas] = useState<Array<{ id: string; name: string }>>([])
  const [membros, setMembros] = useState<Array<{ id: string; name: string }>>([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [perguntandoEscopo, setPerguntandoEscopo] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    const [todasAsListas, district, todasAsPessoas, lembretes] = await Promise.all([
      servicoDeLembretes.listas(account.id, masterKey), distrito.getDistrict(account.id, masterKey),
      pessoas.listPeople(account.id, masterKey), lembreteId ? servicoDeLembretes.lembretes(account.id, masterKey) : Promise.resolve([]),
    ])
    setListas(todasAsListas)
    setIgrejas(district ? (await distrito.listChurches(account.id, masterKey, district.id)).map(({ id, name }) => ({ id, name })) : [])
    setMembros(todasAsPessoas.map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
    if (!lembreteId) return
    const atual = lembretes.find(({ id }) => id === lembreteId)
    if (!atual) { setErro('Lembrete não encontrado.'); return }
    setOriginal(atual)
    const alteracao = ocorrencia ? atual.ocorrencias[ocorrencia]?.alteracao ?? {} : {}
    const dataDaTela = ocorrencia ? alteracao.data ?? ocorrencia : atual.data
    setEntrada({
      titulo: alteracao.titulo ?? atual.titulo, observacao: atual.observacao, listaId: atual.listaId, data: dataDaTela, hora: alteracao.hora ?? atual.hora,
      fuso: atual.fuso, prioridade: alteracao.prioridade ?? atual.prioridade, sinalizado: alteracao.sinalizado ?? atual.sinalizado,
      repeticao: atual.repeticao, notificar: atual.notificar, relacionado: atual.relacionado,
    })
    setModo(modoDaRegra(atual.repeticao, atual.data))
    setAte(atual.repeticao?.ate ?? '')
    if (atual.repeticao) {
      setPersonalizada({
        frequencia: atual.repeticao.frequencia, intervalo: atual.repeticao.intervalo,
        diasDaSemana: atual.repeticao.diasDaSemana ?? (atual.data ? [diaDaSemana(atual.data)] : []),
        diaDoMes: atual.repeticao.diaDoMes ?? (atual.data ? partesDaData(atual.data)[2] : 1),
      })
    }
  }, [account, masterKey, lembreteId, ocorrencia])

  useEffect(() => { void carregar().catch((falha: unknown) => setErro(falha instanceof Error ? falha.message : 'Não foi possível abrir o lembrete.')) }, [carregar])

  const mudar = <K extends keyof LembreteInput>(campo: K, valor: LembreteInput[K]) => setEntrada((atual) => ({ ...atual, [campo]: valor }))
  const regra = regraDoFormulario(modo, personalizada, entrada.data, ate)
  const serie = Boolean(original?.repeticao && ocorrencia)

  const salvar = async (escopo: EscopoDaEdicao) => {
    if (!account || !masterKey) return
    setSalvando(true)
    setErro('')
    try {
      let dados: LembreteInput = { ...entrada, hora: entrada.data ? entrada.hora : '', repeticao: regra, notificar: entrada.notificar && Boolean(entrada.data && entrada.hora) }
      // "Toda a série" sem mudar a data mantém o início da série, e não a data desta ocorrência.
      if (original && serie && escopo === 'serie' && ocorrencia && entrada.data === (original.ocorrencias[ocorrencia]?.alteracao?.data ?? ocorrencia)) dados = { ...dados, data: original.data }
      if (original) await servicoDeLembretes.editar(account.id, masterKey, original.id, ocorrencia, escopo, dados)
      else await servicoDeLembretes.salvarLembrete(account.id, masterKey, dados)
      avisarAlteracaoDeLembretes()
      void navigate(voltar)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar.')
      setSalvando(false)
      setPerguntandoEscopo(false)
    }
  }

  const excluir = async () => {
    if (!account || !masterKey || !original) return
    await servicoDeLembretes.excluirLembrete(account.id, masterKey, original.id)
    avisarAlteracaoDeLembretes()
    void navigate(voltar)
  }

  const listasVisiveis = listas.filter(({ arquivada, id }) => !arquivada || id === entrada.listaId)

  return (
    <div className="page-stack lembrete-form-page">
      <Link to={voltar} className="lembretes-voltar"><ChevronLeft aria-hidden="true" />Voltar</Link>
      <header className="lembretes-topo"><h1>{lembreteId ? 'Editar lembrete' : 'Novo lembrete'}</h1></header>
      {erro && <div className="alert alert--error" role="alert">{erro}</div>}
      <form className="lembrete-form" onSubmit={(evento) => { evento.preventDefault(); if (serie) setPerguntandoEscopo(true); else void salvar('serie') }}>
        <label className="field lembrete-form__titulo">
          <span className="field__label">O que devo lembrar?</span>
          <input className="field__input" name="titulo" required maxLength={200} autoFocus={!lembreteId} value={entrada.titulo} onChange={(evento) => mudar('titulo', evento.target.value)} />
        </label>

        <div className="lembrete-form__linha">
          <label className="field"><span className="field__label">Data</span><input className="field__input" type="date" name="data" value={entrada.data} onChange={(evento) => mudar('data', evento.target.value)} /></label>
          <label className="field"><span className="field__label">Horário</span><input className="field__input" type="time" name="hora" disabled={!entrada.data} value={entrada.hora} onChange={(evento) => mudar('hora', evento.target.value)} /></label>
        </div>

        <label className="field"><span className="field__label">Lista</span>
          <select className="field__input" name="lista" value={entrada.listaId ?? ''} onChange={(evento) => mudar('listaId', evento.target.value || null)}>
            <option value="">Sem lista</option>
            {listasVisiveis.map((lista) => <option key={lista.id} value={lista.id}>{lista.nome}</option>)}
          </select>
        </label>

        <fieldset className="lembrete-form__prioridade">
          <legend className="field__label">Prioridade</legend>
          <div className="segmented">
            {PRIORIDADES.map((prioridade) => (
              <label key={prioridade} className={entrada.prioridade === prioridade ? 'active' : ''}>
                <input type="radio" name="prioridade" value={prioridade} checked={entrada.prioridade === prioridade} onChange={() => mudar('prioridade', prioridade)} />
                {PRIORIDADE_LABELS[prioridade]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="confirmation-check"><input type="checkbox" name="sinalizado" checked={entrada.sinalizado} onChange={(evento) => mudar('sinalizado', evento.target.checked)} /><span><strong>Sinalizado</strong></span></label>

        <fieldset className="lembrete-form__repeticao">
          <legend className="field__label">Repetição</legend>
          <select className="field__input" aria-label="Repetição" name="repeticao" value={modo} disabled={!entrada.data} onChange={(evento) => setModo(evento.target.value as ModoDeRepeticao)}>
            {(Object.keys(MODOS) as ModoDeRepeticao[]).map((valor) => <option key={valor} value={valor}>{MODOS[valor]}</option>)}
          </select>
          {modo === 'personalizada' && (
            <div className="lembrete-form__personalizada">
              <div className="lembrete-form__linha">
                <label className="field"><span className="field__label">A cada</span><input className="field__input" type="number" min={1} max={99} value={personalizada.intervalo} onChange={(evento) => setPersonalizada((atual) => ({ ...atual, intervalo: Number(evento.target.value) }))} /></label>
                <label className="field"><span className="field__label">Período</span>
                  <select className="field__input" value={personalizada.frequencia} onChange={(evento) => setPersonalizada((atual) => ({ ...atual, frequencia: evento.target.value as Frequencia }))}>
                    {(Object.keys(UNIDADES) as Frequencia[]).map((frequencia) => <option key={frequencia} value={frequencia}>{UNIDADES[frequencia][personalizada.intervalo === 1 ? 0 : 1]}</option>)}
                  </select>
                </label>
              </div>
              {personalizada.frequencia === 'semanal' && (
                <div className="lembrete-form__dias" role="group" aria-label="Dias da semana">
                  {DIAS.map((dia, indice) => (
                    <label key={dia} className={personalizada.diasDaSemana.includes(indice) ? 'active' : ''}>
                      <input type="checkbox" aria-label={DIAS_EXTENSO[indice]} checked={personalizada.diasDaSemana.includes(indice)} onChange={(evento) => setPersonalizada((atual) => ({ ...atual, diasDaSemana: evento.target.checked ? [...atual.diasDaSemana, indice] : atual.diasDaSemana.filter((valor) => valor !== indice) }))} />
                      <span aria-hidden="true">{dia}</span>
                    </label>
                  ))}
                </div>
              )}
              {personalizada.frequencia === 'mensal' && (
                <label className="field"><span className="field__label">Dia do mês</span><input className="field__input" type="number" min={1} max={31} value={personalizada.diaDoMes} onChange={(evento) => setPersonalizada((atual) => ({ ...atual, diaDoMes: Number(evento.target.value) }))} /></label>
              )}
            </div>
          )}
          {regra && (
            <>
              <p className="lembrete-form__resumo" aria-live="polite">{textoDaRepeticao(regra, entrada.data)}</p>
              <label className="field"><span className="field__label">Termina em</span><input className="field__input" type="date" min={entrada.data} value={ate} onChange={(evento) => setAte(evento.target.value)} /></label>
            </>
          )}
        </fieldset>

        <label className="confirmation-check">
          <input type="checkbox" name="notificar" disabled={!entrada.data || !entrada.hora} checked={entrada.notificar && Boolean(entrada.data && entrada.hora)} onChange={(evento) => mudar('notificar', evento.target.checked)} />
          <span><strong>Notificar no horário</strong></span>
        </label>

        <details className="lembrete-form__mais" open={Boolean(entrada.relacionado.area || entrada.relacionado.churchId || entrada.relacionado.personId || entrada.observacao)}>
          <summary>Área, igreja, pessoa e observação</summary>
          <label className="field"><span className="field__label">Área</span>
            <select className="field__input" value={entrada.relacionado.area ?? ''} onChange={(evento) => mudar('relacionado', { ...entrada.relacionado, area: evento.target.value || null })}>
              <option value="">Nenhuma</option>
              {Object.entries(AREAS_DA_CENTRAL).map(([valor, { rotulo }]) => <option key={valor} value={valor}>{rotulo}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Igreja</span>
            <select className="field__input" value={entrada.relacionado.churchId ?? ''} onChange={(evento) => mudar('relacionado', { ...entrada.relacionado, churchId: evento.target.value || null })}>
              <option value="">Nenhuma</option>
              {igrejas.map((igreja) => <option key={igreja.id} value={igreja.id}>{igreja.name}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Pessoa</span>
            <select className="field__input" value={entrada.relacionado.personId ?? ''} onChange={(evento) => mudar('relacionado', { ...entrada.relacionado, personId: evento.target.value || null })}>
              <option value="">Nenhuma</option>
              {membros.map((membro) => <option key={membro.id} value={membro.id}>{membro.name}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Observação</span><AutoTextarea className="field__input" minRows={2} maxRows={8} value={entrada.observacao} onChange={(evento) => mudar('observacao', evento.target.value)} /></label>
        </details>

        <div className="form-actions form-actions--sticky">
          {original && <button type="button" className="button button--quiet" onClick={() => setConfirmandoExclusao(true)}><Trash2 aria-hidden="true" /><span>Excluir</span></button>}
          <button type="submit" className="button button--primary" disabled={salvando}><span>Salvar</span></button>
        </div>
      </form>

      {perguntandoEscopo && (
        <div className="folha" role="dialog" aria-modal="true" aria-label="Aplicar alteração">
          <div className="folha__fundo" aria-hidden="true" onClick={() => setPerguntandoEscopo(false)} />
          <div className="folha__corpo lembrete-menu__acoes">
            <div className="folha__topo"><span className="folha__espaco" /><strong>Aplicar a</strong><button type="button" className="icon-button" aria-label="Fechar" onClick={() => setPerguntandoEscopo(false)}><X aria-hidden="true" /></button></div>
            <button type="button" autoFocus disabled={salvando} onClick={() => { void salvar('esta') }}>Somente esta</button>
            <button type="button" disabled={salvando} onClick={() => { void salvar('proximas') }}>Esta e as próximas</button>
            <button type="button" disabled={salvando} onClick={() => { void salvar('serie') }}>Toda a série</button>
          </div>
        </div>
      )}
      {confirmandoExclusao && (
        <div className="folha" role="dialog" aria-modal="true" aria-label="Excluir lembrete">
          <div className="folha__fundo" aria-hidden="true" onClick={() => setConfirmandoExclusao(false)} />
          <div className="folha__corpo lembrete-menu__escolha">
            <div className="folha__topo"><span className="folha__espaco" /><strong>{original?.repeticao ? 'Excluir a série inteira?' : 'Excluir este lembrete?'}</strong><button type="button" className="icon-button" aria-label="Fechar" onClick={() => setConfirmandoExclusao(false)}><X aria-hidden="true" /></button></div>
            <button type="button" className="button button--danger" autoFocus onClick={() => { void excluir() }}><Trash2 aria-hidden="true" /><span>Excluir</span></button>
            <button type="button" className="button button--secondary" onClick={() => setConfirmandoExclusao(false)}><span>Cancelar</span></button>
          </div>
        </div>
      )}
    </div>
  )
}
