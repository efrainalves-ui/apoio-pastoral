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
})
