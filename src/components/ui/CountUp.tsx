import { useEffect, useRef, useState } from 'react'
import { desacelerar, movimentoReduzido } from './animacao'

interface CountUpProps {
  value: number
  /** Como escrever o número. Recebe o valor já arredondado da etapa. */
  format?: (valor: number) => string
  durationMs?: number
}

/**
 * O número contando até o valor.
 *
 * Serve para dar peso ao dado principal do cartão, e por isso corre uma vez só,
 * ao aparecer. Repetir a cada sincronização faria a tela piscar sozinha
 * enquanto o pastor lê.
 *
 * Com movimento reduzido, o valor aparece direto: a informação é o número, e
 * ela não pode depender da animação.
 */
export function CountUp({ value, format = String, durationMs = 700 }: CountUpProps) {
  const [mostrado, setMostrado] = useState(() => (movimentoReduzido() ? value : 0))
  const jaAnimou = useRef(false)

  useEffect(() => {
    if (movimentoReduzido() || jaAnimou.current) { setMostrado(value); return }
    jaAnimou.current = true
    let quadro = 0
    const inicio = performance.now()
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / durationMs)
      setMostrado(value * desacelerar(t))
      if (t < 1) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [value, durationMs])

  return <>{format(Math.round(mostrado))}</>
}
