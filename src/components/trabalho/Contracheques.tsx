import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatar, type Centavos } from '../../family-budget/dinheiro'
import { CATALOGO_DO_TRABALHO, nomeCompleto } from '../../work-budget/catalogo'
import {
  divergencias, jaExisteParaACompetencia, TIPO_DE_RUBRICA_LABELS, TIPOS_DE_RUBRICA,
  totaisDoContracheque, type Contracheque, type ContrachequeData, type Rubrica, type TipoDeRubrica,
} from '../../work-budget/contracheque'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { CampoDeValor, dataDeHoje, formatarData } from './campos'

interface ContrachequesProps {
  competencia: string
  contracheques: Contracheque[]
  subsistencia: Centavos | null
  onSalvar: (dados: ContrachequeData, id?: string) => void
  onApagar: (id: string) => void
}

const rubricaVazia = (): Rubrica => ({ codigo: '', descricao: '', tipo: 'provento', valor: 0, subcategoriaId: '' })

/**
 * Os contracheques do pastor.
 *
 * Três tipos de linha, e o terceiro é o que costuma estragar a conta: provento
 * entra, desconto sai, e a base informativa não faz nem uma coisa nem outra —
 * ela mostra sobre que valor um cálculo incidiu. Por isso ela aparece somada à
 * parte, longe do líquido.
 */
