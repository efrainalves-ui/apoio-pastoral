import { useId, useState, type CSSProperties } from 'react'
import { CATEGORIAS_VISUAIS, identidadeDoCompromisso, type IdentidadeDaCategoria } from '../../agenda/identidade'
import { AREAS_DO_PLANO, nomeCurtoDaArea } from '../../plano-estrategico/areas'
import { SimboloDaArea } from '../plano/SimboloDaArea'

/**
 * Os atributos que dão a um elemento a identidade da categoria: a classe, o
 * nível de destaque e os tons claro e escuro como variáveis de CSS. Quem
 * escolhe o tom do tema é a folha de estilos; a cor vem só da configuração.
 */
export function atributosDaCategoria(categoria: string | IdentidadeDaCategoria): { 'data-categoria': string; 'data-destaque': string; style: CSSProperties } {
  const item = typeof categoria === 'string' ? identidadeDoCompromisso(categoria) : categoria
  const { claro, escuro } = item.tons
  return {
    'data-categoria': item.id,
    'data-destaque': item.destaque,
    style: {
      '--cat-faixa': claro.faixa, '--cat-fundo': claro.fundo, '--cat-texto': claro.texto, '--cat-icone': claro.icone,
      '--cat-faixa-escuro': escuro.faixa, '--cat-fundo-escuro': escuro.fundo, '--cat-texto-escuro': escuro.texto, '--cat-icone-escuro': escuro.icone,
    } as CSSProperties,
  }
}

/** Ícone e nome da categoria, sempre juntos: a cor nunca identifica sozinha. */
export function SeloDaCategoria({ categoria }: { categoria: string }) {
  const item = identidadeDoCompromisso(categoria)
  const Icone = item.Icone
  return <span className="selo-categoria"><Icone className="selo-categoria__icone" aria-hidden="true" /><span className="selo-categoria__nome">{item.rotulo}</span></span>
}

/** Legenda das cores: aberta no computador; no celular, abre e fecha pelo botão. */
export function LegendaDaAgenda() {
  const [aberta, setAberta] = useState(false)
  const id = useId()
  return (
    <div className={`legenda-agenda ${aberta ? 'legenda-agenda--aberta' : ''}`}>
      <button type="button" className="legenda-agenda__alternar" aria-expanded={aberta} aria-controls={id} onClick={() => setAberta((atual) => !atual)}>Legenda</button>
      <ul id={id} className="legenda-agenda__lista" aria-label="Legenda das categorias">
        {CATEGORIAS_VISUAIS.map((item) => {
          const Icone = item.Icone
          return <li key={item.id} className="legenda-agenda__item categoria-visual" {...atributosDaCategoria(item)}>
            <span className="legenda-agenda__amostra" aria-hidden="true" />
            <Icone className="selo-categoria__icone" aria-hidden="true" />
            <span>{item.rotulo}</span>
          </li>
        })}
      </ul>
      <div className="legenda-prioridades">
        <p className="legenda-prioridades__titulo" id={`${id}-prioridades`}>Prioridades estratégicas</p>
        <ul className="legenda-prioridades__lista" aria-labelledby={`${id}-prioridades`}>
          {AREAS_DO_PLANO.map((area) => <li key={area.slug} className={`legenda-prioridades__item area--${area.slug}`}>
            <SimboloDaArea simbolo={area.simbolo} />
            <span>{nomeCurtoDaArea(area)}</span>
          </li>)}
        </ul>
      </div>
    </div>
  )
}
