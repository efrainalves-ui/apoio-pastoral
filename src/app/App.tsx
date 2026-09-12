import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { currentDeviceId } from '../auth/device'
import { DeviceApprovalPage } from '../pages/DeviceApprovalPage'
import { db } from '../db/database'
import { useAuthVault } from '../auth/AuthVaultContext'
import { pendingDistrictClosure } from '../district/closeDistrict'
import { currentEnvironmentProblem } from '../sync/config'
import { SyncService, firstSyncPending, syncConfirmed } from '../sync/service'
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
import { ResumeClosurePage } from '../pages/ResumeClosurePage'
import { FamiliesPage } from '../pages/FamiliesPage'
import { FamilyDetailPage } from '../pages/FamilyDetailPage'
import { FamilyFormPage } from '../pages/FamilyFormPage'
import { HomePage } from '../pages/HomePage'
import { MorePage } from '../pages/MorePage'
import { PrivacyPage } from '../pages/PrivacyPage'
import { CommunityGroupsPage } from '../pages/CommunityGroupsPage'
import { CloseDistrictPage } from '../pages/CloseDistrictPage'
import { PeoplePage } from '../pages/PeoplePage'
import { MemberImportPage } from '../pages/MemberImportPage'
import { PersonDetailPage } from '../pages/PersonDetailPage'
import { PersonFormPage } from '../pages/PersonFormPage'
import { SearchPage } from '../pages/SearchPage'
import { SecurityPage } from '../pages/SecurityPage'
import { SyncConflictsPage } from '../pages/SyncConflictsPage'
import { SyncPage } from '../pages/SyncPage'
import { SermonsPage } from '../pages/SermonsPage'
import { SermonFormPage } from '../pages/SermonFormPage'
import { SermonReadingPage } from '../pages/SermonReadingPage'
import { SermonDetailPage } from '../pages/SermonDetailPage'
import { GoalsPage } from '../pages/GoalsPage'
import { MissionaryPairsPage } from '../pages/MissionaryPairsPage'
import { GoalAreaPage } from '../pages/GoalAreaPage'
import { BackupPage } from '../pages/BackupPage'
import { MigracaoDosPessoais } from '../db/migrarPessoais'
import { ReparoDeIdentificadores } from '../db/repararIdentificadores'
import { notificarDadosSincronizados } from '../sync/useReloadOnSync'
import { RestoreBackupPage } from '../pages/RestoreBackupPage'
import { CommissionsPage } from '../pages/CommissionsPage'
import { CommissionConfigPage } from '../pages/CommissionConfigPage'
import { CommissionKindPage } from '../pages/CommissionKindPage'
import { CommissionMeetingPage } from '../pages/CommissionMeetingPage'
import { NominationProcessesPage } from '../pages/NominationProcessesPage'
import { NominationProcessPage } from '../pages/NominationProcessPage'
import { ReadingPage } from '../pages/ReadingPage'
import { AnnualPlanningPage } from '../pages/AnnualPlanningPage'
import { AnnualGoalPage } from '../pages/AnnualGoalPage'
import { GoalTrackingPage } from '../pages/GoalTrackingPage'
import { EvangelismPage } from '../pages/EvangelismPage'
import { CampaignPage } from '../pages/CampaignPage'
import { MaterialsPage } from '../pages/MaterialsPage'
import { WorkBudgetPage } from '../pages/WorkBudgetPage'
import { AcmsPage } from '../pages/AcmsPage'
import { UsefulLinksPage } from '../pages/UsefulLinksPage'
import { DistrictService } from '../district/service'

const FidelityPage = lazy(() => import('../pages/FidelityPage').then((module) => ({ default: module.FidelityPage })))
const VisitDetailPage = lazy(() => import('../pages/VisitDetailPage').then((module) => ({ default: module.VisitDetailPage })))
const VisitFormPage = lazy(() => import('../pages/VisitFormPage').then((module) => ({ default: module.VisitFormPage })))
const VisitationPage = lazy(() => import('../pages/VisitationPage').then((module) => ({ default: module.VisitationPage })))
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
/**
 * `null` enquanto verifica, `'indisponivel'` quando não deu para receber os
 * dados desta conta neste aparelho, e o booleano quando a resposta é confiável.
 */
export type DistrictPresence = boolean | 'indisponivel' | null

