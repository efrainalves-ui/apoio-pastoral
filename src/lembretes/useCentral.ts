import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { DistrictService } from '../district/service'
import { useReloadOnSync } from '../sync/useReloadOnSync'
import { contadorDoMenu, type ItemDaCentral } from './central'
import { sincronizarAgendamentos } from './push'
import { LembreteService } from './service'
import { fusoDoAparelho } from './tempo'
import type { ListaDeLembretesEntity } from './types'

export const servicoDeLembretes = new LembreteService()
const distrito = new DistrictService()

export const EVENTO_LEMBRETES_ALTERADOS = 'apoio-pastoral:lembretes-alterados'
export function avisarAlteracaoDeLembretes(): void { window.dispatchEvent(new Event(EVENTO_LEMBRETES_ALTERADOS)) }

export interface DadosDaCentral { itens: ItemDaCentral[]; listas: ListaDeLembretesEntity[]; igrejas: Map<string, string> }

/** "Agora", renovado a cada minuto: o que era de hoje passa a atrasado sem recarregar a tela. */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const relogio = window.setInterval(() => setAgora(new Date()), 60_000)
    return () => window.clearInterval(relogio)
  }, [])
  return agora
}

/** Tudo o que a Central mostra, recarregado quando algo muda aqui ou chega pela sincronização. */
export function useCentral() {
  const { account, masterKey } = useAuthVault()
  const [dados, setDados] = useState<DadosDaCentral | null>(null)
  const [erro, setErro] = useState('')
  const agora = useAgora()

  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      await servicoDeLembretes.prepararListasIniciais(account.id, masterKey)
      const [{ itens, listas }, district] = await Promise.all([
        servicoDeLembretes.carregar(account.id, masterKey, new Date(), fusoDoAparelho()),
        distrito.getDistrict(account.id, masterKey),
      ])
      const igrejas = district ? await distrito.listChurches(account.id, masterKey, district.id) : []
      setDados({ itens, listas, igrejas: new Map(igrejas.map((igreja) => [igreja.id, igreja.name])) })
      setErro('')
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar os lembretes.')
    }
  }, [account, masterKey])

  useReloadOnSync(carregar)
  useEffect(() => {
    const recarregar = () => { void carregar() }
    window.addEventListener(EVENTO_LEMBRETES_ALTERADOS, recarregar)
    return () => window.removeEventListener(EVENTO_LEMBRETES_ALTERADOS, recarregar)
  }, [carregar])

  return { dados, erro, carregar, agora, fuso: fusoDoAparelho() }
}

/** O número ao lado de "Lembretes" no menu: atrasados e de hoje, cada um uma vez. */
export function useContadorDeLembretes(): number {
  const { account, masterKey } = useAuthVault()
  const [itens, setItens] = useState<ItemDaCentral[]>([])
  const agora = useAgora()

  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    try { setItens((await servicoDeLembretes.carregar(account.id, masterKey)).itens) } catch { /* sem número é melhor que número errado */ }
    // Os horários de aviso seguem o cofre; sem internet ou sem notificações ativas, não faz nada.
    try { await sincronizarAgendamentos(account.id, masterKey, await servicoDeLembretes.lembretes(account.id, masterKey)) } catch { /* tenta de novo na próxima carga */ }
  }, [account, masterKey])

  useReloadOnSync(carregar)
  useEffect(() => {
    const recarregar = () => { void carregar() }
    window.addEventListener(EVENTO_LEMBRETES_ALTERADOS, recarregar)
    const periodico = window.setInterval(recarregar, 5 * 60_000)
    return () => { window.removeEventListener(EVENTO_LEMBRETES_ALTERADOS, recarregar); window.clearInterval(periodico) }
  }, [carregar])

  return account && masterKey ? contadorDoMenu(itens, agora, fusoDoAparelho()) : 0
}

