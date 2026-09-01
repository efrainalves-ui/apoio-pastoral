import { useCallback, useEffect, useState } from 'react'
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
export function useGoalSources(): GoalSources {
  const { account, masterKey } = useAuthVault()
  const [goals, setGoals] = useState<GoalEntity[]>([])
  const [sources, setSources] = useState<AreaSources>({ entries: [], studies: [], uapgs: [] })
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [ready, setReady] = useState(false)

  const reload = useCallback(async () => {
    if (!account || !masterKey) return
    const district = await districtService.getDistrict(account.id, masterKey)
    const [nextGoals, entries, studies, uapgs, nextChurches] = await Promise.all([
      goalsService.listGoals(account.id, masterKey),
      goalsService.listEntries(account.id, masterKey),
      missionary.listStudies(account.id, masterKey),
      missionary.listUapgs(account.id, masterKey),
      district ? districtService.listChurches(account.id, masterKey, district.id) : [],
    ])
    setGoals(nextGoals)
    setSources({ entries, studies, uapgs })
    setChurches(nextChurches)
    setReady(true)
  }, [account, masterKey])

  useEffect(() => { void reload() }, [reload])

  return { goals, sources, churches, ready, reload }
}
