import { describe, expect, it } from 'vitest'
import funcao from '../../supabase/functions/lembretes-push/index.ts?raw'
import migracao from '../../supabase/migrations/0010_lembretes_push_up.sql?raw'
import trabalhador from '../../public/push-sw.js?raw'

/*
  O que sai para o serviço de push e o que o servidor guarda.

  A função e o service worker não rodam nos testes do navegador; o que se
  confere aqui é o texto deles: o envio só leva a chave opaca, a etiqueta e o
  caminho, e as tabelas não têm onde guardar título, pessoa ou observação.
*/

describe('privacidade das notificações', () => {
  it('a função envia só etiqueta, chave opaca e caminho — nunca título ou conteúdo do cofre', () => {
    const envios = [...funcao.matchAll(/enviar\(admin, [^,]+, \{(.*)\}\)\s*$/gmu)].map(([, corpo]) => corpo!)
    expect(envios.length).toBeGreaterThanOrEqual(2)
    for (const corpo of envios) {
      const chaves = [...corpo.matchAll(/(\w+):/gu)].map(([, chave]) => chave)
      expect(chaves.every((chave) => ['tag', 'chave', 'url'].includes(chave!))).toBe(true)
    }
    expect(funcao).toContain("'Apoio Pastoral'")
    expect(funcao).toContain("'Você tem um lembrete'")
    expect(funcao).not.toMatch(/vault_records|titulo|observa|pessoa/iu)
  })

  it('as tabelas do servidor não têm coluna para título, texto, pessoa ou observação', () => {
    const tabelas = [...migracao.matchAll(/create table[^(]+\(([\s\S]*?)\n\);/giu)].map(([, corpo]) => corpo!)
    expect(tabelas).toHaveLength(2)
    const colunas = tabelas.flatMap((corpo) => [...corpo.matchAll(/^\s+([a-z_0-9]+)\s+(?:uuid|text|timestamptz|smallint)\b/gmu)].map(([, nome]) => nome!))
    expect(colunas.sort()).toEqual(['attempts', 'auth_secret', 'created_at', 'created_at', 'device_id', 'endpoint', 'fire_at', 'id', 'id', 'occurrence_key', 'owner_id', 'owner_id', 'p256dh', 'sent_at', 'state', 'updated_at', 'updated_at'])
  })

  it('o aparelho mostra o aviso genérico e só abre caminhos do próprio aplicativo', () => {
    expect(trabalhador).toContain("const AVISO_GENERICO = 'Você tem um lembrete'")
    expect(trabalhador).toContain("showNotification('Apoio Pastoral'")
    expect(trabalhador).toContain("dados.url.startsWith('/app/')")
  })
})
