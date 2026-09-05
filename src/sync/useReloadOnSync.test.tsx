import { cleanup, render, screen } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notificarDadosSincronizados, useReloadOnSync } from './useReloadOnSync'

afterEach(cleanup)

function TelaFicticia({ buscar }: { buscar: () => Promise<string> }) {
  const [texto, setTexto] = useState('vazio')
  const carregar = useCallback(async () => { setTexto(await buscar()) }, [buscar])
  useReloadOnSync(carregar)
  return <p>{texto}</p>
}

describe('a tela se refaz quando a sincronização traz novidade', () => {
  it('carrega ao montar e de novo a cada aviso', async () => {
    // Sem isto, o compromisso chegava do outro aparelho, era gravado, e a
    // agenda continuava mostrando a lista de antes — o pastor concluía que a
    // sincronização não funcionava, quando o que não funcionava era a tela.
    let volta = 0
    const buscar = vi.fn(() => Promise.resolve(`carga ${(volta += 1)}`))
    render(<TelaFicticia buscar={buscar} />)

    expect(await screen.findByText('carga 1')).toBeInTheDocument()

    notificarDadosSincronizados()
    expect(await screen.findByText('carga 2')).toBeInTheDocument()

    notificarDadosSincronizados()
    expect(await screen.findByText('carga 3')).toBeInTheDocument()
  })

  it('para de ouvir quando a tela sai', async () => {
    // Uma tela desmontada que continuasse recarregando escreveria em estado que
    // não existe mais, e seguraria na memória tudo o que ela alcançava.
    const buscar = vi.fn(() => Promise.resolve('carregado'))
    const { unmount } = render(<TelaFicticia buscar={buscar} />)
    await screen.findByText('carregado')
    expect(buscar).toHaveBeenCalledTimes(1)

    unmount()
    notificarDadosSincronizados()

    expect(buscar).toHaveBeenCalledTimes(1)
  })
})
