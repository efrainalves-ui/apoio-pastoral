import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
  Aparelhos fictícios. Nenhum identificador real de aparelho do pastor entra
  aqui.
*/
const ESTE = 'aparelho-ficticio-atual'
const OUTRO = 'aparelho-ficticio-do-pastor'

const locais = [
  { id: ESTE, accountId: 'conta-ficticia', label: 'Computador', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', lastSeenAt: '2026-09-01T00:00:00.000Z' },
]
let remotos: Array<{ id: string; label: string; status: string; lastSeenAt: string }> = []
let guardaFalha: Error | null = null
let servicoFalha = false

const revokeDevice = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve())
const approveDevice = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve())

vi.mock('../auth/AuthVaultContext', () => ({
  useAuthVault: () => ({ account: { id: 'conta-ficticia' }, changePassword: vi.fn() }),
}))
vi.mock('../auth/accountGuard', () => ({
  remoteAccountGuard: () => guardaFalha ? Promise.reject(guardaFalha) : Promise.resolve(),
}))
vi.mock('../auth/device', () => ({
  currentDeviceId: () => ESTE,
  deviceConfirmationCode: () => '123-456',
  revokeDevice: (id: string) => revokeDevice(id),
  approveDevice: (id: string) => approveDevice(id),
}))
vi.mock('../auth/supabase', () => ({ fetchRemoteDevices: () => servicoFalha ? Promise.reject(new Error('sem serviço')) : Promise.resolve(remotos) }))
vi.mock('../db/database', () => ({
  db: { devices: { where: () => ({ equals: () => ({ toArray: () => Promise.resolve(locais) }) }) } },
}))

const { SecurityPage } = await import('./SecurityPage')

beforeEach(() => {
  guardaFalha = null
  servicoFalha = false
  revokeDevice.mockClear()
  approveDevice.mockClear()
  remotos = [
    { id: ESTE, label: 'Computador', status: 'active', lastSeenAt: '2026-09-01T00:00:00.000Z' },
    { id: OUTRO, label: 'Dispositivo móvel', status: 'active', lastSeenAt: '2026-09-09T00:00:00.000Z' },
  ]
})
afterEach(cleanup)

describe('revogar um aparelho pelo outro', () => {
  /*
    O aparelho em uso não pode se revogar: o pastor ficaria sem nenhum caminho
    de volta, e a revogação existe para o aparelho que ele não tem mais na mão.
  */
  it('não oferece revogar o aparelho em uso', async () => {
    render(<SecurityPage />)
    await screen.findByText('Dispositivo móvel')
    expect(screen.getByText(/Este dispositivo/u)).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Revogar' })).toHaveLength(1)
  })

  it('revoga o outro aparelho, e é esse o identificador que vai', async () => {
    render(<SecurityPage />)
    await screen.findByText('Dispositivo móvel')
    await userEvent.click(screen.getByRole('button', { name: 'Revogar' }))
    await waitFor(() => expect(revokeDevice).toHaveBeenCalledWith(OUTRO))
  })

  /*
    Duas contas no mesmo navegador: esta aba mostrava os aparelhos da conta que
    entrou por último enquanto dizia o nome da conta desta aba — e o botão
    revogava os dela. Revogar é irreversível, então a conferência vem antes.
  */
  it('sessão de outra conta não revoga nada, e diz por quê', async () => {
    render(<SecurityPage />)
    await screen.findByText('Dispositivo móvel')
    guardaFalha = new Error('Esta sessão pertence a outra conta.')
    await userEvent.click(screen.getByRole('button', { name: 'Revogar' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('outra conta'))
    expect(revokeDevice).not.toHaveBeenCalled()
  })

  it('aparelho já revogado não oferece revogar de novo', async () => {
    remotos = [
      { id: ESTE, label: 'Computador', status: 'active', lastSeenAt: '2026-09-01T00:00:00.000Z' },
      { id: OUTRO, label: 'Dispositivo móvel', status: 'revoked', lastSeenAt: '2026-09-09T00:00:00.000Z' },
    ]
    render(<SecurityPage />)
    await screen.findByText('Revogado')
    expect(screen.queryByRole('button', { name: 'Revogar' })).toBeNull()
  })

  /*
    Aparelho aguardando confirmação mostra o código que o pastor confere nos
    dois lados antes de liberar — é o que impede liberar um aparelho que não é
    dele.
  */
  it('aparelho aguardando mostra o código e deixa confirmar ou recusar', async () => {
    remotos = [
      { id: ESTE, label: 'Computador', status: 'active', lastSeenAt: '2026-09-01T00:00:00.000Z' },
      { id: OUTRO, label: 'Dispositivo móvel', status: 'pending', lastSeenAt: '2026-09-09T00:00:00.000Z' },
    ]
    render(<SecurityPage />)
    await screen.findByText('123-456')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(approveDevice).toHaveBeenCalledWith(OUTRO))
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeVisible()
  })

  /*
    Sem serviço, cada aparelho só conhece a si mesmo. Mostrar apenas o que há
    localmente é honesto; inventar os outros não seria.
  */
  it('sem serviço, mostra só o aparelho que este conhece', async () => {
    servicoFalha = true
    render(<SecurityPage />)
    await screen.findByText(/Este dispositivo/u)
    expect(screen.queryByText('Dispositivo móvel')).toBeNull()
  })

  /*
    Lista vazia vinda do serviço não é uma afirmação verdadeira: este mesmo
    aparelho está falando com ele. A tela ficava sem nenhum aparelho, e sem
    aparelho não há como revogar nada.
  */
  it('lista vazia do serviço não apaga o aparelho da tela', async () => {
    remotos = []
    render(<SecurityPage />)
    await screen.findByText(/Este dispositivo/u)
  })
})
