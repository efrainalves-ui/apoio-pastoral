import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { calculateAge } from '../../people/dates'
import type { CadastroParecido } from '../../people/duplicados'
import { rotuloDaFidelidade, situacaoDeRenda } from '../../people/rendaPorIdade'
import type { PersonEntity } from '../../people/types'
import { Button } from '../ui/Button'

export type SituacaoEscolhida = 'dizimista' | 'com_renda' | 'sem_renda' | 'depois'

const OPCOES: ReadonlyArray<{ escolha: SituacaoEscolhida; rotulo: string }> = [
  { escolha: 'dizimista', rotulo: 'É dizimista' },
  { escolha: 'com_renda', rotulo: 'Não dizimista com renda' },
  { escolha: 'sem_renda', rotulo: 'Não dizimista sem renda' },
  { escolha: 'depois', rotulo: 'Avaliar depois' },
]

/**
 * A pergunta que o pastor responde sobre cada pessoa.
 *
 * Faltava a resposta mais comum: o relatório erra, ele sabe que a pessoa é
 * dizimista, e a tela só oferecia "tem renda" e "não tem renda" — duas
 * respostas que não diziam o que ele queria dizer, e a pessoa voltava para a
 * fila na semana seguinte.
 *
 * O aviso de cadastro repetido vem antes das opções, porque muda quem é a
 * pessoa: responder sobre um registro enquanto o dízimo caiu no outro deixa os
 * dois errados. Vincular é decisão dele — nada aqui une nada sozinho.
 */
export function AvaliacaoDaPessoa({ pessoa, parecidos, ocupado, onEscolher, onVincular, onPessoasDiferentes }: {
  pessoa: PersonEntity
  parecidos: readonly CadastroParecido[]
  ocupado: boolean
  onEscolher: (escolha: SituacaoEscolhida) => void
  onVincular: (ids: readonly string[]) => void
  onPessoasDiferentes: (ids: readonly string[]) => void
}) {
  const [avisoAberto, setAvisoAberto] = useState(true)
  const idade = calculateAge(pessoa.birthDate)
  const renda = situacaoDeRenda(pessoa)
  const mostrarAviso = avisoAberto && parecidos.length > 0

  return <div className="avaliacao">
    <div className="avaliacao__pessoa">
      <strong>{pessoa.name}</strong>
      <span className="avaliacao__dados">
        <span>{idade === null ? 'Idade não informada' : `${idade} anos`}</span>
        <span className="avaliar-pessoa__etiqueta">{rotuloDaFidelidade(pessoa)}</span>
        {renda.origem === 'idade' && <span className="renda-padrao">Padrão pela idade · {renda.idade} anos</span>}
      </span>
    </div>

    {mostrarAviso && <div className="avaliacao__aviso" role="group" aria-label="Possíveis cadastros da mesma pessoa">
      <p className="avaliacao__aviso-titulo"><TriangleAlert aria-hidden="true" />Encontramos possíveis cadastros da mesma pessoa</p>
      <ul className="avaliacao__parecidos">{parecidos.map(({ pessoa: parecida }) => <li key={parecida.id}>
        <strong>{parecida.name}</strong>
        <span>{calculateAge(parecida.birthDate) === null ? 'Idade não informada' : `${calculateAge(parecida.birthDate)} anos`}</span>
        <span className="avaliar-pessoa__etiqueta">{rotuloDaFidelidade(parecida)}</span>
      </li>)}</ul>
      <div className="form-actions">
        <Button disabled={ocupado} onClick={() => onVincular(parecidos.map(({ pessoa: parecida }) => parecida.id))}>É a mesma pessoa — vincular cadastros</Button>
        <Button variant="secondary" disabled={ocupado} onClick={() => { onPessoasDiferentes(parecidos.map(({ pessoa: parecida }) => parecida.id)); setAvisoAberto(false) }}>São pessoas diferentes</Button>
        <Button variant="quiet" disabled={ocupado} onClick={() => setAvisoAberto(false)}>Cancelar</Button>
      </div>
    </div>}

    <fieldset className="avaliacao__opcoes">
      <legend>Qual é a situação desta pessoa?</legend>
      {OPCOES.map(({ escolha, rotulo }) => <Button
        key={escolha}
        variant={escolha === 'depois' ? 'quiet' : 'secondary'}
        disabled={ocupado}
        aria-label={`${rotulo}: ${pessoa.name}`}
        onClick={() => onEscolher(escolha)}
      >{rotulo}</Button>)}
    </fieldset>
  </div>
}
