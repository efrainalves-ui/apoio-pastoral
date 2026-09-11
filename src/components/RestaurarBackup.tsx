import { Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { BackupService, pendingBackupRestore } from '../backup/service'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

const service = new BackupService()

/**
 * A metade que restaura.
 *
 * Vive separada da tela de backup porque precisa existir onde ainda não há
 * distrito: um aparelho novo, ou um aparelho cujo cofre esvaziou, é
 * exatamente onde o pastor vai querer usar o arquivo — e era ali que a única
 * porta para esta tela não existia.
 */
export function RestaurarBackup({ onPronto }: { onPronto?: () => void }) {
  const { account, masterKey } = useAuthVault()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [pendente, setPendente] = useState<{ applied: number; total: number } | null>(null)

  const conferirPendencia = useCallback(async () => {
    if (!account) return
    setPendente(await pendingBackupRestore(account.id))
  }, [account])
  useEffect(() => { void conferirPendencia() }, [conferirPendencia])

  async function restaurar() {
    if (!account || !masterKey || !arquivo || !confirmado) return
    setOcupado(true); setErro('')
    try {
      const lido = JSON.parse(await arquivo.text()) as unknown
      const resultado = await service.restore(account.id, masterKey, codigo, lido)
      setMensagem(`Backup restaurado: ${resultado.recordCount} registros protegidos e ${resultado.personalCount} registros pessoais.`)
      setArquivo(null); setConfirmado(false)
      onPronto?.()
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível restaurar.')
    } finally {
      await conferirPendencia()
      setOcupado(false)
    }
  }

  /**
   * Retomar pede o código de novo porque o arquivo guardado continua cifrado.
   * Guardá-lo aberto para poupar essa digitação seria abrir mão, por
   * conveniência, da única coisa que protege esses dados aqui dentro.
   */
  async function retomar() {
    if (!account || !masterKey) return
    setOcupado(true); setErro('')
    try {
      const resultado = await service.resume(account.id, masterKey, codigo)
      setMensagem(`Restauração concluída: ${resultado.recordCount} registros protegidos e ${resultado.personalCount} registros pessoais.`)
      onPronto?.()
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível concluir a restauração.')
    } finally {
      await conferirPendencia()
      setOcupado(false)
    }
  }

  return <>
    {mensagem && <div className="alert alert--success" role="status">{mensagem}</div>}
    {erro && <div className="alert alert--error" role="alert">{erro}</div>}

    {pendente && <Card className="danger-card" title="Restauração pela metade">
      <p>Uma restauração começou neste aparelho e não terminou: {pendente.applied} de {pendente.total} registros já entraram. Enquanto ela não for concluída, a sincronização fica parada — metade de um backup não pode subir para os outros aparelhos.</p>
      <p>Informe o mesmo código de backup e conclua.</p>
      <label className="field" htmlFor="restaurar-codigo-pendente"><span>Código do backup que está sendo restaurado</span>
        <input id="restaurar-codigo-pendente" className="field__input" type="password" value={codigo} onChange={(evento) => setCodigo(evento.target.value)} autoComplete="off" />
      </label>
      <Button variant="danger" disabled={ocupado || codigo.length < 12} onClick={() => void retomar()} icon={<Upload />}>{ocupado ? 'Concluindo…' : 'Concluir restauração'}</Button>
    </Card>}

    {!pendente && <Card title="Restaurar backup" eyebrow="Confirmação obrigatória">
      <p><strong>Atenção:</strong> registros com o mesmo identificador podem substituir versões locais. A restauração aceita somente um backup desta conta e não mistura contas.</p>
      <label className="field" htmlFor="restaurar-codigo"><span>Código do backup que está sendo restaurado</span>
        <input id="restaurar-codigo" className="field__input" type="password" value={codigo} onChange={(evento) => setCodigo(evento.target.value)} autoComplete="off" />
      </label>
      <input aria-label="Arquivo de backup" type="file" accept=".apb,application/octet-stream" disabled={ocupado} onChange={(evento) => { setArquivo(evento.target.files?.[0] ?? null); setConfirmado(false) }} />
      {arquivo && <>
        <label className="choice-card">
          <input type="checkbox" checked={confirmado} disabled={ocupado} onChange={(evento) => setConfirmado(evento.target.checked)} />
          <span>Entendo que a restauração pode substituir registros locais desta conta.</span>
        </label>
        <Button variant="danger" disabled={ocupado || !confirmado || codigo.length < 12} onClick={() => void restaurar()} icon={<Upload />}>{ocupado ? 'Restaurando…' : 'Restaurar este backup'}</Button>
      </>}
    </Card>}
  </>
}
