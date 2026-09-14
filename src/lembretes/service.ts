import { AgendaService } from '../agenda/service'
import { currentDeviceId } from '../auth/device'
import { CareService } from '../care/service'
import { CommissionService } from '../commissions/service'
import { decryptRecord, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { EvangelismPlanningService } from '../evangelism/service'
import { familyBudgetDb, type FamilyBudgetDatabase } from '../family-budget/database'
import { FamilyBudgetService } from '../family-budget/service'
import { MaterialsService } from '../materials/service'
import { NominationService } from '../nominations/service'
import { idDerivado } from '../shared/idDerivado'
import { firstSyncPending } from '../sync/service'
import { itensDosLembretes, type ItemDaCentral } from './central'
import { itensDasAreas } from './origens'
import { ocorrenciaAberta } from './repeticao'
import { fusoDoAparelho, somarDias } from './tempo'
import {
  LISTAS_INICIAIS, type AlteracaoDeOcorrencia, type LembreteData, type LembreteEntity, type ListaDeLembretesData, type ListaDeLembretesEntity,
  type MetadadosDeTarefaData, type MetadadosDeTarefaEntity,
} from './types'

type TipoDaCentral = 'reminder' | 'reminder_list' | 'reminder_meta'
export type LembreteInput = Omit<LembreteData, 'estado' | 'concluidoEm' | 'ocorrencias' | 'createdAt' | 'updatedAt'>
export type ListaInput = Pick<ListaDeLembretesData, 'nome' | 'descricao' | 'icone' | 'cor'>
export type EscopoDaEdicao = 'esta' | 'proximas' | 'serie'

const agoraIso = () => new Date().toISOString()

export function lembreteVazio(listaId: string | null, fuso = fusoDoAparelho()): LembreteInput {
  return { titulo: '', observacao: '', listaId, data: '', hora: '', fuso, prioridade: 'normal', sinalizado: false, repeticao: null, notificar: false, relacionado: {} }
}

function validarLembrete(input: LembreteInput): void {
  if (!input.titulo.trim()) throw new Error('Informe o que você precisa lembrar.')
  if (input.hora && !input.data) throw new Error('Escolha a data do horário.')
  if (input.repeticao && !input.data) throw new Error('Um lembrete que se repete precisa de data de início.')
  if (input.repeticao?.frequencia === 'mensal' && input.repeticao.diaDoMes !== undefined && (input.repeticao.diaDoMes < 1 || input.repeticao.diaDoMes > 31)) throw new Error('Escolha um dia do mês entre 1 e 31.')
}

/**
 * A Central de Lembretes sobre o cofre.
 *
 * Tudo passa pelo repositório cifrado e pela sincronização de sempre: não há
 * segundo armazenamento. As tarefas das outras áreas são lidas das próprias
 * áreas a cada carga; o que se grava aqui é só o lembrete manual, a lista e a
 * marcação ligada ao identificador da origem.
 */
export class LembreteService {
  private readonly repository: VaultRepository
  private readonly care: CareService
  private readonly commissions: CommissionService
  private readonly nominations: NominationService
  private readonly evangelism: EvangelismPlanningService
  private readonly agenda: AgendaService
  private readonly budget: FamilyBudgetService
  private readonly materials: MaterialsService

  constructor(private readonly database: ApoioDatabase = db, orcamento: FamilyBudgetDatabase = familyBudgetDb) {
    this.repository = new VaultRepository(database)
    this.care = new CareService(database)
    this.commissions = new CommissionService(database)
    this.nominations = new NominationService(database)
    this.evangelism = new EvangelismPlanningService(database)
    this.agenda = new AgendaService(database)
    this.budget = new FamilyBudgetService(orcamento)
    this.materials = new MaterialsService(database)
  }

  private async ler<T>(accountId: string, masterKey: CryptoKey, tipo: TipoDaCentral): Promise<Array<T & { id: string }>> {
    const registros = await this.repository.list(accountId, tipo)
    const lidos: Array<(T & { id: string }) | null> = await Promise.all(registros.map(async (registro: VaultRecord) => {
      const payload = await decryptRecord(masterKey, registro)
      return payload?.type === tipo ? { ...(payload.data as T), id: registro.id } : null
    }))
    return lidos.filter((item): item is T & { id: string } => item !== null)
  }

  private async gravar<T extends object>(accountId: string, masterKey: CryptoKey, tipo: TipoDaCentral, id: string, data: T): Promise<T & { id: string }> {
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: tipo, data }, id), tipo)
    return { id, ...data }
  }

  private async apagar(accountId: string, masterKey: CryptoKey, tipo: TipoDaCentral, id: string): Promise<void> {
    const lapide = await encryptPayload(masterKey, { schemaVersion: 1, type: `${tipo}_tombstone`, data: { deletedAt: agoraIso() } }, id)
    await this.repository.deleteEncrypted(accountId, currentDeviceId(accountId), id, lapide)
  }

  // ------------------------------------------------------------------ listas

  async listas(accountId: string, masterKey: CryptoKey): Promise<ListaDeLembretesEntity[]> {
    return (await this.ler<ListaDeLembretesData>(accountId, masterKey, 'reminder_list')).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  /**
   * Pessoal, Rotinas e Compras, uma vez só.
   *
   * O identificador vem da conta e do nome da semente: dois aparelhos criam o
   * mesmo registro, e abrir de novo não cria outro. Lista que o pastor excluiu
   * deixou lápide no aparelho e não volta. Num aparelho novo, espera a primeira
   * sincronização trazer as que já existem, para não recriar por cima delas.
   */
  async prepararListasIniciais(accountId: string, masterKey: CryptoKey): Promise<number> {
    if (await firstSyncPending(accountId, this.database)) return 0
    let criadas = 0
    for (const semente of LISTAS_INICIAIS) {
      const id = await idDerivado(`apoio-pastoral:${accountId}:lista:${semente.semente}`)
      if (await this.database.vaultRecords.get(id)) continue
      const agora = agoraIso()
      await this.gravar<ListaDeLembretesData>(accountId, masterKey, 'reminder_list', id, { ...semente, arquivada: false, createdAt: agora, updatedAt: agora })
      criadas += 1
    }
    return criadas
  }

  async salvarLista(accountId: string, masterKey: CryptoKey, input: ListaInput, id?: string): Promise<ListaDeLembretesEntity> {
    if (!input.nome.trim()) throw new Error('Dê um nome à lista.')
    const listas = await this.listas(accountId, masterKey)
    const atual = id ? listas.find((lista) => lista.id === id) : undefined
    const agora = agoraIso()
    const data: ListaDeLembretesData = {
      nome: input.nome.trim(), descricao: input.descricao.trim(), icone: input.icone, cor: input.cor,
      ordem: atual?.ordem ?? (Math.max(0, ...listas.map(({ ordem }) => ordem)) + 1), arquivada: atual?.arquivada ?? false,
      semente: atual?.semente ?? null, createdAt: atual?.createdAt ?? agora, updatedAt: agora,
    }
    return this.gravar(accountId, masterKey, 'reminder_list', id ?? crypto.randomUUID(), data)
  }

  async reordenarListas(accountId: string, masterKey: CryptoKey, ids: readonly string[]): Promise<void> {
    const listas = await this.listas(accountId, masterKey)
    for (const [indice, id] of ids.entries()) {
      const lista = listas.find((item) => item.id === id)
      if (!lista || lista.ordem === indice + 1) continue
      const { id: _id, ...data } = lista; void _id
      await this.gravar(accountId, masterKey, 'reminder_list', id, { ...data, ordem: indice + 1, updatedAt: agoraIso() })
    }
  }

  async arquivarLista(accountId: string, masterKey: CryptoKey, id: string, arquivada: boolean): Promise<void> {
    const lista = (await this.listas(accountId, masterKey)).find((item) => item.id === id)
    if (!lista) throw new Error('Lista não encontrada.')
    const { id: _id, ...data } = lista; void _id
    await this.gravar(accountId, masterKey, 'reminder_list', id, { ...data, arquivada, updatedAt: agoraIso() })
  }

  /**
   * Excluir uma lista nunca leva tarefas embora em silêncio: com tarefas dentro,
   * quem chama precisa dizer se elas vão para outra lista ou se são excluídas.
   */
  async excluirLista(accountId: string, masterKey: CryptoKey, id: string, destino?: { moverPara: string } | 'excluir_tarefas'): Promise<void> {
    const lembretes = (await this.lembretes(accountId, masterKey)).filter((lembrete) => lembrete.listaId === id)
    const metas = [...(await this.metadados(accountId, masterKey)).values()].filter((meta) => meta.listaId === id)
    if ((lembretes.length || metas.length) && !destino) throw new Error('A lista tem tarefas: escolha para onde elas vão ou se serão excluídas.')
    if (destino && destino !== 'excluir_tarefas' && destino.moverPara === id) throw new Error('Escolha outra lista para receber as tarefas.')
    for (const lembrete of lembretes) {
      if (destino === 'excluir_tarefas') await this.apagar(accountId, masterKey, 'reminder', lembrete.id)
      else if (destino) { const { id: lembreteId, ...data } = lembrete; await this.gravar(accountId, masterKey, 'reminder', lembreteId, { ...data, listaId: destino.moverPara, updatedAt: agoraIso() }) }
    }
    // Tarefa de outra área não é excluída daqui: volta a não ter lista, e continua na área dela.
    for (const meta of metas) {
      const { id: metaId, ...data } = meta
      await this.gravar(accountId, masterKey, 'reminder_meta', metaId, { ...data, listaId: destino && destino !== 'excluir_tarefas' ? destino.moverPara : null, updatedAt: agoraIso() })
    }
    await this.apagar(accountId, masterKey, 'reminder_list', id)
  }

  // --------------------------------------------------------------- lembretes

  async lembretes(accountId: string, masterKey: CryptoKey): Promise<LembreteEntity[]> {
    return this.ler<LembreteData>(accountId, masterKey, 'reminder')
  }

  async salvarLembrete(accountId: string, masterKey: CryptoKey, input: LembreteInput, id?: string): Promise<LembreteEntity> {
    validarLembrete(input)
    const atual = id ? (await this.lembretes(accountId, masterKey)).find((lembrete) => lembrete.id === id) : undefined
    const agora = agoraIso()
    const data: LembreteData = {
      ...input, titulo: input.titulo.trim(), observacao: input.observacao.trim(),
      estado: atual?.estado ?? 'aberto', concluidoEm: atual?.concluidoEm ?? null, ocorrencias: atual?.ocorrencias ?? {},
      createdAt: atual?.createdAt ?? agora, updatedAt: agora,
    }
    return this.gravar(accountId, masterKey, 'reminder', id ?? crypto.randomUUID(), data)
  }

  async excluirLembrete(accountId: string, masterKey: CryptoKey, id: string): Promise<void> {
    await this.apagar(accountId, masterKey, 'reminder', id)
  }

  private async obterLembrete(accountId: string, masterKey: CryptoKey, id: string): Promise<LembreteEntity> {
    const lembrete = (await this.lembretes(accountId, masterKey)).find((item) => item.id === id)
    if (!lembrete) throw new Error('Lembrete não encontrado.')
    return lembrete
  }

  /**
   * Conclui o lembrete — ou, numa série, só a ocorrência indicada.
   *
   * A ocorrência é identificada pela data original; concluir de novo a mesma
   * data não muda nada, e as ocorrências anteriores ficam como estavam.
   */
  async concluir(accountId: string, masterKey: CryptoKey, id: string, ocorrencia: string | null, concluido = true): Promise<LembreteEntity> {
    const { id: lembreteId, ...lembrete } = await this.obterLembrete(accountId, masterKey, id)
    const agora = agoraIso()
    if (lembrete.repeticao && ocorrencia) {
      const registro = { ...lembrete.ocorrencias[ocorrencia] }
      if (concluido) { registro.estado = 'concluida'; registro.concluidaEm = registro.concluidaEm ?? agora } else { delete registro.estado; delete registro.concluidaEm }
      return this.gravar(accountId, masterKey, 'reminder', lembreteId, { ...lembrete, ocorrencias: { ...lembrete.ocorrencias, [ocorrencia]: registro }, updatedAt: agora })
    }
    return this.gravar(accountId, masterKey, 'reminder', lembreteId, { ...lembrete, estado: concluido ? 'concluido' : 'aberto', concluidoEm: concluido ? lembrete.concluidoEm ?? agora : null, updatedAt: agora })
  }

  /**
   * Editar um lembrete — numa série, só esta ocorrência, esta e as próximas, ou
   * a série inteira.
   *
   * "Esta e as próximas" encerra a série original na véspera e começa uma nova
   * nesta data; o histórico da original fica com ela.
   */
  async editar(accountId: string, masterKey: CryptoKey, id: string, ocorrencia: string | null, escopo: EscopoDaEdicao, input: LembreteInput): Promise<LembreteEntity> {
    const atual = await this.obterLembrete(accountId, masterKey, id)
    if (!atual.repeticao || !ocorrencia || escopo === 'serie') return this.salvarLembrete(accountId, masterKey, input, id)
    validarLembrete(input)
    const { id: lembreteId, ...dados } = atual
    const agora = agoraIso()
    if (escopo === 'esta') {
      const alteracao: AlteracaoDeOcorrencia = {
        ...(input.titulo.trim() !== atual.titulo ? { titulo: input.titulo.trim() } : {}),
        ...(input.data && input.data !== ocorrencia ? { data: input.data } : {}),
        ...(input.hora !== atual.hora ? { hora: input.hora } : {}),
        ...(input.prioridade !== atual.prioridade ? { prioridade: input.prioridade } : {}),
        ...(input.sinalizado !== atual.sinalizado ? { sinalizado: input.sinalizado } : {}),
      }
      return this.gravar(accountId, masterKey, 'reminder', lembreteId, { ...dados, ocorrencias: { ...dados.ocorrencias, [ocorrencia]: { ...dados.ocorrencias[ocorrencia], alteracao } }, updatedAt: agora })
    }
    const vespera = somarDias(ocorrencia, -1)
    if (ocorrencia <= atual.data) return this.salvarLembrete(accountId, masterKey, input, id)
    await this.gravar(accountId, masterKey, 'reminder', lembreteId, { ...dados, repeticao: { ...atual.repeticao, ate: vespera }, updatedAt: agora })
    return this.salvarLembrete(accountId, masterKey, { ...input, data: input.data && input.data >= ocorrencia ? input.data : ocorrencia })
  }

  /** Adia o lembrete; numa série, só a ocorrência aberta muda de dia. */
  async adiar(accountId: string, masterKey: CryptoKey, id: string, ocorrencia: string | null, para: { data: string; hora: string }): Promise<LembreteEntity> {
    const { id: lembreteId, ...dados } = await this.obterLembrete(accountId, masterKey, id)
    const agora = agoraIso()
    if (dados.repeticao && ocorrencia) {
      const registro = dados.ocorrencias[ocorrencia] ?? {}
      return this.gravar(accountId, masterKey, 'reminder', lembreteId, { ...dados, ocorrencias: { ...dados.ocorrencias, [ocorrencia]: { ...registro, alteracao: { ...registro.alteracao, data: para.data, hora: para.hora } } }, updatedAt: agora })
    }
    return this.gravar(accountId, masterKey, 'reminder', lembreteId, { ...dados, data: para.data, hora: para.hora, updatedAt: agora })
  }

  // -------------------------------------------------- tarefas de outras áreas

  async metadados(accountId: string, masterKey: CryptoKey): Promise<Map<string, MetadadosDeTarefaEntity>> {
    return new Map((await this.ler<MetadadosDeTarefaData>(accountId, masterKey, 'reminder_meta')).map((meta) => [meta.origem, meta]))
  }

  /** Grava só a marcação da Central sobre uma tarefa de outra área, com identificador derivado da origem. */
  async marcarTarefa(accountId: string, masterKey: CryptoKey, origem: string, mudancas: Partial<Pick<MetadadosDeTarefaData, 'sinalizado' | 'prioridade' | 'adiadaPara' | 'listaId'>>): Promise<MetadadosDeTarefaEntity> {
    const id = await idDerivado(`apoio-pastoral:${accountId}:tarefa:${origem}`)
    const atual = (await this.metadados(accountId, masterKey)).get(origem)
    const agora = agoraIso()
    const data: MetadadosDeTarefaData = {
      origem, sinalizado: atual?.sinalizado ?? false, prioridade: atual?.prioridade ?? null, adiadaPara: atual?.adiadaPara ?? null, listaId: atual?.listaId ?? null,
      ...mudancas, createdAt: atual?.createdAt ?? agora, updatedAt: agora,
    }
    return this.gravar(accountId, masterKey, 'reminder_meta', id, data)
  }

  /**
   * Conclui uma tarefa de outra área na própria origem.
   *
   * Só onde a origem tem a ação equivalente. Nas demais, devolve `abrir`: quem
   * chamou leva o pastor à tela da origem, e nada é dado como concluído.
   */
  async concluirNaOrigem(accountId: string, masterKey: CryptoKey, item: Pick<ItemDaCentral, 'origem' | 'podeConcluir'>): Promise<'concluido' | 'abrir'> {
    if (!item.origem || !item.podeConcluir) return 'abrir'
    const [tipo, id, subId] = item.origem.split(':')
    if (tipo === 'task') {
      const tarefa = (await this.care.listTasks(accountId, masterKey)).find((atual) => atual.id === id)
      if (!tarefa) return 'abrir'
      await this.care.updateTask(accountId, masterKey, tarefa, 'completed'); return 'concluido'
    }
    if (tipo === 'follow_up') {
      const retorno = (await this.care.listFollowUps(accountId, masterKey)).find((atual) => atual.id === id)
      if (!retorno) return 'abrir'
      await this.care.updateFollowUp(accountId, masterKey, retorno, 'completed'); return 'concluido'
    }
    if (tipo === 'commission_task' && id) { await this.commissions.updateTaskStatus(accountId, masterKey, id, 'completed'); return 'concluido' }
    if (tipo === 'nomination_task' && id && subId) { await this.nominations.updateTask(accountId, masterKey, id, subId, 'completed'); return 'concluido' }
    return 'abrir'
  }

  // ------------------------------------------------------------------ Central

  /** Tudo o que a Central mostra, lido agora: manuais, tarefas das áreas e listas. */
  async carregar(accountId: string, masterKey: CryptoKey, agora = new Date(), fuso = fusoDoAparelho()): Promise<{ itens: ItemDaCentral[]; listas: ListaDeLembretesEntity[] }> {
    const [lembretes, listas, metadados, tarefas, acompanhamentos, pedidos, tarefasDeComissao, processos, campanhas, metas, eventos, contas, necessidades] = await Promise.all([
      this.lembretes(accountId, masterKey), this.listas(accountId, masterKey), this.metadados(accountId, masterKey),
      this.care.listTasks(accountId, masterKey), this.care.listFollowUps(accountId, masterKey), this.care.listPrayerRequests(accountId, masterKey),
      this.commissions.tasks(accountId, masterKey), this.nominations.list(accountId, masterKey),
      this.evangelism.listCampaigns(accountId, masterKey), this.evangelism.listGoals(accountId, masterKey), this.agenda.listEvents(accountId, masterKey),
      this.budget.bills(accountId, masterKey), this.materials.needs(accountId, masterKey),
    ])
    const itens = [
      ...itensDosLembretes(lembretes),
      ...itensDasAreas({ tarefas, acompanhamentos, pedidos, tarefasDeComissao, processos, campanhas, metas, eventos, contas, necessidades }, metadados, agora, fuso),
    ]
    return { itens, listas }
  }
}

export { ocorrenciaAberta }
