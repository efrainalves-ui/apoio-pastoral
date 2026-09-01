import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { currentDeviceId } from '../auth/device'
import { useAuthVault } from '../auth/AuthVaultContext'
import { SyncService } from '../sync/service'
import { createSyncTransport } from '../sync/transport'
import { AppShell } from '../components/AppShell'
import { AuthPage } from '../pages/AuthPage'
import { AgendaFormPage } from '../pages/AgendaFormPage'
import { AgendaPage } from '../pages/AgendaPage'
import { BirthdaysPage } from '../pages/BirthdaysPage'
import { ChurchDetailPage } from '../pages/ChurchDetailPage'
import { ChurchFormPage } from '../pages/ChurchFormPage'
import { DistrictPage } from '../pages/DistrictPage'
import { InitialSetupPage } from '../pages/InitialSetupPage'
import { FamiliesPage } from '../pages/FamiliesPage'
import { FamilyDetailPage } from '../pages/FamilyDetailPage'
import { FamilyFormPage } from '../pages/FamilyFormPage'
import { HomePage } from '../pages/HomePage'
import { MemberImportPage } from '../pages/MemberImportPage'
import { MorePage } from '../pages/MorePage'
import { PeoplePage } from '../pages/PeoplePage'
import { PersonDetailPage } from '../pages/PersonDetailPage'
import { PersonFormPage } from '../pages/PersonFormPage'
import { SearchPage } from '../pages/SearchPage'
import { SecurityPage } from '../pages/SecurityPage'
import { SyncConflictsPage } from '../pages/SyncConflictsPage'
import { SyncPage } from '../pages/SyncPage'
import { SermonsPage } from '../pages/SermonsPage'
import { SermonFormPage } from '../pages/SermonFormPage'
import { SermonDetailPage } from '../pages/SermonDetailPage'
import { GoalsPage } from '../pages/GoalsPage'
import { MissionaryPage } from '../pages/MissionaryPage'
import { MissionaryPairsPage } from '../pages/MissionaryPairsPage'
import { CommunityGroupsPage } from '../pages/CommunityGroupsPage'
import { MissionaryGoalsPage } from '../pages/MissionaryGoalsPage'
import { ReportsPage } from '../pages/ReportsPage'
import { BackupPage } from '../pages/BackupPage'
import { CommissionsPage } from '../pages/CommissionsPage'
import { CommissionConfigPage } from '../pages/CommissionConfigPage'
import { CommissionKindPage } from '../pages/CommissionKindPage'
import { CommissionMeetingPage } from '../pages/CommissionMeetingPage'
import { NominationProcessesPage } from '../pages/NominationProcessesPage'
import { NominationProcessPage } from '../pages/NominationProcessPage'
import { PrayerRequestsPage } from '../pages/PrayerRequestsPage'
import { ReadingPage } from '../pages/ReadingPage'
import { AnnualPlanningPage } from '../pages/AnnualPlanningPage'
import { AnnualGoalPage } from '../pages/AnnualGoalPage'
import { EvangelismPage } from '../pages/EvangelismPage'
import { CampaignPage } from '../pages/CampaignPage'
import { DistrictService } from '../district/service'

const CarePage = lazy(() => import('../pages/CarePage').then((module) => ({ default: module.CarePage })))
const FidelityPage = lazy(() => import('../pages/FidelityPage').then((module) => ({ default: module.FidelityPage })))
const VisitDetailPage = lazy(() => import('../pages/VisitDetailPage').then((module) => ({ default: module.VisitDetailPage })))
const VisitFormPage = lazy(() => import('../pages/VisitFormPage').then((module) => ({ default: module.VisitFormPage })))
const VisitsPage = lazy(() => import('../pages/VisitsPage').then((module) => ({ default: module.VisitsPage })))
const FamilyBudgetPage = lazy(() => import('../pages/FamilyBudgetPage').then((module) => ({ default: module.FamilyBudgetPage })))

const districtService = new DistrictService()

/**
 * Um aparelho recém-autorizado chega com o cofre local vazio, mesmo quando a
 * conta já tem distrito. Sem uma primeira sincronização aqui, ele seria mandado
 * para a configuração inicial e criaria um distrito duplicado — e não teria como
 * escapar, porque a tela de Sincronização mora dentro da área protegida, que só
 * abre depois de existir distrito.
 *
 * A falha de sincronização é deliberadamente silenciosa: sem rede, ou com o
 * dispositivo revogado, o aparelho segue para a configuração inicial em vez de
 * travar na abertura.
 */
export function useDistrictPresence(): boolean | null {
  const { account, masterKey, recoveryCode } = useAuthVault()
  const [hasDistrict, setHasDistrict] = useState<boolean | null>(null)

  useEffect(() => {
    if (!account || !masterKey || recoveryCode) return
    let cancelled = false

    void (async () => {
      let district = await districtService.getDistrict(account.id, masterKey)
      if (!district) {
        const transport = createSyncTransport()
        if (transport.name !== 'disabled') {
          try {
            await new SyncService(transport).synchronize(account.id, currentDeviceId())
            district = await districtService.getDistrict(account.id, masterKey)
          } catch { /* segue para a configuração inicial */ }
        }
      }
      if (!cancelled) setHasDistrict(Boolean(district))
    })()

    return () => { cancelled = true }
  }, [account, masterKey, recoveryCode])

  return hasDistrict
}