export interface AcoesDaCentral {
  aviso: string
  limparAviso: () => void
  concluir: (item: ItemDaCentral) => Promise<void>
  sinalizar: (item: ItemDaCentral) => Promise<void>
  adiar: (item: ItemDaCentral, para: { data: string; hora: string }) => Promise<void>
  mudarDeLista: (item: ItemDaCentral, listaId: string | null) => Promise<void>
  excluir: (item: ItemDaCentral) => Promise<void>
  abrirOrigem: (item: ItemDaCentral) => void
}

/**
 * O que se faz com um item.
 *
 * Lembrete manual muda no cofre. Tarefa de outra área: concluir vai para a
 * origem quando ela tem essa ação, senão abre a tela da origem; bandeira,
 * adiamento e lista ficam na marcação da Central, nunca numa cópia da tarefa.
 */
export function useAcoesDaCentral(): AcoesDaCentral {
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()
  const [aviso, setAviso] = useState('')

  const executar = useCallback(async (acao: (accountId: string, chave: CryptoKey) => Promise<unknown>, mensagem: string) => {
    if (!account || !masterKey) return
    try {
      await acao(account.id, masterKey)
      setAviso(mensagem)
      avisarAlteracaoDeLembretes()
    } catch (falha) {
      setAviso(falha instanceof Error ? falha.message : 'Não foi possível salvar.')
    }
  }, [account, masterKey])

  const abrirOrigem = useCallback((item: ItemDaCentral) => { if (item.link) void navigate(item.link) }, [navigate])

  return {
    aviso,
    limparAviso: () => setAviso(''),
    abrirOrigem,
    concluir: async (item) => {
      if (item.tipo === 'manual' && item.lembreteId) {
        await executar((conta, chave) => servicoDeLembretes.concluir(conta, chave, item.lembreteId!, item.ocorrencia, !item.concluido), item.concluido ? 'Reaberto' : 'Concluído')
        return
      }
      if (!account || !masterKey || item.concluido) { abrirOrigem(item); return }
      try {
        const resultado = await servicoDeLembretes.concluirNaOrigem(account.id, masterKey, item)
        if (resultado === 'abrir') { abrirOrigem(item); return }
        setAviso('Concluído')
        avisarAlteracaoDeLembretes()
      } catch (falha) {
        setAviso(falha instanceof Error ? falha.message : 'Não foi possível concluir.')
      }
    },
    sinalizar: (item) => item.tipo === 'manual' && item.lembreteId
      ? executar((conta, chave) => servicoDeLembretes.sinalizar(conta, chave, item.lembreteId!, !item.sinalizado), item.sinalizado ? 'Sinal retirado' : 'Sinalizado')
      : executar((conta, chave) => servicoDeLembretes.marcarTarefa(conta, chave, item.origem!, { sinalizado: !item.sinalizado }), item.sinalizado ? 'Sinal retirado' : 'Sinalizado'),
    adiar: (item, para) => item.tipo === 'manual' && item.lembreteId
      ? executar((conta, chave) => servicoDeLembretes.adiar(conta, chave, item.lembreteId!, item.ocorrencia, para), 'Adiado')
      : executar((conta, chave) => servicoDeLembretes.marcarTarefa(conta, chave, item.origem!, { adiadaPara: para }), 'Adiado'),
    mudarDeLista: (item, listaId) => item.tipo === 'manual' && item.lembreteId
      ? executar((conta, chave) => servicoDeLembretes.mudarDeLista(conta, chave, item.lembreteId!, listaId), 'Lista alterada')
      : executar((conta, chave) => servicoDeLembretes.marcarTarefa(conta, chave, item.origem!, { listaId }), 'Lista alterada'),
    excluir: async (item) => {
      if (item.tipo !== 'manual' || !item.lembreteId) return
      await executar((conta, chave) => servicoDeLembretes.excluirLembrete(conta, chave, item.lembreteId!), 'Excluído')
    },
  }
}
