import { ShieldCheck, Undo2 } from 'lucide-react'
import type { GrupoDeCorrecao, RegistroDoGrupo } from '../evangelism/consolidacao'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

interface Props {
  grupos: readonly GrupoDeCorrecao[]
  nomeDaIgreja: (id: string) => string | undefined
  ultimaLimpeza: { criadaEm: string; registros: number } | null
  aviso: string
  ocupado: boolean
  aoAplicar: (chaves: string[]) => void
  aoManter: (chave: string) => void
  aoDesfazer: () => void
}

const dia = (valor: string) => `${valor.slice(8, 10)}/${valor.slice(5, 7)}/${valor.slice(0, 4)}`
const datas = ({ inicio, fim }: RegistroDoGrupo) => !inicio && !fim ? 'Data não informada' : !inicio ? `até ${dia(fim)}` : fim && fim !== inicio ? `${dia(inicio)} a ${dia(fim)}` : dia(inicio)

function Lista({ titulo, itens }: { titulo: string; itens: readonly string[] }) {
  return <div><dt>{titulo}</dt><dd>{itens.length ? <ul>{itens.map((item) => <li key={item}>{item}</li>)}</ul> : 'Nada'}</dd></div>
}

/**
 * Revisar correções encontradas.
 *
 * A análise roda sozinha; gravar, nunca. Cada grupo mostra o registro mantido,
 * os outros, o que é preservado, ligado e removido, e o motivo — e só muda
 * alguma coisa depois de o pastor escolher.
 */
export function RevisarCorrecoes({ grupos, nomeDaIgreja, ultimaLimpeza, aviso, ocupado, aoAplicar, aoManter, aoDesfazer }: Props) {
  if (!grupos.length && !ultimaLimpeza && !aviso) return null
  const seguros = grupos.filter(({ seguro }) => seguro)
  const igrejas = (ids: readonly string[]) => ids.map(nomeDaIgreja).filter(Boolean).join(', ') || '—'

  return <Card id="revisar-correcoes" className="revisao-correcoes" title="Revisar correções encontradas" action={<ShieldCheck aria-hidden="true" />}>
    {aviso && <div className="alert alert--success" role="status">{aviso}</div>}
    {(seguros.length > 0 || ultimaLimpeza) && <div className="form-actions revisao-correcoes__topo">
      {seguros.length > 0 && <Button disabled={ocupado} onClick={() => aoAplicar(seguros.map(({ chave }) => chave))}>Aplicar todas as correções seguras ({seguros.length})</Button>}
      {ultimaLimpeza && <Button variant="secondary" icon={<Undo2 />} disabled={ocupado} onClick={aoDesfazer}>Desfazer limpeza</Button>}
    </div>}
    {grupos.map((grupo) => <article className="revisao-grupo" key={grupo.chave} aria-label={`Correção de ${grupo.titulo}`}>
      <header className="revisao-grupo__cabecalho">
        <div><small>{grupo.tipo === 'campanha_repetida' ? 'Campanha repetida' : 'Metas repetidas da campanha'}</small><h3>{grupo.titulo}</h3></div>
        <span className={`entity-badge ${grupo.seguro ? 'situacao--em_andamento' : 'situacao--sem_data'}`}>{grupo.seguro ? 'Correção segura' : 'Revisar com atenção'}</span>
      </header>
      <p className="revisao-grupo__motivo"><strong>Motivo</strong> {grupo.motivo}</p>
      <div className="revisao-grupo__rolagem">
        <table className="tabela-simples revisao-grupo__tabela">
          <thead><tr><th scope="col">Registro</th><th scope="col">Datas</th><th scope="col">Igreja</th><th scope="col">Origem</th><th scope="col">O que acontece</th></tr></thead>
          <tbody>{[grupo.principal, ...grupo.registros].map((registro, indice) => <tr key={registro.id} className={indice === 0 ? 'revisao-grupo__principal' : undefined}>
            <th scope="row" data-rotulo="Registro">{registro.nome}</th>
            <td data-rotulo="Datas">{datas(registro)}</td>
            <td data-rotulo="Igreja">{igrejas(registro.churchIds)}</td>
            <td data-rotulo="Origem">{registro.origem}</td>
            <td data-rotulo="O que acontece">{indice === 0 ? 'Registro principal · mantido' : registro.acao}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <dl className="revisao-grupo__efeitos">
        <Lista titulo="Preservado" itens={grupo.preservado} />
        <Lista titulo="Vinculado" itens={grupo.vinculado} />
        <Lista titulo="Removido" itens={grupo.removido} />
      </dl>
      <div className="form-actions">
        <Button disabled={ocupado} onClick={() => aoAplicar([grupo.chave])}>Aplicar correção</Button>
        <Button variant="secondary" disabled={ocupado} onClick={() => aoManter(grupo.chave)}>Manter separados</Button>
      </div>
    </article>)}
  </Card>
}
