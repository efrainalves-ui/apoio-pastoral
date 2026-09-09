import { useCallback, useEffect, useState } from 'react'
import { EVENTO_DADOS_SINCRONIZADOS } from '../sync/useReloadOnSync'
import { useAuthVault } from '../auth/AuthVaultContext'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { MissionaryService } from '../missionary/service'
import { GoalsService } from './service'
import type { AreaSources } from './areas'
import type { GoalEntity } from './types'

const goalsService = new GoalsService()
const districtService = new DistrictService()
const missionary = new MissionaryService()

export interface GoalSources {
  goals: GoalEntity[]
  sources: AreaSources
  churches: ChurchEntity[]
  ready: boolean
  reload: () => Promise<void>
}

/** Reúne metas, lançamentos e o que já está cadastrado em estudos e UAPG. */
interface Carga { goals: GoalEntity[]; sources: AreaSources; churches: ChurchEntity[] }

/*
  Uma busca só de cada vez, e a tela pintada na hora.

  Dois blocos da tela inicial pediam estas metas ao mesmo tempo, e cada um
  decifrava tudo por conta própria: o dobro do trabalho, e um segundo de tela
  vazia enquanto os dois terminavam.

  Duas medidas, e elas resolvem coisas diferentes:

    - quem chega enquanto uma busca está em curso espera aquela mesma, em vez de
      abrir outra igual;
    - o último resultado fica guardado só para pintar a primeira renderização,
      enquanto a busca de verdade acontece por baixo. Ele nunca é resposta
      final — cada montagem busca de novo —, e por isso não há como uma meta
      recém-criada ficar de fora.
*/
let emCurso: Promise<Carga> | null = null
let ultimo: { accountId: string; carga: Carga } | null = null

export function esquecerMetasGuardadas(): void {
  ultimo = null
}

async function carregar(accountId: string, masterKey: CryptoKey): Promise<Carga> {
  if (emCurso) return emCurso
  emCurso = (async () => {
    const district = await districtService.getDistrict(accountId, masterKey)
    const [nextGoals, entries, history, studies, uapgs, nextChurches] = await Promise.all([
      goalsService.listGoals(accountId, masterKey),
      goalsService.listEntries(accountId, masterKey),
      goalsService.listHistory(accountId, masterKey),
      missionary.listStudies(accountId, masterKey),
      missionary.listUapgs(accountId, masterKey),
      district ? districtService.listChurches(accountId, masterKey, district.id) : [],
    ])
    const carga: Carga = { goals: nextGoals, sources: { entries, studies, uapgs, history }, churches: nextChurches }
    ultimo = { accountId, carga }
    return carga
  })()
  try { return await emCurso } finally { emCurso = null }
}

export function useGoalSources(): GoalSources {
  const { account, masterKey } = useAuthVault()
  /*
    O guardado morre quando chega dado novo — manter valeria mostrar o de ontem.

    Escuta o evento direto, e não pelo `useReloadOnSync`: aquele também dispara
    ao montar, e apagaria o guardado justo na hora em que ele serve.
  */
  useEffect(() => {
    const aoSincronizar = () => { esquecerMetasGuardadas() }
    window.addEventListener(EVENTO_DADOS_SINCRONIZADOS, aoSincronizar)
    return () => window.removeEventListener(EVENTO_DADOS_SINCRONIZADOS, aoSincronizar)
  }, [])
  const [goals, setGoals] = useState<GoalEntity[]>(() => ultimo?.carga.goals ?? [])
  const [sources, setSources] = useState<AreaSources>(() => ultimo?.carga.sources ?? { entries: [], studies: [], uapgs: [], history: [] })
  const [churches, setChurches] = useState<ChurchEntity[]>(() => ultimo?.carga.churches ?? [])
  const [ready, setReady] = useState(() => Boolean(ultimo))

  const reload = useCallback(async () => {
    if (!account || !masterKey) return
    const carga = await carregar(account.id, masterKey)
    setGoals(carga.goals)
    setSources(carga.sources)
    setChurches(carga.churches)
    setReady(true)
  }, [account, masterKey])

  useEffect(() => { void reload() }, [reload])

  return { goals, sources, churches, ready, reload }
}
