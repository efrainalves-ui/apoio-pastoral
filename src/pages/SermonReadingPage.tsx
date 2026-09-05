import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowLeft, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { SermonService } from '../sermons/service'
import type { SermonEntity } from '../sermons/types'

const service = new SermonService()

const TAMANHO_MINIMO = 1
const TAMANHO_MAXIMO = 2.4
const PASSO = 0.2
const PREFERENCIA = 'apoio-pastoral:tamanho-leitura'

/**
 * Modo púlpito: o sermão inteiro em letra grande, sem menu e sem distração.
 * Tudo vem do armazenamento local, então funciona sem rede.
 */
export function SermonReadingPage() {
  const { account, masterKey } = useAuthVault()
  const { sermonId = '' } = useParams()
  const [sermon, setSermon] = useState<SermonEntity | null>(null)
  const [escala, setEscala] = useState(1.4)

  useEffect(() => {
    try {
      const guardado = Number(localStorage.getItem(PREFERENCIA))
      if (guardado >= TAMANHO_MINIMO && guardado <= TAMANHO_MAXIMO) setEscala(guardado)
    } catch { /* preferência é conveniência: sem ela, usa o padrão */ }
  }, [])

  const ajustar = useCallback((delta: number) => {
    setEscala((atual) => {
      const proximo = Math.min(TAMANHO_MAXIMO, Math.max(TAMANHO_MINIMO, Number((atual + delta).toFixed(1))))
      try { localStorage.setItem(PREFERENCIA, String(proximo)) } catch { /* segue sem guardar */ }
      return proximo
    })
  }, [])

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setSermon(await service.get(account.id, masterKey, sermonId))
  }, [account, masterKey, sermonId])
  useReloadOnSync(load)

  if (!sermon) return <div className="app-loading" role="status">Abrindo o sermão…</div>

  const secoes: Array<[string, string]> = [
    ['Introdução', sermon.introduction],
    ['Conteúdo', sermon.content],
    ['Conclusão', sermon.conclusion],
    ['Apelo', sermon.appeal],
  ]

  return (
    <div className="sermon-reading" style={{ fontSize: `${escala}rem` }}>
      <div className="sermon-reading__bar">
        <Link className="text-link" to={`/app/sermoes/${sermon.id}`}><ArrowLeft />Sair do modo púlpito</Link>
        <div className="sermon-reading__zoom">
          <Button variant="secondary" onClick={() => ajustar(-PASSO)} disabled={escala <= TAMANHO_MINIMO} icon={<Minus />} aria-label="Diminuir a letra">Menor</Button>
          <Button variant="secondary" onClick={() => ajustar(PASSO)} disabled={escala >= TAMANHO_MAXIMO} icon={<Plus />} aria-label="Aumentar a letra">Maior</Button>
        </div>
      </div>
      <article className="sermon-reading__text">
        <h1>{sermon.title}</h1>
        {sermon.mainText && <p className="sermon-reading__reference">{sermon.mainText}</p>}
        {secoes.filter(([, texto]) => texto.trim()).map(([titulo, texto]) => (
          <section key={titulo}>
            <h2>{titulo}</h2>
            <p className="preserved-text">{texto}</p>
          </section>
        ))}
      </article>
    </div>
  )
}
