import { KeyRound, Laptop, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { approveDevice, currentDeviceId, deviceConfirmationCode, revokeDevice } from '../auth/device'
import { fetchRemoteDevices } from '../auth/supabase'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { StatusPill } from '../components/ui/StatusPill'
import { db } from '../db/database'
import type { DeviceRecord } from '../db/types'

export function SecurityPage() {
  const { account, changePassword } = useAuthVault()
  const [devices, setDevices] = useState<DeviceRecord[]>([])
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadDevices = useCallback(async () => {
    if (!account) return
    const locais = await db.devices.where('accountId').equals(account.id).toArray()
    // Cada aparelho só guarda a si mesmo. A lista da conta inteira vem do
    // serviço; sem ela, os outros aparelhos ficariam invisíveis e não haveria
    // como revogar nenhum deles.
    const remotos = await fetchRemoteDevices().catch(() => null)
    if (!remotos) { setDevices(locais); return }

    const porId = new Map(locais.map((device) => [device.id, device]))
    setDevices(remotos.map((remoto) => {
      const local = porId.get(remoto.id)
      const agora = new Date().toISOString()
      return {
        ...local,
        id: remoto.id,
        accountId: account.id,
        label: remoto.label,
        status: remoto.status,
        createdAt: local?.createdAt ?? remoto.lastSeenAt ?? agora,
        lastSeenAt: remoto.lastSeenAt ?? local?.lastSeenAt ?? agora,
      }
    }))
  }, [account])
  useEffect(() => { void loadDevices() }, [loadDevices])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setMessage('Senha alterada. Os dados protegidos foram preservados.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível alterar a senha.')
    }
  }

  async function approve(id: string) {
    await approveDevice(id)
    await loadDevices()
  }

  async function revoke(id: string) {
    await revokeDevice(id)
    await loadDevices()
  }

  return (
    <div className="page-stack page-narrow">
      <header className="page-hero"><div><p className="eyebrow">Proteção da conta</p><h1>Segurança</h1><p>Revise seus dispositivos e altere sua senha quando precisar.</p></div><StatusPill>Aplicativo aberto</StatusPill></header>
      <Card title="Dispositivos" eyebrow="Controle de acesso" action={<Laptop />}>
        <div className="device-list">
          {devices.map((device) => {
            const isCurrent = device.id === currentDeviceId()
            const aguardando = device.status === 'pending'
            const situacao = device.status === 'active' ? 'Ativo' : aguardando ? 'Aguardando confirmação' : 'Revogado'
            return <div className="device-row" key={device.id}><span className="device-row__icon">{device.label.includes('móvel') ? <Smartphone /> : <Laptop />}</span><div><strong>{device.label}</strong><small>{isCurrent ? 'Este dispositivo' : aguardando ? <>Confira o código <span className="device-row__code">{deviceConfirmationCode(device.id)}</span> nesse aparelho</> : 'Dispositivo autorizado'} · visto {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(device.lastSeenAt))}</small></div><StatusPill tone={device.status === 'active' ? 'success' : 'warning'}>{situacao}</StatusPill>{!isCurrent && aguardando && <Button onClick={() => void approve(device.id)}>Confirmar</Button>}{!isCurrent && device.status !== 'revoked' && <Button variant="danger" onClick={() => void revoke(device.id)}>{aguardando ? 'Recusar' : 'Revogar'}</Button>}</div>
          })}
        </div>
      </Card>
      <Card title="Alterar senha" eyebrow="Atualização de senha" action={<KeyRound />}>
        <p className="card-copy">A nova senha passa a proteger seus dados sem alterar os registros existentes.</p>
        <form className="inline-form" onSubmit={(event) => void submit(event)}>
          <Field label="Senha atual" name="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          <Field label="Nova senha" name="new-password" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          {message && <div className="alert alert--success" role="status"><ShieldCheck size={18} />{message}</div>}
          {error && <div className="alert alert--error" role="alert">{error}</div>}
          <Button type="submit" icon={<LockKeyhole size={18} />}>Alterar senha</Button>
        </form>
      </Card>
    </div>
  )
}
