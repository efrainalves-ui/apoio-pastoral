import type { SimboloDoPlano } from '../../plano-estrategico/areas'

/**
 * O símbolo geométrico de cada área: círculo, triângulo, semicírculo e quadrado.
 *
 * Desenhado aqui porque nenhuma imagem oficial do Plano Estratégico está no
 * projeto nem veio com o Relatório Integrado. Quando a arte oficial chegar, é
 * só este componente que muda. É sempre decorativo: o nome da área vai escrito
 * ao lado, e a área nunca é reconhecida só pela forma ou pela cor.
 */
export function SimboloDaArea({ simbolo, className = '' }: { simbolo: SimboloDoPlano; className?: string }) {
  return (
    <svg className={`simbolo-area ${className}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {simbolo === 'circulo' && <circle cx="24" cy="24" r="20" />}
      {simbolo === 'triangulo' && <polygon points="24,5 44,42 4,42" />}
      {simbolo === 'semicirculo' && <path d="M4 36 A20 20 0 0 1 44 36 Z" />}
      {simbolo === 'quadrado' && <rect x="6" y="6" width="36" height="36" rx="3" />}
    </svg>
  )
}
