import { X } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useId, useMemo, useState } from 'react'
import { encontroComAlcance, encontroComFormato, encontroComPublico } from '../../agenda/detalhes'
import {
  PUBLICO_DISTRITAL_LABELS, type AgendaEventInput, type AlcanceDoEncontro, type DetalhesDoEncontro,
  type FormatoDoEncontro, type PublicoDistrital,
} from '../../agenda/types'
import type { ChurchEntity } from '../../district/types'
import { COMMON_OFFICES } from '../../nominations/core'
import { Field } from '../ui/Field'

const semAcento = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')

/** Os departamentos da igreja, tirados dos cargos de nomeação. */
export const DEPARTAMENTOS: readonly string[] = [...new Set(COMMON_OFFICES.map(({ area }) => area))]
  .filter((area) => area !== 'Anciãos')
  .sort((a, b) => a.localeCompare(b, 'pt-BR'))

/** Uma escolha entre poucas opções, como botões de rádio: o teclado anda com as setas. */
export function Escolha<T extends string>({ rotulo, nome, opcoes, valor, onChange, obrigatorio = false }: {
  rotulo: string
  nome: string
  opcoes: ReadonlyArray<{ valor: T; rotulo: string }>
  valor: T | null | undefined
  onChange: (valor: T) => void
  obrigatorio?: boolean
}) {
  return (
    <fieldset className="escolha-agenda">
      <legend>{rotulo}</legend>
      <div className="escolha-agenda__opcoes">
        {opcoes.map((opcao, indice) => (
          <label key={opcao.valor} className={valor === opcao.valor ? 'ativa' : ''}>
            <input type="radio" name={nome} value={opcao.valor} checked={valor === opcao.valor} required={obrigatorio && indice === 0} onChange={() => onChange(opcao.valor)} />
            <span>{opcao.rotulo}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const SIM_NAO = [{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }] as const

export function SimNao({ rotulo, nome, valor, onChange }: { rotulo: string; nome: string; valor: boolean | null; onChange: (valor: boolean) => void }) {
  return <Escolha rotulo={rotulo} nome={nome} opcoes={SIM_NAO} valor={valor === null ? null : valor ? 'sim' : 'nao'} onChange={(escolha) => onChange(escolha === 'sim')} />
}

export interface OpcaoDeBusca { id: string; nome: string; detalhe?: string }

/**
 * Busca por nome, com uma ou várias escolhas.
 *
 * Uma lista de caixas com o distrito inteiro não serve a quem procura uma
 * pessoa: aqui se digita, as setas percorrem o que sobrou e Enter escolhe.
 */
export function BuscaDeNomes({ rotulo, opcoes, selecionados, onEscolher, onRemover, multiplo = false, rotuloDoEscolhido, marca }: {
  rotulo: string
  opcoes: readonly OpcaoDeBusca[]
  selecionados: readonly string[]
  onEscolher: (id: string) => void
  onRemover: (id: string) => void
  multiplo?: boolean
  rotuloDoEscolhido?: (id: string) => string
  marca?: (id: string) => ReactNode
}) {
  const id = useId()
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState(false)
  const [ativa, setAtiva] = useState(0)
  const restantes = useMemo(() => {
    const termo = semAcento(busca.trim())
    return opcoes
      .filter((opcao) => !selecionados.includes(opcao.id))
      .filter((opcao) => !termo || semAcento(opcao.nome).includes(termo))
      .slice(0, 30)
  }, [busca, opcoes, selecionados])
  const nomeDe = (escolhido: string) => rotuloDoEscolhido?.(escolhido) ?? opcoes.find((opcao) => opcao.id === escolhido)?.nome ?? escolhido

  function escolher(opcao: OpcaoDeBusca) {
    onEscolher(opcao.id)
    setBusca('')
    setAtiva(0)
    setAberta(multiplo)
  }

  function teclado(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setAberta(true); setAtiva((atual) => Math.min(atual + 1, restantes.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setAtiva((atual) => Math.max(atual - 1, 0)) }
    if (event.key === 'Enter' && aberta && restantes[ativa]) { event.preventDefault(); escolher(restantes[ativa]) }
    if (event.key === 'Escape') setAberta(false)
  }

  const mostrarLista = aberta && restantes.length > 0
  return (
    <div className="busca-nomes">
      <label className="field" htmlFor={`${id}-busca`}>
        <span className="field__label">{rotulo}</span>
        <input
          id={`${id}-busca`} className="field__input" role="combobox" autoComplete="off"
          aria-expanded={mostrarLista} aria-controls={`${id}-lista`} aria-autocomplete="list"
          aria-activedescendant={mostrarLista && restantes[ativa] ? `${id}-${restantes[ativa].id}` : undefined}
          value={busca} placeholder="Buscar pelo nome"
          onChange={(event) => { setBusca(event.target.value); setAberta(true); setAtiva(0) }}
          onFocus={() => setAberta(true)} onBlur={() => setAberta(false)} onKeyDown={teclado}
        />
      </label>
      {mostrarLista && (
        <ul className="busca-nomes__lista" id={`${id}-lista`} role="listbox" aria-label={rotulo}>
          {restantes.map((opcao, indice) => (
            <li
              key={opcao.id} id={`${id}-${opcao.id}`} role="option" aria-selected={indice === ativa}
              className={indice === ativa ? 'ativa' : ''}
              onMouseDown={(event) => { event.preventDefault(); escolher(opcao) }}
            >
              <span>{opcao.nome}</span>{opcao.detalhe && <small>{opcao.detalhe}</small>}
            </li>
          ))}
        </ul>
      )}
      {selecionados.length > 0 && (
        <ul className="busca-nomes__escolhidos" aria-label={`${rotulo}: escolhidos`}>
          {selecionados.map((escolhido) => (
            <li key={escolhido}>
              <span>{nomeDe(escolhido)}</span>
              {marca?.(escolhido)}
              <button type="button" className="icon-button" aria-label={`Remover ${nomeDe(escolhido)}`} onClick={() => onRemover(escolhido)}><X /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const FORMATOS: ReadonlyArray<{ valor: FormatoDoEncontro; rotulo: string }> = [{ valor: 'presencial', rotulo: 'Presencial' }, { valor: 'online', rotulo: 'Online' }]
const ALCANCES: ReadonlyArray<{ valor: AlcanceDoEncontro; rotulo: string }> = [
  { valor: 'distrital', rotulo: 'Distrital' }, { valor: 'igreja', rotulo: 'Igreja local' }, { valor: 'departamento', rotulo: 'Departamento' },
]
const PUBLICOS = (Object.keys(PUBLICO_DISTRITAL_LABELS) as PublicoDistrital[]).map((valor) => ({ valor, rotulo: PUBLICO_DISTRITAL_LABELS[valor] }))

/**
 * Formato e alcance de Reunião, Treinamento, Evento e Concílio.
 *
 * Um componente só para os quatro: a regra — presencial pede local, distrital
 * pede público, igreja local pede a igreja — é a mesma, e duas cópias acabariam
 * divergindo.
 */
export function CamposDeEncontro({ input, churches, onChange }: {
  input: AgendaEventInput
  churches: readonly ChurchEntity[]
  onChange: (patch: Partial<AgendaEventInput>) => void
}) {
  const encontro: DetalhesDoEncontro = input.encontro ?? { formato: null, alcance: null, publico: null, publicoOutro: '', departamento: '' }
  const nome = input.category
  return (
    <>
      <Escolha rotulo="Formato" nome={`${nome}-formato`} opcoes={FORMATOS} valor={encontro.formato} obrigatorio
        onChange={(formato) => { const proximo = encontroComFormato(encontro, formato); onChange({ encontro: proximo.encontro, ...(proximo.limparLocal ? { location: '', address: '' } : {}) }) }} />
      {encontro.formato === 'presencial' && <Field label="Local" name="agenda-location" value={input.location} onChange={(event) => onChange({ location: event.target.value })} maxLength={160} required />}
      <Escolha rotulo="Alcance" nome={`${nome}-alcance`} opcoes={ALCANCES} valor={encontro.alcance} obrigatorio
        onChange={(alcance) => { const proximo = encontroComAlcance(encontro, alcance); onChange({ encontro: proximo.encontro, ...(proximo.limparIgreja ? { churchId: null } : {}) }) }} />
      {encontro.alcance === 'distrital' && <Escolha rotulo="Público" nome={`${nome}-publico`} opcoes={PUBLICOS} valor={encontro.publico} obrigatorio onChange={(publico) => onChange({ encontro: encontroComPublico(encontro, publico) })} />}
      {encontro.alcance === 'distrital' && encontro.publico === 'outro' && <Field label="Qual público?" name="agenda-publico-outro" value={encontro.publicoOutro} onChange={(event) => onChange({ encontro: { ...encontro, publicoOutro: event.target.value } })} maxLength={120} required />}
      {encontro.alcance === 'igreja' && <SeletorDeIgreja churches={churches} valor={input.churchId} obrigatorio onChange={(churchId) => onChange({ churchId })} />}
      {encontro.alcance === 'departamento' && (
        <BuscaDeNomes
          rotulo="Departamento"
          opcoes={DEPARTAMENTOS.map((departamento) => ({ id: departamento, nome: departamento }))}
          selecionados={encontro.departamento ? [encontro.departamento] : []}
          onEscolher={(departamento) => onChange({ encontro: { ...encontro, departamento } })}
          onRemover={() => onChange({ encontro: { ...encontro, departamento: '' } })}
        />
      )}
    </>
  )
}

/** A igreja, como select. "Outra igreja" só onde o tipo aceita. */
export function SeletorDeIgreja({ churches, valor, onChange, obrigatorio = false, outra, onOutra, rotulo = 'Igreja' }: {
  churches: readonly ChurchEntity[]
  valor: string | null
  onChange: (churchId: string | null) => void
  obrigatorio?: boolean
  /** Presente quando o tipo aceita outra igreja; `true` quando é a escolhida. */
  outra?: boolean
  onOutra?: () => void
  rotulo?: string
}) {
  const ativas = churches.filter(({ status, id }) => status !== 'archived' || id === valor)
  return (
    <label className="field">
      <span className="field__label">{rotulo}</span>
      <select className="field__input" required={obrigatorio && !outra} value={outra ? 'outra' : valor ?? ''}
        onChange={(event) => { if (event.target.value === 'outra') onOutra?.(); else onChange(event.target.value || null) }}>
        <option value="">{obrigatorio ? 'Selecione' : 'Sem igreja vinculada'}</option>
        {ativas.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
        {onOutra && <option value="outra">Outra igreja</option>}
      </select>
    </label>
  )
}
