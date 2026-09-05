import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateVaultKeys } from '../crypto/vault'
import { esquecerSessaoAberta, manterSessaoAberta, retomarSessaoAberta } from './sessaoAberta'

const CONTA = 'conta-ficticia-sessao'

afterEach(async () => { await esquecerSessaoAberta(); sessionStorage.clear() })

describe('manter o cofre aberto entre recarregamentos', () => {
  it('devolve chaves que abrem o que as originais fecharam', async () => {
    // Recarregar é acidente comum, e pedir a senha por causa dele ensina a
    // escolher senha curta. O que importa não é ser o mesmo objeto — guardar
    // uma chave produz uma cópia dela —, e sim abrir o mesmo cofre.
    const chaves = await generateVaultKeys()
    await manterSessaoAberta(CONTA, chaves)

    const retomadas = await retomarSessaoAberta(CONTA)
    expect(retomadas).not.toBeNull()

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const segredo = new TextEncoder().encode('conteúdo fictício do cofre')
    const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chaves.master, segredo)
    const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, retomadas!.master, cifrado)

    expect(new TextDecoder().decode(aberto)).toBe('conteúdo fictício do cofre')

    // A chave de assinatura também precisa continuar valendo, senão a
    // sincronização passaria a recusar as próprias operações.
    const dados = new TextEncoder().encode('metadado fictício')
    const assinatura = await crypto.subtle.sign('HMAC', chaves.sync, dados)
    expect(await crypto.subtle.verify('HMAC', retomadas!.sync, assinatura, dados)).toBe(true)
  })

  it('não devolve nada depois que a aba fechou', async () => {
    // A marca vive em `sessionStorage`, que morre com a aba. Sem ela, o que
    // está guardado é resto de uma sessão anterior.
    const chaves = await generateVaultKeys()
    await manterSessaoAberta(CONTA, chaves)
    sessionStorage.clear()

    expect(await retomarSessaoAberta(CONTA)).toBeNull()
  })

  it('apaga o resto ao descobrir que a aba é outra', async () => {
    // Não basta recusar: o guardado precisa sair do aparelho, senão ficaria
    // esperando alguém reabrir uma aba para valer de novo.
    const chaves = await generateVaultKeys()
    await manterSessaoAberta(CONTA, chaves)
    sessionStorage.clear()
    await retomarSessaoAberta(CONTA)

    sessionStorage.setItem('apoio-pastoral:sessao-aberta', '1')
    expect(await retomarSessaoAberta(CONTA)).toBeNull()
  })

  it('não devolve as chaves de outra conta', async () => {
    const chaves = await generateVaultKeys()
    await manterSessaoAberta(CONTA, chaves)

    expect(await retomarSessaoAberta('outra-conta-ficticia')).toBeNull()
  })

  it('esquecer bloqueia de verdade', async () => {
    // Bloquear precisa bloquear: deixar a chave guardada faria o próximo
    // recarregamento reabrir o cofre que alguém acabou de fechar.
    const chaves = await generateVaultKeys()
    await manterSessaoAberta(CONTA, chaves)
    await esquecerSessaoAberta()

    expect(await retomarSessaoAberta(CONTA)).toBeNull()
  })

  it('guarda o objeto da chave, e não o segredo dela', async () => {
    // É o ponto de segurança inteiro: a chave é criada como não exportável, e
    // guardar o segredo em texto seria bem pior do que guardar a chave.
    const chaves = await generateVaultKeys()
    await manterSessaoAberta(CONTA, chaves)
    const retomadas = await retomarSessaoAberta(CONTA)

    expect(retomadas?.master.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', retomadas!.master)).rejects.toThrow()
    expect(JSON.stringify(sessionStorage)).not.toContain('key')
  })
})
