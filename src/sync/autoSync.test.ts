import { describe, expect, it } from 'vitest'
import { deveSincronizarAgora, ESPERA_APOS_ALTERACAO_MS, GUARDA_NO_RETORNO_MS, INTERVALO_OCIOSO_MS } from './autoSync'

const base = { online: true, emCurso: false, pendentes: 0, ultimaRodada: 0, agora: 0, motivo: 'tick' as const }

describe('quando sincronizar sozinho', () => {
  it('sincroniza na primeira oportunidade', () => {
    expect(deveSincronizarAgora({ ...base, ultimaRodada: null })).toBe(true)
  })

  it('não tenta sem rede', () => {
    // A fila fica guardada e sobe depois. Tentar sem rede só produziria um
    // aviso de erro que não ajuda ninguém.
    expect(deveSincronizarAgora({ ...base, online: false, ultimaRodada: null })).toBe(false)
  })

  it('não começa uma rodada por cima de outra', () => {
    // Duas ao mesmo tempo disputariam o mesmo cursor de recebimento.
    expect(deveSincronizarAgora({ ...base, emCurso: true, ultimaRodada: null })).toBe(false)
  })

  it('espera as alterações pararem de chegar antes de enviar', () => {
    // Quem está digitando uma visita gera várias alterações seguidas.
    expect(deveSincronizarAgora({ ...base, pendentes: 3, agora: ESPERA_APOS_ALTERACAO_MS - 1 })).toBe(false)
    expect(deveSincronizarAgora({ ...base, pendentes: 3, agora: ESPERA_APOS_ALTERACAO_MS })).toBe(true)
  })

  it('sem nada pendente, ainda confere de tempos em tempos', () => {
    // Receber o que veio de outro aparelho é metade do serviço: sem isto, um
    // aparelho que só lê nunca descobriria o que o outro escreveu.
    expect(deveSincronizarAgora({ ...base, agora: INTERVALO_OCIOSO_MS - 1 })).toBe(false)
    expect(deveSincronizarAgora({ ...base, agora: INTERVALO_OCIOSO_MS })).toBe(true)
  })

  it('ao voltar para o aplicativo, confere na hora, sem esperar o relógio', () => {
    // Era o que sobrava do problema antigo: o compromisso criado no computador
    // só aparecia no celular depois de apertar o botão, mesmo com a
    // sincronização já automática — porque voltar para a tela não furava a
    // espera de fundo. É justamente o instante em que há alguém olhando.
    const aindaCedo = { ...base, agora: INTERVALO_OCIOSO_MS - 1 }

    expect(deveSincronizarAgora(aindaCedo)).toBe(false)
    expect(deveSincronizarAgora({ ...aindaCedo, motivo: 'retorno' })).toBe(true)
  })

  it('no retorno, ainda evita três rodadas coladas', () => {
    // Foco, visibilidade e volta da rede chegam quase juntos; sem uma guarda
    // curta, os três disparariam rodadas em cima da mesma.
    expect(deveSincronizarAgora({ ...base, motivo: 'retorno', agora: GUARDA_NO_RETORNO_MS - 1 })).toBe(false)
    expect(deveSincronizarAgora({ ...base, motivo: 'retorno', agora: GUARDA_NO_RETORNO_MS })).toBe(true)
  })

  it('sem rede, voltar para o aplicativo não muda nada', () => {
    expect(deveSincronizarAgora({ ...base, motivo: 'retorno', online: false, ultimaRodada: null })).toBe(false)
  })
})
