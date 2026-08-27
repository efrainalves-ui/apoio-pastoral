import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  icon?: ReactNode
  full?: boolean
}

export function Button({ variant = 'primary', icon, full = false, className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`button button--${variant} ${full ? 'button--full' : ''} ${className}`} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  )
}
