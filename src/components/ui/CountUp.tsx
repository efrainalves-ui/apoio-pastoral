import { useLayoutEffect, useRef, useState } from 'react'
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
  /*
    Começa no valor, e não em zero.
  
    Partindo de zero, o número só chegava ao certo se a animação rodasse — e ela
    não roda em aba de segundo plano, nem onde `requestAnimationFrame` está
    contido. Quem abrisse assim leria zero pedidos de oração havendo cinco. O
    dado não pode depender do enfeite: a animação recua para zero e sobe, mas
    só depois de garantir que vai mesmo correr.
  */
  const [mostrado, setMostrado] = useState(value)
  const jaAnimou = useRef(false)

  useLayoutEffect(() => {
    if (movimentoReduzido() || jaAnimou.current || typeof requestAnimationFrame !== 'function') { setMostrado(value); return }
    jaAnimou.current = true
    setMostrado(0)
    let quadro = 0
    const inicio = performance.now()
    const passo = (agora: number) => {
      /*
        Progresso não pode ser negativo.

        Só o teto estava preso. Quando o carimbo do quadro vem de uma origem de
        tempo diferente da de `performance.now()`, `t` fica negativo — e
        `1 - (1 - t)³` com t = −1 dá −7. O contador de "pedidos de oração"
        chegava a piscar número negativo antes de subir.
      */
      const t = Math.min(1, Math.max(0, (agora - inicio) / durationMs))
      setMostrado(value * desacelerar(t))
      if (t < 1) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [value, durationMs])

  return <>{format(Math.round(mostrado))}</>
}