export function useDistrictPresence(): DistrictPresence {
  const { account, masterKey, syncKey, recoveryCode } = useAuthVault()
  const [presenca, setPresenca] = useState<DistrictPresence>(null)

  useEffect(() => {
    if (!account || !masterKey || recoveryCode) return
    let cancelled = false

    void (async () => {
      let district = await districtService.getDistrict(account.id, masterKey)
      if (!district) {
        const transport = createSyncTransport()
        if (transport.name !== 'disabled' && syncKey) {
          // Offline, erro, cancelamento, páginas faltando ou cursor parado são
          // a mesma coisa aqui: a rodada não terminou. Enquanto este aparelho
          // nunca tiver concluído uma sincronização desta conta, "nada aqui"
          // não quer dizer "conta vazia" — e mandar criar um distrito agora
          // criaria um segundo por cima do primeiro.
          let confirmada: boolean
          try {
            confirmada = syncConfirmed(await new SyncService(transport).synchronize(account.id, currentDeviceId(account.id), syncKey))
          } catch { confirmada = false }
          if (cancelled) return
          if (!confirmada && await firstSyncPending(account.id)) { if (!cancelled) setPresenca('indisponivel'); return }
          district = await districtService.getDistrict(account.id, masterKey)
        }
      }
      if (!cancelled) setPresenca(Boolean(district))
    })()

    return () => { cancelled = true }
  }, [account, masterKey, syncKey, recoveryCode])

  return presenca
}

/**
 * Encerramento de distrito interrompido no instante em que este aparelho ficou
 * sem autorização nenhuma. Vem antes de tudo: nenhuma outra verificação faz
 * sentido enquanto o aparelho não voltar a ter autorização.
 */
function usePendingClosure(): { pending: boolean | null; done: () => void } {
  const { account, masterKey, recoveryCode } = useAuthVault()
  const [pending, setPending] = useState<boolean | null>(null)

  useEffect(() => {
    if (!account || !masterKey || recoveryCode) return
    let cancelled = false
    void pendingDistrictClosure(account.id).then((existe) => { if (!cancelled) setPending(existe) })
    return () => { cancelled = true }
  }, [account, masterKey, recoveryCode])

  return { pending, done: () => setPending(false) }
}

/**
 * Uma instalação nova abre o cofre com a senha, mas fica aguardando a
 * confirmação de um aparelho já ativo antes de sincronizar. Esta checagem vem
 * antes da do distrito: sem ela, o aparelho pendente tentaria sincronizar, não
 * receberia nada e seria mandado criar um distrito duplicado.
 */
function useCurrentDeviceApproval(): { pending: boolean | null; approve: () => void } {
  const { account, masterKey, recoveryCode } = useAuthVault()
  const [pending, setPending] = useState<boolean | null>(null)

  useEffect(() => {
    if (!account || !masterKey || recoveryCode) return
    let cancelled = false
    void db.devices.get(currentDeviceId(account.id)).then((device) => {
      if (!cancelled) setPending(device?.accountId === account.id && device.status === 'pending')
    })
    return () => { cancelled = true }
  }, [account, masterKey, recoveryCode])

  return { pending, approve: () => setPending(false) }
}

/**
 * Espera consciente: este aparelho ainda não recebeu os dados da conta e a
 * tentativa falhou. Mandar criar um distrito aqui produziria um segundo
 * distrito e duplicaria o trabalho do pastor.
 */
function SyncPending() {
  return (
    <div className="page-stack page-narrow">
      <header className="page-hero"><div><p className="eyebrow">Aguardando seus dados</p><h1>Ainda não recebemos os dados desta conta neste aparelho</h1><p>Este aparelho entrou na sua conta, mas a primeira sincronização não terminou. Conecte-se à internet e tente de novo. Não crie um distrito novo agora: os dados que já existem chegariam depois e ficariam duplicados.</p></div></header>
      <Link className="button button--secondary" to="/restaurar-backup">Restaurar de um backup</Link>
      <button type="button" className="button" onClick={() => window.location.reload()}>Tentar de novo</button>
    </div>
  )
}

/**
 * Acesso à restauração: cofre aberto basta.
 *
 * Não exige distrito de propósito — é justamente quem não tem distrito que
 * precisa restaurar. Encerramento pendente e aprovação de aparelho continuam
 * valendo: são anteriores a qualquer coisa que se faça com os dados.
 */
/**
 * Traz para o cofre, uma vez por aparelho, o que ficou nos bancos pessoais.
 *
 * Precisa acontecer antes de as telas lerem: elas agora procuram leitura,
 * orçamento e lista de compras no cofre, e sem a mudança o pastor abriria o
 * aplicativo e veria tudo vazio. Roda em silêncio e avisa as telas quando
 * termina, para elas relerem sem que ninguém precise recarregar a página.
 *
 * Uma falha aqui não trava o aplicativo: o banco antigo continua intacto, e a
 * próxima abertura tenta de novo.
 */
