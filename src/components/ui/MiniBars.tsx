interface MiniBarsProps {
  valores: readonly number[]
  rotulos: readonly string[]
  label: string
  /** Série de comparação, desenhada atrás em tom mais claro. */
  base?: readonly number[]
}

/**
 * Barras curtas para comparar meses ou anos.
 *
 * Duas séries entram sobrepostas, e não lado a lado: no celular, doze pares de
 * barras deixam cada uma com dois pixels. Sobrepostas, a diferença continua
 * visível e o mês continua legível.
 */
export function MiniBars({ valores, rotulos, label, base }: MiniBarsProps) {
  const teto = Math.max(1, ...valores, ...(base ?? []))

  return (
    <ul className="minibars" aria-label={label}>
      {valores.map((valor, indice) => (
        <li key={rotulos[indice] ?? indice}>
          <span className="minibars__coluna" title={`${rotulos[indice] ?? ''}: ${valor}`}>
            {base && <span className="minibars__base" style={{ height: `${((base[indice] ?? 0) / teto) * 100}%` }} />}
            <span className="minibars__valor" style={{ height: `${(valor / teto) * 100}%` }} />
          </span>
          <small>{rotulos[indice]}</small>
        </li>
      ))}
    </ul>
  )
}
