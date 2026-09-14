import { useCallback, useEffect, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { DistrictService } from '../district/service'
import { PEQUENOS_GRUPOS, UNIDADES_DE_ACAO, valorVigente } from '../integrated-report/ligacoes'
import { RelatorioIntegradoService } from '../integrated-report/service'
import type { RelatorioIntegradoEntity } from '../integrated-report/types'
import { PeopleService } from '../people/service'
import { MissionaryService } from './service'
import { quadroDeGrupos, type QuadroDeGrupos, type VigenteDoRelatorio } from './metasDeGrupos'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const districtService = new DistrictService()
const peopleService = new PeopleService()
const missionary = new MissionaryService()
const relatorioIntegrado = new RelatorioIntegradoService()

const VAZIO: QuadroDeGrupos = { igrejas: [], distrito: { membros: 0, meta: 0, escolaSabatina: 0, pequenosGrupos: 0, integracoes: 0, cadastroEscolaSabatina: 0, cadastroPequenosGrupos: 0 } }

/** Escola Sabatina e Pequenos Grupos do Relatório Integrado: o último trimestre confirmado do ano. */
export function vigenteDoRelatorio(relatorios: readonly RelatorioIntegradoEntity[], ano: number): VigenteDoRelatorio {
  return (churchId) => ({
    escolaSabatina: valorVigente(relatorios, churchId, UNIDADES_DE_ACAO, ano),
    pequenosGrupos: valorVigente(relatorios, churchId, PEQUENOS_GRUPOS, ano),
  })
}

/**
 * A meta de grupos, pronta para quem só quer mostrá-la.
 *
 * Ela não vem de `useGoalSources` porque não é uma meta combinada: sai do número
 * de membros de cada igreja, e precisa das pessoas, das classes, dos PGs e do
 * Relatório Integrado, que aquele gancho não carrega.
 */
export function useQuadroDeGrupos(): { quadro: QuadroDeGrupos; pronto: boolean } {
  const { account, masterKey } = useAuthVault()
  const [quadro, setQuadro] = useState<QuadroDeGrupos>(VAZIO)
  const [pronto, setPronto] = useState(false)

  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    // Um quadro que não carrega é um quadro vazio, não a tela inteira caindo:
    // este resumo aparece ao lado de coisas que continuam servindo sem ele.
    try {
      const district = await districtService.getDistrict(account.id, masterKey)
      const [igrejas, pessoas, classes, grupos, integracoes, relatorios] = await Promise.all([
        district ? districtService.listChurches(account.id, masterKey, district.id) : [],
        peopleService.listPeople(account.id, masterKey),
        missionary.listClasses(account.id, masterKey),
        missionary.listSmallGroups(account.id, masterKey),
        missionary.listUapgs(account.id, masterKey),
        relatorioIntegrado.listar(account.id, masterKey),
      ])
      setQuadro(quadroDeGrupos(igrejas, pessoas, classes, grupos, integracoes, vigenteDoRelatorio(relatorios, new Date().getFullYear())))
    } catch { setQuadro(VAZIO) }
    setPronto(true)
  }, [account, masterKey])

  useEffect(() => { void carregar() }, [carregar])
  useReloadOnSync(carregar)

  return { quadro, pronto }
}