function useMudancaDosPessoais() {
  const { account, masterKey } = useAuthVault()
  const [pronta, setPronta] = useState(false)

  useEffect(() => {
    if (!account || !masterKey) return
    let cancelado = false
    void (async () => {
      try {
        /*
          O reparo vem antes: enquanto houver um identificador que o serviço
          recusa, nada sai deste aparelho — nem o que a mudança acabou de trazer.
        */
        const reparo = await new ReparoDeIdentificadores().reparar(account.id, masterKey)
        const resultado = await new MigracaoDosPessoais().mover(account.id, masterKey)
        if (resultado.movidos > 0 || reparo.reparados > 0) notificarDadosSincronizados()
      } catch {
        // O lugar antigo continua intacto; a próxima abertura tenta outra vez.
      } finally {
        if (!cancelado) setPronta(true)
      }
    })()
    return () => { cancelado = true }
  }, [account, masterKey])

  return pronta
}

function RestoreAccess({ children }: { children: ReactNode }) {
  const { masterKey, recoveryCode } = useAuthVault()
  const encerramento = usePendingClosure()
  const { pending, approve } = useCurrentDeviceApproval()
  if (!masterKey || recoveryCode) return <Navigate to="/acesso" replace />
  if (encerramento.pending === null) return <div className="app-loading" role="status">Preparando seu distrito…</div>
  if (encerramento.pending) return <ResumeClosurePage onDone={encerramento.done} />
  if (pending === null) return <div className="app-loading" role="status">Preparando seu distrito…</div>
  if (pending) return <DeviceApprovalPage onApproved={approve} />
  return <>{children}</>
}

function SetupAccess({ children }: { children: ReactNode }) {
  const { masterKey, recoveryCode } = useAuthVault()
  const encerramento = usePendingClosure()
  const { pending, approve } = useCurrentDeviceApproval()
  const hasDistrict = useDistrictPresence()
  if (!masterKey || recoveryCode) return <Navigate to="/acesso" replace />
  if (encerramento.pending === null) return <div className="app-loading" role="status">Preparando seu distrito…</div>
  if (encerramento.pending) return <ResumeClosurePage onDone={encerramento.done} />
  if (pending === null) return <div className="app-loading" role="status">Preparando seu distrito…</div>
  if (pending) return <DeviceApprovalPage onApproved={approve} />
  if (hasDistrict === null) return <div className="app-loading" role="status">Preparando seu distrito…</div>
  if (hasDistrict === 'indisponivel') return <SyncPending />
  return hasDistrict ? <Navigate to="/app" replace /> : <>{children}</>
}

function ProtectedApp() {
  const { masterKey, recoveryCode } = useAuthVault()
  const encerramento = usePendingClosure()
  const { pending, approve } = useCurrentDeviceApproval()
  const hasDistrict = useDistrictPresence()
  const pessoaisProntos = useMudancaDosPessoais()
  if (!masterKey || recoveryCode) return <Navigate to="/acesso" replace />
  if (!pessoaisProntos) return <div className="app-loading" role="status">Preparando sua área…</div>
  if (encerramento.pending === null) return <div className="app-loading" role="status">Preparando sua área…</div>
  if (encerramento.pending) return <ResumeClosurePage onDone={encerramento.done} />
  if (pending === null) return <div className="app-loading" role="status">Preparando sua área…</div>
  if (pending) return <DeviceApprovalPage onApproved={approve} />
  if (hasDistrict === null) return <div className="app-loading" role="status">Preparando sua área…</div>
  if (hasDistrict === 'indisponivel') return <SyncPending />
  return hasDistrict ? <AppShell /> : <Navigate to="/configuracao-inicial" replace />
}

/**
 * Build mal configurada não abre.
 *
 * Uma build que declara homologação ou produção e não tem endereço, chave
 * pública ou projeto declarado — ou tem os três discordando — não pode cair no
 * modo local em silêncio: o pastor cadastraria o distrito inteiro achando que
 * está sincronizando. E uma build que não declara ambiente nenhum também não
 * abre: modo local passou a ser uma escolha escrita, não o que sobra.
 */
function EnvironmentBlocked({ problema }: { problema: string }) {
  return (
    <div className="page-stack page-narrow">
      <header className="page-hero"><div><h1>Esta instalação não está configurada</h1></div></header>
      <div className="alert alert--error" role="alert">{problema}</div>
      <p className="card-copy">Nenhum dado foi aberto e nenhuma conexão foi feita. Corrija a configuração desta instalação e recarregue a página.</p>
    </div>
  )
}

