import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/0001_marco_zero_up.sql?raw'

const migrations = import.meta.glob('../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function nomeDoArquivo(caminho: string): string {
  return caminho.slice(caminho.lastIndexOf('/') + 1)
}

function tabelasCriadas(sql: string): string[] {
  return [...sql.matchAll(/create table public\.(\w+)/gu)].map((ocorrencia) => ocorrencia[1] ?? '')
}

/** Funções novas de uma migration. `create or replace` reescreve outra já existente. */
function funcoesCriadas(sql: string): string[] {
  return [...sql.matchAll(/create function public\.(\w+)/gu)].map((ocorrencia) => ocorrencia[1] ?? '')
}

/** Cada migration de subida com o conteúdo da reversão correspondente. */
function paresDeMigration(): Array<{ nome: string; subida: string; reversao: string }> {
  return Object.entries(migrations)
    .filter(([caminho]) => caminho.endsWith('_up.sql'))
    .map(([caminho, conteudo]) => ({
      nome: nomeDoArquivo(caminho),
      subida: conteudo,
      reversao: migrations[caminho.replace(/_up\.sql$/u, '_down.sql')] ?? '',
    }))
}

describe('migration de homologação', () => {
  it('isola envelopes por proprietário e dispositivo ativo', () => {
    expect(migrationSql).toContain('d.owner_id = auth.uid()')
    expect(migrationSql).toContain("d.status = 'active'")
    expect(migrationSql).not.toMatch(/grant delete on public\.devices/iu)
    expect(migrationSql).toContain('encrypted_operations_active_device_insert')
  })

  it('mantém cada versão reversível com um par up e down', () => {
    const arquivos = Object.keys(migrations).map(nomeDoArquivo)
    const subidas = arquivos.filter((nome) => nome.endsWith('_up.sql'))

    expect(subidas.length).toBeGreaterThan(0)
    for (const subida of subidas) {
      expect(arquivos).toContain(subida.replace(/_up\.sql$/u, '_down.sql'))
    }
  })

  it('habilita RLS e cria política para toda tabela que expõe', () => {
    const tabelas = tabelasCriadas(migrationSql)
    expect(tabelas).toEqual(['devices', 'device_key_envelopes', 'recovery_key_envelopes', 'encrypted_operations'])

    for (const tabela of tabelas) {
      expect(migrationSql).toContain(`alter table public.${tabela} enable row level security`)
      expect(migrationSql).toMatch(new RegExp(`create policy \\w+ on public\\.${tabela}`, 'u'))
    }
  })

  it('zera os privilégios padrão antes de conceder o mínimo a cada tabela', () => {
    expect(migrationSql).not.toMatch(/grant[^;]*\bto\b[^;]*\banon\b/isu)

    // O Supabase concede TRUNCATE, REFERENCES e TRIGGER a anon e a authenticated
    // em toda tabela nova de public. TRUNCATE não passa pela RLS, então revogar
    // só de anon deixaria qualquer conta autenticada apagar as linhas de todas
    // as outras. Cada tabela precisa zerar os dois papéis antes dos grants.
    for (const tabela of tabelasCriadas(migrationSql)) {
      for (const papel of ['anon', 'authenticated']) {
        expect(migrationSql).toMatch(
          new RegExp(`revoke all on[^;]*public\\.${tabela}[^;]*from[^;]*\\b${papel}\\b`, 'isu'),
        )
      }
    }
  })

  it('desfaz na reversão tudo o que a subida cria', () => {
    const reversao = migrations['../../supabase/migrations/0001_marco_zero_down.sql']
    expect(reversao).toBeTypeOf('string')

    for (const tabela of tabelasCriadas(migrationSql)) {
      expect(reversao).toContain(`drop table if exists public.${tabela}`)
    }
    for (const ocorrencia of migrationSql.matchAll(/create function public\.(\w+)/gu)) {
      expect(reversao).toContain(`drop function if exists public.${ocorrencia[1] ?? ''}`)
    }
  })

  it('só guarda conteúdo cifrado e metadados técnicos', () => {
    const colunasPastorais = /\b(nome|name|email|telefone|phone|endereco|address|observacao|notes|conteudo|content)\b\s+(text|varchar|jsonb)/iu
    const corpoDasTabelas = migrationSql
      .split(/create table public\.\w+ \(/u)
      .slice(1)
      .map((trecho) => trecho.split(');')[0] ?? '')
      .join('\n')
      .replace(/label text/gu, '')

    expect(corpoDasTabelas).not.toMatch(colunasPastorais)
    expect(migrationSql).toContain('ciphertext text not null')
  })

  // As provas acima olham a primeira migration. Estas valem para todas, hoje e
  // para a próxima: um objeto novo entrar sem barreira é justamente o tipo de
  // regressão que ninguém percebe até haver dado real do outro lado.
  it('toda tabela criada por qualquer migration nasce com RLS ligada e privilégios zerados', () => {
    for (const { nome, subida } of paresDeMigration()) {
      for (const tabela of tabelasCriadas(subida)) {
        expect(subida, `${nome}: ${tabela} sem RLS`).toContain(`alter table public.${tabela} enable row level security`)
        for (const papel of ['anon', 'authenticated']) {
          expect(subida, `${nome}: ${tabela} sem revoke de ${papel}`).toMatch(
            new RegExp(`revoke all on[^;]*public\\.${tabela}[^;]*from[^;]*\\b${papel}\\b`, 'isu'),
          )
        }
      }
    }
  })

  it('toda função security definer fixa o search_path', () => {
    for (const { nome, subida } of paresDeMigration()) {
      const definidoras = subida.split(/create (?:or replace )?function public\./u).slice(1)
        .filter((corpo) => /security definer/u.test(corpo.split('$$')[0] ?? ''))
      for (const corpo of definidoras) {
        expect(corpo.split('$$')[0], `${nome}: função security definer sem search_path fixo`).toMatch(/set search_path = ''/u)
      }
    }
  })

  it('toda reversão desfaz as tabelas e funções que a subida criou', () => {
    for (const { nome, subida, reversao } of paresDeMigration()) {
      for (const tabela of tabelasCriadas(subida)) {
        expect(reversao, `${nome}: reversão não apaga ${tabela}`).toContain(`drop table if exists public.${tabela}`)
      }
      for (const funcao of funcoesCriadas(subida)) {
        expect(reversao, `${nome}: reversão não apaga ${funcao}`).toContain(`drop function if exists public.${funcao}`)
      }
    }
  })

  it('o padrão de public é nada, para a tabela e a função que ainda não existem', () => {
    // O Supabase concede privilégios padrão a anon e authenticated em toda
    // tabela nova de public. Zerar só TRUNCATE, REFERENCES e TRIGGER deixava
    // uma tabela futura nascer legível e gravável pelo navegador — e, sem RLS
    // ligada, sem barreira nenhuma.
    const tudo = paresDeMigration().map(({ subida }) => subida).join('\n')
    expect(tudo).toMatch(/alter default privileges in schema public\s+revoke all on tables from anon, authenticated/u)
    expect(tudo).toMatch(/alter default privileges in schema public\s+revoke execute on functions from public, anon, authenticated/u)
  })
})