function SetupAccess({ children }: { children: ReactNode }) {
  const { masterKey, recoveryCode } = useAuthVault()
  const hasDistrict = useDistrictPresence()
  if (!masterKey || recoveryCode) return <Navigate to="/acesso" replace />
  if (hasDistrict === null) return <div className="app-loading" role="status">Preparando seu distrito…</div>
  return hasDistrict ? <Navigate to="/app" replace /> : <>{children}</>
}

function ProtectedApp() {
  const { masterKey, recoveryCode } = useAuthVault()
  const hasDistrict = useDistrictPresence()
  if (!masterKey || recoveryCode) return <Navigate to="/acesso" replace />
  if (hasDistrict === null) return <div className="app-loading" role="status">Preparando sua área…</div>
  return hasDistrict ? <AppShell /> : <Navigate to="/configuracao-inicial" replace />
}

export function App() {
  const { masterKey, initialized, recoveryCode } = useAuthVault()
  if (!initialized) return <div className="app-loading" role="status">Preparando o acesso…</div>
  return <Suspense fallback={<div className="app-loading" role="status">Abrindo sua área…</div>}>
    <Routes>
      <Route path="/acesso" element={masterKey && !recoveryCode ? <Navigate to="/app" replace /> : <AuthPage />} />
      <Route path="/configuracao-inicial" element={<SetupAccess><InitialSetupPage /></SetupAccess>} />
      <Route path="/app" element={<ProtectedApp />}>
        <Route index element={<HomePage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="agenda/novo" element={<AgendaFormPage />} />
        <Route path="agenda/:eventId/editar" element={<AgendaFormPage />} />
        <Route path="sermoes" element={<SermonsPage />} />
        <Route path="sermoes/novo" element={<SermonFormPage />} />
        <Route path="sermoes/:sermonId" element={<SermonDetailPage />} />
        <Route path="sermoes/:sermonId/editar" element={<SermonFormPage />} />
        <Route path="metas" element={<GoalsPage />} />
        <Route path="metas/missionario" element={<MissionaryGoalsPage />} />
        <Route path="planejamento" element={<AnnualPlanningPage />} />
        <Route path="planejamento/nova" element={<AnnualGoalPage />} />
        <Route path="planejamento/:goalId" element={<AnnualGoalPage />} />
        <Route path="evangelismo" element={<EvangelismPage />} />
        <Route path="evangelismo/nova" element={<CampaignPage />} />
        <Route path="evangelismo/:campaignId" element={<CampaignPage />} />
        <Route path="relatorios" element={<ReportsPage />} />
        <Route path="missionario" element={<MissionaryPage />} />
        <Route path="missionario/duplas" element={<MissionaryPairsPage />} />
        <Route path="missionario/grupos" element={<CommunityGroupsPage />} />
        <Route path="pessoas" element={<PeoplePage />} />
        <Route path="pessoas/nova" element={<PersonFormPage />} />
        <Route path="pessoas/importar" element={<MemberImportPage />} />
        <Route path="pessoas/:personId" element={<PersonDetailPage />} />
        <Route path="pessoas/:personId/editar" element={<PersonFormPage />} />
        <Route path="familias" element={<FamiliesPage />} />
        <Route path="familias/nova" element={<FamilyFormPage />} />
        <Route path="familias/:familyId" element={<FamilyDetailPage />} />
        <Route path="familias/:familyId/editar" element={<FamilyFormPage />} />
        <Route path="aniversarios" element={<BirthdaysPage />} />
        <Route path="busca" element={<SearchPage />} />
        <Route path="fidelidade" element={<FidelityPage />} />
        <Route path="comissoes" element={<CommissionsPage />} />
        <Route path="comissoes/configurar" element={<CommissionConfigPage />} />
        <Route path="comissoes/diretiva" element={<CommissionKindPage kind="board" />} />
        <Route path="comissoes/administrativa" element={<CommissionKindPage kind="administrative" />} />
        <Route path="comissoes/nomeacoes" element={<NominationProcessesPage />} />
        <Route path="comissoes/nomeacoes/:processId" element={<NominationProcessPage />} />
        <Route path="comissoes/:meetingId" element={<CommissionMeetingPage />} />
        <Route path="orcamento" element={<Navigate to="/app/orcamento/resumo" replace />} />
        <Route path="orcamento/:section" element={<FamilyBudgetPage />} />
        <Route path="visitas" element={<VisitsPage />} />
        <Route path="visitas/nova" element={<VisitFormPage />} />
        <Route path="visitas/:visitId" element={<VisitDetailPage />} />
        <Route path="pedidos-oracao" element={<PrayerRequestsPage />} />
        <Route path="leitura" element={<ReadingPage />} />
        <Route path="cuidados" element={<CarePage />} />
        <Route path="distrito" element={<DistrictPage />} />
        <Route path="distrito/igrejas/nova" element={<ChurchFormPage />} />
        <Route path="distrito/igrejas/:churchId" element={<ChurchDetailPage />} />
        <Route path="distrito/igrejas/:churchId/editar" element={<ChurchFormPage />} />
        <Route path="mais" element={<MorePage />} />
        <Route path="sincronizacao" element={<SyncPage />} />
        <Route path="sincronizacao/conflitos" element={<SyncConflictsPage />} />
        <Route path="seguranca" element={<SecurityPage />} />
        <Route path="backup" element={<BackupPage />} />
      </Route>
      <Route path="*" element={<Navigate to={masterKey && !recoveryCode ? '/app' : '/acesso'} replace />} />
    </Routes>
  </Suspense>
}