export function App() {
  const { masterKey, initialized, recoveryCode } = useAuthVault()
  const problemaDeAmbiente = currentEnvironmentProblem()
  if (problemaDeAmbiente) return <EnvironmentBlocked problema={problemaDeAmbiente} />
  if (!initialized) return <div className="app-loading" role="status">Preparando o acesso…</div>
  return <Suspense fallback={<div className="app-loading" role="status">Abrindo sua área…</div>}>
    <Routes>
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route path="/acesso" element={masterKey && !recoveryCode ? <Navigate to="/app" replace /> : <AuthPage />} />
      <Route path="/configuracao-inicial" element={<SetupAccess><InitialSetupPage /></SetupAccess>} />
      <Route path="/restaurar-backup" element={<RestoreAccess><RestoreBackupPage /></RestoreAccess>} />
      <Route path="/app" element={<ProtectedApp />}>
        <Route index element={<HomePage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="agenda/novo" element={<AgendaFormPage />} />
        <Route path="agenda/:eventId/editar" element={<AgendaFormPage />} />
        <Route path="sermoes" element={<SermonsPage />} />
        <Route path="sermoes/novo" element={<SermonFormPage />} />
        <Route path="sermoes/:sermonId" element={<SermonDetailPage />} />
        <Route path="sermoes/:sermonId/pregar" element={<SermonReadingPage />} />
        <Route path="sermoes/:sermonId/editar" element={<SermonFormPage />} />
        <Route path="metas" element={<GoalsPage />} />
        <Route path="metas/:area" element={<GoalAreaPage />} />
        <Route path="planejamento" element={<AnnualPlanningPage />} />
        <Route path="planejamento/nova" element={<AnnualGoalPage />} />
        <Route path="planejamento/:goalId" element={<GoalTrackingPage />} />
        <Route path="planejamento/:goalId/editar" element={<AnnualGoalPage />} />
        <Route path="evangelismo" element={<EvangelismPage />} />
        <Route path="evangelismo/nova" element={<CampaignPage />} />
        <Route path="evangelismo/:campaignId" element={<CampaignPage />} />
        <Route path="metas/missao/estudos" element={<Navigate to="/app/metas/bible_studies" replace />} />
        <Route path="metas/missao/duplas" element={<MissionaryPairsPage />} />
        <Route path="metas/missao/grupos" element={<Navigate to="/app/metas/uapg" replace />} />
        <Route path="metas/uapg" element={<CommunityGroupsPage />} />
        <Route path="missionario" element={<Navigate to="/app/metas/missao/estudos" replace />} />
        <Route path="missionario/duplas" element={<Navigate to="/app/metas/missao/duplas" replace />} />
        <Route path="missionario/grupos" element={<Navigate to="/app/metas/missao/grupos" replace />} />
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
        {/* Trabalho vem antes: um segmento fixo precisa vencer o `:section`. */}
        <Route path="orcamento/trabalho" element={<Navigate to="/app/orcamento/trabalho/resumo" replace />} />
        <Route path="orcamento/trabalho/:section" element={<WorkBudgetPage />} />
        <Route path="orcamento/:section" element={<FamilyBudgetPage />} />
        <Route path="materiais" element={<MaterialsPage />} />
        <Route path="metas/acms" element={<AcmsPage />} />
        <Route path="links" element={<UsefulLinksPage />} />
        <Route path="visitacao" element={<VisitationPage />} />
        <Route path="visitas" element={<Navigate to="/app/visitacao" replace />} />
        <Route path="visitas/nova" element={<VisitFormPage />} />
        <Route path="visitas/:visitId" element={<VisitDetailPage />} />
        <Route path="visitas/:visitId/editar" element={<VisitFormPage />} />
        <Route path="pedidos-oracao" element={<Navigate to="/app/visitacao?aba=oracao" replace />} />
        <Route path="leitura" element={<ReadingPage />} />
        <Route path="cuidados" element={<Navigate to="/app/visitacao?aba=acompanhamentos" replace />} />
        <Route path="distrito" element={<DistrictPage />} />
        <Route path="distrito/igrejas/nova" element={<ChurchFormPage />} />
        <Route path="distrito/igrejas/:churchId" element={<ChurchDetailPage />} />
        <Route path="distrito/igrejas/:churchId/editar" element={<ChurchFormPage />} />
        <Route path="configuracoes" element={<MorePage />} />
        <Route path="configuracoes/privacidade" element={<PrivacyPage />} />
        <Route path="configuracoes/encerrar-distrito" element={<CloseDistrictPage />} />
        <Route path="mais" element={<Navigate to="/app/configuracoes" replace />} />
        <Route path="sincronizacao" element={<SyncPage />} />
        <Route path="sincronizacao/conflitos" element={<SyncConflictsPage />} />
        <Route path="seguranca" element={<SecurityPage />} />
        <Route path="backup" element={<BackupPage />} />
      </Route>
      <Route path="*" element={<Navigate to={masterKey && !recoveryCode ? '/app' : '/acesso'} replace />} />
    </Routes>
  </Suspense>
}
