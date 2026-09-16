import { CheckCircle2, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ChurchEntity } from '../../district/types'
import { calculateAge } from '../../people/dates'
import { rotuloDaFidelidade } from '../../people/rendaPorIdade'
import type { PersonEntity } from '../../people/types'
import { Button } from '../ui/Button'

const POR_PAGINA = 25
const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('pt-BR')
const contar = (quantidade: number) => `${quantidade} ${quantidade === 1 ? 'pessoa' : 'pessoas'}`

/**
 * As pessoas que ainda precisam de avaliação.
 *
 * São centenas de nomes: a lista inteira em fila não se lê, então aqui ela vem
 * por igreja, por busca de nome e de vinte e cinco em vinte e cinco. Trocar de
 * página não desfaz o filtro, e mexer no filtro volta para a primeira página —
 * ficar na página sete de uma busca que agora tem duas seria uma lista vazia sem
 * explicação.
 */
export function PessoasParaAvaliar({ pessoas, igrejas, igrejaSelecionada, onEscolherIgreja, onAvaliar, porPagina = POR_PAGINA }: {
  pessoas: readonly PersonEntity[]
  igrejas: readonly ChurchEntity[]
  igrejaSelecionada: string
  onEscolherIgreja: (igrejaId: string) => void
  onAvaliar: (pessoa: PersonEntity) => void
  porPagina?: number
}) {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  useEffect(() => { setPagina(1) }, [busca, igrejaSelecionada])

  const nomeDaIgreja = (id: string) => igrejas.find((igreja) => igreja.id === id)?.name ?? 'Sem igreja'
  const encontradas = useMemo(() => {
    const procurado = semAcento(busca.trim())
    return pessoas.filter((pessoa) => (!igrejaSelecionada || pessoa.currentChurchId === igrejaSelecionada)
      && (!procurado || semAcento(pessoa.name).includes(procurado)))
  }, [busca, igrejaSelecionada, pessoas])

  const totalDePaginas = Math.max(1, Math.ceil(encontradas.length / porPagina))
  const atual = Math.min(pagina, totalDePaginas)
  const visiveis = encontradas.slice((atual - 1) * porPagina, atual * porPagina)

  return <div className="avaliar">
    <div className="avaliar__filtros">
      <label className="field avaliar__busca">
        <span className="field__label">Buscar pessoa</span>
        <span className="avaliar__campo">
          <Search aria-hidden="true" />
          <input type="search" className="field__input" value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Parte do nome" />
        </span>
      </label>
      <label className="field avaliar__igreja">
        <span className="field__label">Igreja</span>
        <select className="field__input" value={igrejaSelecionada} onChange={(evento) => onEscolherIgreja(evento.target.value)}>
          <option value="">Todas as igrejas</option>
          {igrejas.map((igreja) => <option key={igreja.id} value={igreja.id}>{igreja.name}</option>)}
        </select>
      </label>
    </div>

    <p className="avaliar__contagem" aria-live="polite">
      <strong>{contar(encontradas.length)}</strong>
      {totalDePaginas > 1 && <span>Página {atual} de {totalDePaginas}</span>}
    </p>

    {!encontradas.length
      ? <div className="empty-state compact-empty"><CheckCircle2 /><strong>{busca.trim() ? 'Nenhuma pessoa com esse nome' : 'Nenhuma pessoa pendente de avaliação'}</strong></div>
      : <>
        <ul className="avaliar__lista">{visiveis.map((pessoa) => {
          const idade = calculateAge(pessoa.birthDate)
          return <li key={pessoa.id} className="avaliar-pessoa">
            <span className="avaliar-pessoa__nome">{pessoa.name}</span>
            <span className="avaliar-pessoa__dados">
              <span className="avaliar-pessoa__igreja">{nomeDaIgreja(pessoa.currentChurchId)}</span>
              <span>{idade === null ? 'Idade não informada' : `${idade} anos`}</span>
              <span className="avaliar-pessoa__etiqueta">{rotuloDaFidelidade(pessoa)}</span>
            </span>
            <Button variant="secondary" aria-label={`Avaliar ${pessoa.name}`} onClick={() => onAvaliar(pessoa)}>Avaliar</Button>
          </li>
        })}</ul>

        {totalDePaginas > 1 && <nav className="avaliar__paginas" aria-label="Páginas da lista">
          <Button variant="secondary" disabled={atual === 1} onClick={() => setPagina(atual - 1)}>Anterior</Button>
          <span>{atual} de {totalDePaginas}</span>
          <Button variant="secondary" disabled={atual === totalDePaginas} onClick={() => setPagina(atual + 1)}>Próxima</Button>
        </nav>}
      </>}
  </div>
}
