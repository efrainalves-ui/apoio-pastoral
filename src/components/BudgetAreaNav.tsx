import { Link } from 'react-router-dom'

/**
 * As duas áreas do Orçamento, sempre visíveis.
 *
 * Pessoal é o dinheiro da família; Trabalho é o do ministério. A separação é o
 * ponto do módulo, então ela precisa estar na tela o tempo todo — e não
 * escondida em um menu que o pastor abre quando lembra.
 */
export function BudgetAreaNav({ area, month }: { area: 'pessoal' | 'trabalho'; month: string }) {
  return <nav className="segmented" aria-label="Áreas do Orçamento">
    <Link className={area === 'pessoal' ? 'active' : ''} to={`/app/orcamento/resumo?mes=${month}`}>Pessoal</Link>
    <Link className={area === 'trabalho' ? 'active' : ''} to={`/app/orcamento/trabalho/resumo?mes=${month}`}>Trabalho</Link>
  </nav>
}
