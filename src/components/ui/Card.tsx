import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string
  title?: string
  action?: ReactNode
}

export function Card({ eyebrow, title, action, className = '', children, ...props }: CardProps) {
  return (
    <section className={`card ${className}`} {...props}>
      {(eyebrow || title || action) && (
        <header className="card__header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h2 className="card__title">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
