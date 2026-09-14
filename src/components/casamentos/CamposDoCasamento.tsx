import { useState } from 'react'
import { nomeDoCasal } from '../../casamentos/core'
import { ETAPA_LABELS, type CasamentoEntity, type NoivoDoCasamento } from '../../casamentos/types'
import type { ChurchEntity } from '../../district/types'
import type { PersonEntity } from '../../people/types'
import { BuscaDeNomes, Escolha } from '../agenda/CamposDaAgenda'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'

/** Noiva ou noivo: do cadastro de pessoas ou escrito à mão, sem obrigar a ser membro. */
export function CampoDoNoivo({ papel, valor, onChange, people, churches }: {
  papel: 'noiva' | 'noivo'
  valor: NoivoDoCasamento
  onChange: (valor: NoivoDoCasamento) => void
  people: readonly PersonEntity[]
  churches: readonly ChurchEntity[]
}) {
  const artigo = papel === 'noiva' ? 'da noiva' : 'do noivo'
  const [outraIgreja, setOutraIgreja] = useState(!valor.igrejaId && Boolean(valor.igrejaNome.trim()))
  return (
    <fieldset className="noivo-do-casamento">
      <legend>{papel === 'noiva' ? 'Noiva' : 'Noivo'}</legend>
      <BuscaDeNomes
        rotulo={`Cadastro ${artigo}`}
        opcoes={people.map((person) => ({ id: person.id, nome: person.name }))}
        selecionados={valor.personId ? [valor.personId] : []}
        rotuloDoEscolhido={(personId) => people.find(({ id }) => id === personId)?.name ?? valor.nome}
        onEscolher={(personId) => {
          const pessoa = people.find(({ id }) => id === personId)
          setOutraIgreja(false)
          onChange({ ...valor, personId, nome: pessoa?.name ?? valor.nome, igrejaId: pessoa?.currentChurchId || valor.igrejaId, igrejaNome: pessoa?.currentChurchId ? '' : valor.igrejaNome })
        }}
        onRemover={() => onChange({ ...valor, personId: null })}
      />
      <Field label={`Nome ${artigo}`} name={`casamento-${papel}-nome`} value={valor.nome} maxLength={120} onChange={(event) => onChange({ ...valor, nome: event.target.value })} />
      <label className="field">
        <span className="field__label">{`Igreja ${artigo}`}</span>
        <select className="field__input" value={outraIgreja ? 'outra' : valor.igrejaId ?? ''} onChange={(event) => {
          if (event.target.value === 'outra') { setOutraIgreja(true); onChange({ ...valor, igrejaId: null }) }
          else { setOutraIgreja(false); onChange({ ...valor, igrejaId: event.target.value || null, igrejaNome: '' }) }
        }}>
          <option value="">Sem igreja informada</option>
          {churches.filter(({ status, id }) => status !== 'archived' || id === valor.igrejaId).map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
          <option value="outra">Outra igreja</option>
        </select>
      </label>
      {outraIgreja && <Field label={`Qual igreja ${artigo}?`} name={`casamento-${papel}-igreja`} value={valor.igrejaNome} maxLength={120} onChange={(event) => onChange({ ...valor, igrejaNome: event.target.value })} />}
    </fieldset>
  )
}

export type ModoDoCasamento = 'existente' | 'novo'

/** Vincular a um casamento já acompanhado ou criar o acompanhamento agora. */
export function EscolhaDoCasamento({ nome, modo, onModo, casamentos, casamentoId, onCasamento }: {
  nome: string
  modo: ModoDoCasamento | null
  onModo: (modo: ModoDoCasamento) => void
  casamentos: readonly CasamentoEntity[]
  casamentoId: string | null
  onCasamento: (casamentoId: string | null) => void
}) {
  const disponiveis = casamentos.filter((casamento) => casamento.etapa !== 'cancelado' || casamento.id === casamentoId)
  return (
    <>
      <Escolha rotulo="Acompanhamento do casamento" nome={`${nome}-modo`} obrigatorio valor={modo}
        opcoes={[{ valor: 'existente', rotulo: 'Vincular a casamento existente' }, { valor: 'novo', rotulo: 'Criar novo acompanhamento' }]}
        onChange={onModo} />
      {modo === 'existente' && (
        <label className="field">
          <span className="field__label">Casamento</span>
          <select className="field__input" required value={casamentoId ?? ''} onChange={(event) => onCasamento(event.target.value || null)}>
            <option value="">Selecione</option>
            {disponiveis.map((casamento) => <option key={casamento.id} value={casamento.id}>{nomeDoCasal(casamento)} · {ETAPA_LABELS[casamento.etapa]}</option>)}
          </select>
        </label>
      )}
    </>
  )
}

/** Possíveis registros dos mesmos noivos: a escolha é de quem cadastra. */
export function AvisoDeDuplicados({ duplicados, onAbrir, onCriarMesmoAssim }: {
  duplicados: readonly CasamentoEntity[]
  onAbrir: (casamentoId: string) => void
  onCriarMesmoAssim: () => void
}) {
  if (!duplicados.length) return null
  return (
    <div className="alert aviso-duplicado aviso-atencao" role="alert">
      <p>Já existe acompanhamento com estes noivos.</p>
      <ul>
        {duplicados.map((casamento) => <li key={casamento.id}><span>{nomeDoCasal(casamento)} · {ETAPA_LABELS[casamento.etapa]}</span></li>)}
      </ul>
      <div className="form-actions">
        <Button type="button" variant="secondary" onClick={() => onAbrir(duplicados[0]!.id)}>Abrir casamento existente</Button>
        <Button type="button" variant="secondary" onClick={onCriarMesmoAssim}>Criar outro mesmo assim</Button>
      </div>
    </div>
  )
}
