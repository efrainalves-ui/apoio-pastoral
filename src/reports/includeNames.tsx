/**
 * A confirmação única para incluir nomes em qualquer documento que saia daqui.
 *
 * Antes cada tela resolvia isso do seu jeito: o itinerário tinha uma caixa, o
 * histórico de pregações não tinha nenhuma, a pauta e a ata saíam sempre com
 * todo mundo nomeado, e o relatório da campanha tinha um parâmetro que a tela
 * nunca oferecia. O pastor não tinha como saber, ao gerar um documento, se
 * aquele traria nomes ou não.
 *
 * Agora é a mesma caixa, com o mesmo texto, em todo lugar: sem marcar, sai o
 * que o documento é — datas, igrejas, assuntos, decisões e totais. Com nomes,
 * o arquivo passa a conter dados pessoais e o aviso diz isso.
 */

/** Como uma pessoa aparece quando o documento sai sem nomes. */
export const NOME_OMITIDO = 'nome não incluído'

/**
 * Resolve o nome de uma pessoa respeitando a escolha do pastor. Passar isto
 * aos geradores de documento é o que mantém a regra em um lugar só, em vez de
 * cada tela lembrar (ou esquecer) de esconder o nome.
 */
export function personNameResolver(includeNames: boolean, nome: (id: string) => string): (id: string) => string {
  return (id: string) => (includeNames ? nome(id) : id ? NOME_OMITIDO : 'a confirmar')
}

export interface IncludeNamesProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** O que este documento passa a mostrar quando os nomes entram. */
  detalhe?: string
}

export function IncludeNames({ checked, onChange, detalhe }: IncludeNamesProps) {
  return (
    <label className="confirmation-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <strong>Incluir nomes</strong>
        <small>
          Sem marcar, o documento sai sem identificar pessoas.
          {detalhe ? ` ${detalhe}` : ''} Com nomes, o arquivo passa a conter dados pessoais: compartilhe com cuidado.
        </small>
      </span>
    </label>
  )
}
