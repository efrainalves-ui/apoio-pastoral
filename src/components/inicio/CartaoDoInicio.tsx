import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * O cartão da tela inicial: um número e um caminho.
 *
 * O cartão inteiro é o link — o toque não precisa achar o ícone certo —, e o
 * que ele mostra cabe em uma olhada: título, número e, quando ajuda, uma linha
 * de detalhe. A lista inteira fica na página que o cartão abre.
 */
export function CartaoDoInicio({ to, Icone, titulo, tom = 'neutro', marca, rotulo, children }: {
  to: string
  Icone: LucideIcon
  titulo: string
  tom?: 'neutro' | 'atencao' | 'ok'
  /** Detalhe da área estratégica, quando o cartão pertence a uma. */
  marca?: ReactNode
  /** Nome acessível, quando o título não basta. */
  rotulo?: string
  children: ReactNode
}) {
  /*
    O nome do link é o título do cartão.

    Sem isto, quem navega por links ouve o cartão inteiro — título, números e
    rótulos — numa frase só, e a lista de links da tela fica ilegível. Os
    números continuam no conteúdo, lidos na leitura normal da página.
  */
  return (
    <Link className={`card cartao-inicio cartao-inicio--${tom}`} to={to} aria-label={rotulo ?? titulo}>
      <span className="cartao-inicio__topo">
        <span className="cartao-inicio__icone" aria-hidden="true"><Icone /></span>
        <h2 className="cartao-inicio__titulo">{titulo}</h2>
        {marca}
        <ChevronRight className="cartao-inicio__seta" aria-hidden="true" />
      </span>
      <span className="cartao-inicio__corpo">{children}</span>
    </Link>
  )
}

/** Um número do cartão, com o que ele conta embaixo. */
export function NumeroDoCartao({ valor, rotulo }: { valor: number; rotulo: string }) {
  return <span className="cartao-numero"><strong>{valor}</strong><small>{rotulo}</small></span>
}
