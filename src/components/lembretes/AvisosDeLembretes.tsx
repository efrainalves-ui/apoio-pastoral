import { BellRing, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../../auth/AuthVaultContext'
import { avisadosNesteAparelho, avisosQueVenceram, JANELA_DO_AVISO_MS, linkDoLembrete, marcarAvisados, type AvisoDeLembrete } from '../../lembretes/avisoNoApp'
import { horaNoFuso } from '../../lembretes/tempo'
import { fusoDoAparelho } from '../../lembretes/tempo'
import { EVENTO_LEMBRETES_ALTERADOS, servicoDeLembretes } from '../../lembretes/useCentral'
import { useReloadOnSync } from '../../sync/useReloadOnSync'

const INTERVALO_MS = 20_000

/**
 * O aviso que aparece dentro do aplicativo quando a hora de um lembrete chega.
 *
 * Funciona sem internet: lê o cofre local. Cada ocorrência aparece uma vez neste
 * aparelho; dispensar só fecha o aviso — o lembrete continua aberto na Central.
 */
export function AvisosDeLembretes() {
  const { account, masterKey } = useAuthVault()
  const [avisos, setAvisos] = useState<AvisoDeLembrete[]>([])
  // Marcado na primeira conferência: o que venceu antes de abrir já aparece como atrasado na Central.
  const desde = useRef<Date | null>(null)

  const conferir = useCallback(async () => {
    if (!account || !masterKey) return
    desde.current ??= new Date(Date.now() - JANELA_DO_AVISO_MS)
    try {
      const lembretes = await servicoDeLembretes.lembretes(account.id, masterKey)
      const novos = avisosQueVenceram(lembretes, desde.current, new Date(), fusoDoAparelho(), avisadosNesteAparelho(account.id))
      if (!novos.length) return
      marcarAvisados(account.id, novos.map(({ chave }) => chave))
      setAvisos((atuais) => [...atuais, ...novos.filter((novo) => !atuais.some(({ chave }) => chave === novo.chave))])
    } catch { /* um aviso que falha não pode derrubar a tela */ }
  }, [account, masterKey])

  useReloadOnSync(conferir)
  useEffect(() => {
    const agora = () => { void conferir() }
    agora()
    const relogio = window.setInterval(agora, INTERVALO_MS)
    window.addEventListener(EVENTO_LEMBRETES_ALTERADOS, agora)
    document.addEventListener('visibilitychange', agora)
    return () => {
      window.clearInterval(relogio)
      window.removeEventListener(EVENTO_LEMBRETES_ALTERADOS, agora)
      document.removeEventListener('visibilitychange', agora)
    }
  }, [conferir])

  const dispensar = (chave: string) => setAvisos((atuais) => atuais.filter((aviso) => aviso.chave !== chave))

  if (!avisos.length) return null
  return (
    <section className="avisos-de-lembretes" aria-label="Lembretes que venceram">
      {avisos.map((aviso) => (
        <div key={aviso.chave} className="aviso-de-lembrete" role="alert">
          <BellRing aria-hidden="true" />
          <div className="aviso-de-lembrete__texto">
            <strong>{aviso.titulo}</strong>
            <span>Lembrete das {horaNoFuso(aviso.instante, fusoDoAparelho())}</span>
          </div>
          <Link className="button button--small" to={linkDoLembrete(aviso)} onClick={() => dispensar(aviso.chave)}>Abrir</Link>
          <button type="button" className="icon-button" aria-label={`Dispensar aviso de ${aviso.titulo}`} onClick={() => dispensar(aviso.chave)}><X aria-hidden="true" /></button>
        </div>
      ))}
    </section>
  )
}