export function Contracheques({ competencia, contracheques, subsistencia, onSalvar, onApagar }: ContrachequesProps) {
  const [rascunho, setRascunho] = useState<ContrachequeData | null>(null)
  const [editandoId, setEditandoId] = useState('')

  const doMes = useMemo(
    () => [...contracheques].sort((esquerda, direita) => direita.competencia.localeCompare(esquerda.competencia)),
    [contracheques],
  )
  const totais = rascunho ? totaisDoContracheque(rascunho.rubricas) : null
  const achados = rascunho ? divergencias(rascunho, { liquido: null, subsistencia }) : []
  const duplicado = rascunho && !editandoId ? jaExisteParaACompetencia(contracheques, rascunho.competencia) : null

  function mudarRubrica(indice: number, mudanca: Partial<Rubrica>) {
    if (!rascunho) return
    setRascunho({
      ...rascunho,
      rubricas: rascunho.rubricas.map((rubrica, atual) => atual === indice ? { ...rubrica, ...mudanca } : rubrica),
    })
  }

  return <>
    <div className="page-actions">
      <Button icon={<Plus />} onClick={() => {
        setEditandoId('')
        setRascunho({
          competencia, dataDePagamento: dataDeHoje(), origem: '', rubricas: [rubricaVazia()],
          conferido: false, observacao: '', createdAt: '', updatedAt: '',
        })
      }}>Novo contracheque</Button>
    </div>

    {rascunho && <Card title={editandoId ? 'Editar contracheque' : 'Novo contracheque'}>
      <div className="form-grid">
        <label className="field" htmlFor="folha-competencia"><span className="field__label">Competência</span>
          <input id="folha-competencia" className="field__input" type="month" value={rascunho.competencia} onChange={(evento) => setRascunho({ ...rascunho, competencia: evento.target.value })} />
        </label>
        <label className="field" htmlFor="folha-pagamento"><span className="field__label">Data do pagamento</span>
          <input id="folha-pagamento" className="field__input" type="date" value={rascunho.dataDePagamento} onChange={(evento) => setRascunho({ ...rascunho, dataDePagamento: evento.target.value })} />
        </label>
        <label className="field" htmlFor="folha-origem"><span className="field__label">Origem</span>
          <input id="folha-origem" className="field__input" value={rascunho.origem} onChange={(evento) => setRascunho({ ...rascunho, origem: evento.target.value })} />
        </label>
      </div>

      {duplicado && <div className="alert alert--warning" role="status">
        Já há um contracheque de {duplicado.competencia} guardado.
      </div>}

      <div className="lista-regras">
        {rascunho.rubricas.map((rubrica, indice) => <fieldset key={indice} className="regra-do-item">
          <legend>Rubrica {indice + 1}</legend>
          <div className="form-grid">
            <label className="field" htmlFor={`rubrica-${indice}-codigo`}><span className="field__label">Código</span>
              <input id={`rubrica-${indice}-codigo`} className="field__input" value={rubrica.codigo} onChange={(evento) => mudarRubrica(indice, { codigo: evento.target.value })} />
            </label>
            <label className="field" htmlFor={`rubrica-${indice}-descricao`}><span className="field__label">Descrição</span>
              <input id={`rubrica-${indice}-descricao`} className="field__input" value={rubrica.descricao} onChange={(evento) => mudarRubrica(indice, { descricao: evento.target.value })} />
            </label>
            <label className="field" htmlFor={`rubrica-${indice}-tipo`}><span className="field__label">Tipo</span>
              <select id={`rubrica-${indice}-tipo`} className="field__input" value={rubrica.tipo} onChange={(evento) => mudarRubrica(indice, { tipo: evento.target.value as TipoDeRubrica })}>
                {TIPOS_DE_RUBRICA.map((opcao) => <option key={opcao} value={opcao}>{TIPO_DE_RUBRICA_LABELS[opcao]}</option>)}
              </select>
            </label>
            <CampoDeValor id={`rubrica-${indice}-valor`} label="Valor" valor={rubrica.valor} onChange={(valor) => mudarRubrica(indice, { valor })} />
            <label className="field" htmlFor={`rubrica-${indice}-item`}><span className="field__label">Corresponde a</span>
              <select id={`rubrica-${indice}-item`} className="field__input" value={rubrica.subcategoriaId} onChange={(evento) => mudarRubrica(indice, { subcategoriaId: evento.target.value })}>
                <option value="">Não apontado</option>
                {CATALOGO_DO_TRABALHO.map((familia) => <optgroup key={familia.id} label={familia.nome}>
                  {familia.subcategorias.map((subcategoria) => <option key={subcategoria.id} value={subcategoria.id}>{subcategoria.nome}</option>)}
                </optgroup>)}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <Button variant="danger" icon={<Trash2 />} aria-label={`Remover rubrica ${indice + 1}`} onClick={() => setRascunho({ ...rascunho, rubricas: rascunho.rubricas.filter((_, atual) => atual !== indice) })} />
          </div>
        </fieldset>)}
      </div>

      <div className="form-actions">
        <Button variant="secondary" icon={<Plus />} onClick={() => setRascunho({ ...rascunho, rubricas: [...rascunho.rubricas, rubricaVazia()] })}>Nova rubrica</Button>
      </div>

      {totais && <dl className="estrato">
        <div><dt>Proventos</dt><dd>{formatar(totais.proventos)}</dd></div>
        <div><dt>Descontos</dt><dd>{formatar(totais.descontos)}</dd></div>
        <div><dt>Líquido</dt><dd>{formatar(totais.liquido)}</dd></div>
      </dl>}

      {/*
        Somada à parte e longe do líquido, porque é isso que ela é: a base sobre
        a qual um cálculo incidiu, e não dinheiro que entrou.
      */}
      {Boolean(totais?.basesInformativas) && <dl className="estrato memoria-do-calculo">
        <div><dt>Outras bases informativas</dt><dd>{formatar(totais!.basesInformativas)}</dd></div>
      </dl>}

      {achados.map((achado) => <div className={`alert ${achado.grave ? 'alert--error' : 'alert--warning'}`} role="status" key={achado.chave}>{achado.texto}</div>)}

      <label className="field field--checkbox" htmlFor="folha-conferido">
        <input id="folha-conferido" type="checkbox" checked={rascunho.conferido} onChange={(evento) => setRascunho({ ...rascunho, conferido: evento.target.checked })} />
        <span className="field__label">Conferido linha por linha</span>
      </label>

      <div className="form-actions">
        <Button onClick={() => { onSalvar(rascunho, editandoId || undefined); setRascunho(null); setEditandoId('') }}>Salvar contracheque</Button>
        <Button variant="quiet" onClick={() => { setRascunho(null); setEditandoId('') }}>Cancelar</Button>
      </div>
    </Card>}

    <Card title="Contracheques">
      {doMes.length === 0
        ? <p className="card-copy">Nenhum contracheque guardado.</p>
        : <div className="entity-list">{doMes.map((contracheque) => {
          const totaisDele = totaisDoContracheque(contracheque.rubricas)
          return <div className="entity-row entity-row--texto" key={contracheque.id}>
            <span>
              <strong>{contracheque.competencia}</strong>
              <small>
                {contracheque.dataDePagamento ? formatarData(contracheque.dataDePagamento) : 'Sem data de pagamento'}
                {' · '}{contracheque.rubricas.length} {contracheque.rubricas.length === 1 ? 'rubrica' : 'rubricas'}
                {contracheque.rubricas.some((rubrica) => rubrica.subcategoriaId) ? ` · ${nomeCompleto(contracheque.rubricas.find((rubrica) => rubrica.subcategoriaId)!.subcategoriaId)}` : ''}
              </small>
            </span>
            <strong>{formatar(totaisDele.liquido)}</strong>
            {contracheque.conferido
              ? <span className="status-pill status-pill--success">Conferido</span>
              : <span className="status-pill status-pill--warning">A conferir</span>}
            <Button variant="quiet" onClick={() => { setEditandoId(contracheque.id); const { id: _id, ...dados } = contracheque; void _id; setRascunho(dados) }}>Editar</Button>
            <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar contracheque de ${contracheque.competencia}`} onClick={() => onApagar(contracheque.id)} />
          </div>
        })}</div>}
    </Card>
  </>
}
