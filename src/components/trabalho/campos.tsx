import { useState } from 'react'
import { emReais, formatar, lerValor, type Centavos } from '../../family-budget/dinheiro'

/**
 * Um campo de dinheiro que aceita o que o pastor digita.
 *
 * A vírgula é sempre decimal, porque em português ela é. O valor guardado é
 * inteiro em centavos: quem soma reais em ponto flutuante descobre, meses
 * depois, que o total fecha com um centavo de diferença e ninguém sabe onde.
 */
export function CampoDeValor({ id, label, valor, onChange, disabled }: {
  id: string
  label: string
  valor: Centavos
  onChange: (valor: Centavos) => void
  disabled?: boolean
}) {
  const [digitado, setDigitado] = useState(valor ? String(emReais(valor)).replace('.', ',') : '')
  const [ultimoValor, setUltimoValor] = useState(valor)

  /*
    O campo guarda o texto tal como foi digitado — "1.2" ainda não é um número,
    e reformatá-lo a cada tecla arrancaria o cursor do lugar. Mas quando o valor
    chega de fora, ele precisa aparecer: sem isto, "Calcular previsto" mudava o
    lançamento e deixava o campo mostrando o número velho.
  */
  if (valor !== ultimoValor) {
    setUltimoValor(valor)
    if ((lerValor(digitado) ?? 0) !== valor) setDigitado(valor ? String(emReais(valor)).replace('.', ',') : '')
  }

  return <label className="field" htmlFor={id}>
    <span className="field__label">{label}</span>
    <input
      id={id}
      className="field__input"
      inputMode="decimal"
      disabled={disabled}
      value={digitado}
      placeholder="0,00"
      onChange={(evento) => {
        setDigitado(evento.target.value)
        onChange(lerValor(evento.target.value) ?? 0)
      }}
    />
  </label>
}

/** Percentual de 0 a 100, sem casas escondidas. */
export function CampoDePercentual({ id, label, valor, onChange }: {
  id: string
  label: string
  valor: number | null
  onChange: (valor: number | null) => void
}) {
  return <label className="field" htmlFor={id}>
    <span className="field__label">{label}</span>
    <input
      id={id}
      className="field__input"
      type="number"
      min="0"
      max="100"
      step="0.01"
      value={valor ?? ''}
      onChange={(evento) => onChange(evento.target.value === '' ? null : Number(evento.target.value))}
    />
  </label>
}

/** O valor de um parâmetro, ou o aviso de que ele ainda não foi informado. */
export function ValorOuPendencia({ valor }: { valor: Centavos | null }) {
  return valor === null
    ? <span className="valor-pendente">Ainda não configurado</span>
    : <>{formatar(valor)}</>
}

export function dataDeHoje(): string {
  const agora = new Date()
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
}

export function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '—'
}
