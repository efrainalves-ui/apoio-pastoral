import { useCallback, useEffect, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { DistrictService } from '../district/service'
import { useReloadOnSync } from '../sync/useReloadOnSync'
import { RelatorioIntegradoService } from './service'
import type { RelatorioIntegradoEntity } from './types'

const service = new RelatorioIntegradoService()
const districtService = new DistrictService()

/** Os relatórios guardados e as igrejas ativas, para as telas que só resumem. */
export function useRelatorioIntegrado(): { relatorios: RelatorioIntegradoEntity[]; ativas: string[]; pronto: boolean } {
  const { account, masterKey } = useAuthVault()
  const [relatorios, setRelatorios] = useState<RelatorioIntegradoEntity[]>([])
  const [ativas, setAtivas] = useState<string[]>([])
  const [pronto, setPronto] = useState(false)

  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const district = await districtService.getDistrict(account.id, masterKey)
      const [igrejas, guardados] = await Promise.all([
        district ? districtService.listChurches(account.id, masterKey, district.id) : [],
        service.listar(account.id, masterKey),
      ])
      setAtivas(igrejas.filter(({ status }) => status === 'active').map(({ id }) => id))
      setRelatorios(guardados)
    } catch { /* sem resumo, o acesso à página central continua */ }
    setPronto(true)
  }, [account, masterKey])

  useEffect(() => { void carregar() }, [carregar])
  useReloadOnSync(carregar)

  return { relatorios, ativas, pronto }
}
