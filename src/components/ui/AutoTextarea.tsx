import { useEffect, useRef, type TextareaHTMLAttributes } from 'react'

/**
 * Uma caixa de texto que cresce com o que se escreve, até um teto.
 *
 * O conteúdo de um sermão tem dezenove mil caracteres e a caixa tinha o mesmo
 * tamanho da de "Introdução". Escrever ali era escrever por uma fresta: para
 * ver o parágrafo anterior era preciso rolar dentro de uma janela de três
 * linhas, ou descobrir que o canto da caixa pode ser arrastado — e ninguém
 * descobre isso no meio de preparar uma pregação.
 *
 * O teto existe pelo motivo oposto: uma caixa que cresce sem limite empurra o
 * botão de salvar para fora da tela, e aí o texto está visível mas não há como
 * guardá-lo. Chegando ao teto, ela rola por dentro.
 */
export interface AutoTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  /** Altura mínima, em linhas. */
  minRows?: number
  /** Altura máxima, em linhas, antes de rolar por dentro. */
  maxRows?: number
}

const ALTURA_DA_LINHA = 26

export function AutoTextarea({ minRows = 3, maxRows = 22, value, className = '', style, ...props }: AutoTextareaProps) {
  const referencia = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const campo = referencia.current
    if (!campo) return
    // Zerar antes de medir: `scrollHeight` só encolhe se a altura atual não
    // estiver segurando o valor antigo, e sem isso a caixa cresceria para
    // sempre, mesmo quando o texto diminui.
    campo.style.height = 'auto'
    const minimo = minRows * ALTURA_DA_LINHA
    const maximo = maxRows * ALTURA_DA_LINHA
    campo.style.height = `${Math.min(Math.max(campo.scrollHeight, minimo), maximo)}px`
    campo.style.overflowY = campo.scrollHeight > maximo ? 'auto' : 'hidden'
  }, [value, minRows, maxRows])

  return <textarea
    {...props}
    ref={referencia}
    value={value}
    className={`field__input ${className}`.trim()}
    style={{ minHeight: `${minRows * ALTURA_DA_LINHA}px`, resize: 'vertical', ...style }}
  />
}
