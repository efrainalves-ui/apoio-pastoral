import { ExternalLink } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { LINK_CATEGORIES, LINK_CATEGORY_LABELS, USEFUL_LINKS, type LinkCategory } from '../links/catalog'

/**
 * Links úteis: uma página e nada mais.
 *
 * A lista vem do código, versionada com o aplicativo. Não há campo para
 * acrescentar link, e isso é a versão de hoje, não um esquecimento: sem conta
 * administradora e sem moderação, uma lista editável por qualquer pastor é um
 * canal aberto sem ninguém respondendo por ele.
 */
export function UsefulLinksPage() {
  const porCategoria = LINK_CATEGORIES
    .map((categoria: LinkCategory) => ({ categoria, links: USEFUL_LINKS.filter((link) => link.category === categoria) }))
    .filter(({ links }) => links.length > 0)

  return <div className="page-stack page-narrow">
    <header className="page-hero"><div><p className="eyebrow">Referências</p><h1>Links úteis</h1></div></header>
    {porCategoria.map(({ categoria, links }) => <Card key={categoria} title={LINK_CATEGORY_LABELS[categoria]}>
      <div className="settings-list">
        {links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer noopener">
          <span><ExternalLink /></span>
          <div><strong>{link.title}</strong><small>{link.description}</small></div>
        </a>)}
      </div>
    </Card>)}
    <Card title="Sobre esta lista">
      <ul className="plain-list">
        <li>Os endereços abrem em uma aba nova do navegador e nada do seu distrito é enviado a eles.</li>
        <li>A lista é atualizada quando o aplicativo é atualizado.</li>
      </ul>
    </Card>
  </div>
}
