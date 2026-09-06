/**
 * Claro, escuro, ou o que o aparelho disser.
 *
 * O aplicativo seguia só a preferência do sistema. Funciona na maior parte do
 * tempo e falha justamente onde importa: no púlpito com luz forte, ou numa
 * visita à noite, quando a escolha do celular não é a escolha certa para aquele
 * momento.
 *
 * A preferência fica neste aparelho, não na conta: ela é sobre a tela que está
 * na frente da pessoa, e não sobre o distrito.
 */
export type Tema = 'sistema' | 'claro' | 'escuro'

const CHAVE = 'apoio-pastoral:tema'

export function temaGuardado(): Tema {
  try {
    const lido = localStorage.getItem(CHAVE)
    return lido === 'claro' || lido === 'escuro' ? lido : 'sistema'
  } catch {
    return 'sistema'
  }
}

/**
 * Aplica a escolha no documento.
 *
 * `sistema` remove a marca em vez de escrever um valor: é a diferença entre
 * "siga o aparelho" e "fique claro para sempre", e sem isso quem escolhesse
 * seguir o sistema ficaria preso ao tema do momento em que escolheu.
 */
export function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement
  if (tema === 'sistema') raiz.removeAttribute('data-tema')
  else raiz.setAttribute('data-tema', tema)
}

export function guardarTema(tema: Tema): void {
  try {
    if (tema === 'sistema') localStorage.removeItem(CHAVE)
    else localStorage.setItem(CHAVE, tema)
  } catch { /* sem armazenamento: a escolha vale só nesta sessão */ }
  aplicarTema(tema)
}
