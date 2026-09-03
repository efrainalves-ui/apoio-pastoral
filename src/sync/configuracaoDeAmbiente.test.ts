import { describe, expect, it } from 'vitest'
import { environmentConfigurationProblem } from './config'

/**
 * A build precisa falhar fechado.
 *
 * O achado: uma build que declarava homologação e esquecia o endereço do
 * serviço não parava. `hasSupabaseConfiguration` virava falso, o transporte
 * local entrava no lugar e o aplicativo abria normalmente — o pastor
 * cadastraria o distrito inteiro achando que estava sincronizando, e
 * descobriria no dia em que trocasse de aparelho. Esquecer uma variável não
 * pode ser o mesmo que escolher trabalhar offline.
 */
// Referências curtas de propósito: a revisão de segurança do repositório
// reprova qualquer subdomínio Supabase com quinze caracteres ou mais, que é o
// formato de um projeto de verdade. Nenhum endereço real entra aqui.
const HOMOLOGACAO = {
  declared: 'homologacao',
  url: 'https://ficticio-a.supabase.co',
  anonKey: 'chave-ficticia-sem-formato-jwt',
  declaredRef: 'ficticio-a',
  disableSync: undefined,
}

describe('configuração de ambiente', () => {
  it('aceita homologação com endereço, chave e projeto coerentes', () => {
    expect(environmentConfigurationProblem(HOMOLOGACAO)).toBeNull()
  })

  it('aceita produção pelas mesmas regras', () => {
    expect(environmentConfigurationProblem({ ...HOMOLOGACAO, declared: 'producao' })).toBeNull()
  })

  it('recusa homologação sem o endereço do serviço', () => {
    expect(environmentConfigurationProblem({ ...HOMOLOGACAO, url: undefined })).toMatch(/VITE_SUPABASE_URL/u)
    expect(environmentConfigurationProblem({ ...HOMOLOGACAO, url: '   ' })).toMatch(/VITE_SUPABASE_URL/u)
  })

  it('recusa homologação sem a chave pública', () => {
    expect(environmentConfigurationProblem({ ...HOMOLOGACAO, anonKey: undefined })).toMatch(/VITE_SUPABASE_ANON_KEY/u)
  })

  it('recusa homologação sem o projeto declarado', () => {
    // Declarar o projeto é obrigatório: esquecer a variável não pode virar
    // permissão para falar com qualquer projeto.
    expect(environmentConfigurationProblem({ ...HOMOLOGACAO, declaredRef: undefined })).toMatch(/VITE_SUPABASE_PROJECT_REF/u)
  })

  it('recusa quando o projeto declarado e o endereço discordam', () => {
    expect(environmentConfigurationProblem({ ...HOMOLOGACAO, declaredRef: 'ficticio-b' })).toMatch(/serviço diferente do declarado/u)
  })

  it('recusa quando a chave pública veio de outro projeto', () => {
    // Chave JWT fictícia com `ref` de outro projeto, montada aqui: nenhuma
    // chave real entra em teste.
    const corpo = btoa(JSON.stringify({ ref: 'ficticio-c' })).replace(/=+$/u, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    expect(environmentConfigurationProblem({ ...HOMOLOGACAO, anonKey: `cabecalho.${corpo}.assinatura` }))
      .toMatch(/chave pública desta instalação pertence a outro serviço/u)
  })

  it('recusa homologação com a sincronização desligada', () => {
    // As duas declarações se contradizem, e a contradição silenciosa é a que
    // custa caro: tudo parece configurado e nada sai do aparelho.
    expect(environmentConfigurationProblem({ ...HOMOLOGACAO, disableSync: 'true' })).toMatch(/desliga a sincronização/u)
  })

  it('modo local só existe quando declarado como desenvolvimento', () => {
    expect(environmentConfigurationProblem({ declared: 'desenvolvimento', url: undefined, anonKey: undefined, declaredRef: undefined, disableSync: 'true' })).toBeNull()
  })

  it('recusa uma build que não declara ambiente nenhum', () => {
    for (const declarado of [undefined, '', '  ', 'local', 'staging', 'produção']) {
      expect(environmentConfigurationProblem({ declared: declarado, url: undefined, anonKey: undefined, declaredRef: undefined, disableSync: undefined }))
        .toMatch(/não declara em que ambiente ela roda/u)
    }
  })
})
