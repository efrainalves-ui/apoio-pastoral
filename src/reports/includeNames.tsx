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

export { NOME_OMITIDO, TEXTO_OMITIDO, personNameResolver, freeText, freeList, personLabel } from './redaction'

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

