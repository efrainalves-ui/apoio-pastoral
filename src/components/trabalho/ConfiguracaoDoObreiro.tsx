import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatar, type Centavos } from '../../family-budget/dinheiro'
import {
  CONDICAO_LABELS, CONDICOES_MINISTERIAIS, RESPONSABILIDADE_LABELS, RESPONSABILIDADES,
  SITUACAO_DE_AGUA_LABELS, SITUACOES_DE_AGUA, TIPO_DE_MORADIA_LABELS, TIPOS_DE_MORADIA,
  quotaPais, regraDeItemVazia, VINCULOS_DE_DEPENDENTE,
  type ConfiguracaoDoTrabalhoData, type DependenteData, type RegraDeItem, type VinculoDeDependente,
} from '../../work-budget/configuracao'
import { CATALOGO_DO_TRABALHO, itensDoLimiteConjunto, nomeCompleto } from '../../work-budget/catalogo'
import {
  BASE_LABELS, BASES_DE_CALCULO, emOrdem, subsistenciaBasica, vigenteEm,
  type BaseDeCalculo, type ValorComVigencia,
} from '../../work-budget/parametros'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { CampoDePercentual, CampoDeValor, ValorOuPendencia, dataDeHoje, formatarData } from './campos'

interface ConfiguracaoDoObreiroProps {
  valor: ConfiguracaoDoTrabalhoData
  hoje: string
  competencia: string
  dependentes: Array<DependenteData & { id: string }>
  onChange: (valor: ConfiguracaoDoTrabalhoData) => void
  onSalvar: () => void
  onSalvarDependente: (dados: DependenteData, id?: string) => void
  onApagarDependente: (id: string) => void
}

/**
 * A configuração do obreiro.
 *
 * Cada parâmetro entra com a data em que passou a valer, e o anterior fica no
 * histórico em vez de ser sobrescrito. É isso que permite a um lançamento de
 * março continuar usando o FPE de março depois que o FPE mudar em julho.
 */
export function ConfiguracaoDoObreiro({
  valor, hoje, competencia, dependentes, onChange, onSalvar, onSalvarDependente, onApagarDependente,
}: ConfiguracaoDoObreiroProps) {
  const [dependente, setDependente] = useState<DependenteData | null>(null)
  const [dependenteId, setDependenteId] = useState('')
  const [novoFpe, setNovoFpe] = useState<Centavos>(0)
  const [inicioDoFpe, setInicioDoFpe] = useState(dataDeHoje())
  const [referenciaDoFpe, setReferenciaDoFpe] = useState('')
  const [novoAudit, setNovoAudit] = useState<number | null>(null)
  const [inicioDoAudit, setInicioDoAudit] = useState(dataDeHoje())
  const [referenciaDoAudit, setReferenciaDoAudit] = useState('')
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [novaRegra, setNovaRegra] = useState('')

  const campo = <T extends keyof ConfiguracaoDoTrabalhoData>(chave: T, novo: ConfiguracaoDoTrabalhoData[T]) =>
    onChange({ ...valor, [chave]: novo })

  /* As chaves que o catálogo já usa, mais as que o pastor tenha criado. */
  const chavesConjuntas = [...new Set([
    ...CATALOGO_DO_TRABALHO.flatMap((familia) => familia.subcategorias.map(({ limiteConjunto }) => limiteConjunto)),
    ...Object.values(valor.regrasPorItem).map(({ limiteConjunto }) => limiteConjunto),
  ])].filter(Boolean)

  const fpeVigente = vigenteEm(valor.fpe, hoje)
  const auditVigente = vigenteEm(valor.percentualDeAudit, hoje)
  const subsistencia = subsistenciaBasica(fpeVigente?.valor ?? null, auditVigente?.valor ?? null)

  function acrescentarFpe() {
    if (!novoFpe || !inicioDoFpe) return
    campo('fpe', [...valor.fpe, { valor: novoFpe, inicio: inicioDoFpe, fim: '', referencia: referenciaDoFpe.trim(), observacao: '' }])
    setNovoFpe(0); setReferenciaDoFpe('')
  }

  function acrescentarAudit() {
    if (novoAudit === null || !inicioDoAudit) return
    campo('percentualDeAudit', [...valor.percentualDeAudit, { valor: novoAudit, inicio: inicioDoAudit, fim: '', referencia: referenciaDoAudit.trim(), observacao: '' }])
    setNovoAudit(null); setReferenciaDoAudit('')
  }

  function mudarRegra(chave: string, mudanca: Partial<RegraDeItem>) {
    campo('regrasPorItem', { ...valor.regrasPorItem, [chave]: { ...(valor.regrasPorItem[chave] ?? regraDeItemVazia()), ...mudanca } })
  }

  function removerRegra(chave: string) {
    const { [chave]: _removida, ...resto } = valor.regrasPorItem
    void _removida
    campo('regrasPorItem', resto)
  }

  return <>
    <Card title="Base de subsistência">
      <dl className="estrato">
        <div><dt>FPE vigente</dt><dd><ValorOuPendencia valor={fpeVigente?.valor ?? null} /></dd></div>
        <div><dt>Percentual de Audit</dt><dd>{auditVigente ? `${auditVigente.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : <span className="valor-pendente">Ainda não configurado</span>}</dd></div>
        <div><dt>Subsistência básica</dt><dd><ValorOuPendencia valor={subsistencia} /></dd></div>
        <div><dt>Vigência</dt><dd>{fpeVigente ? `Desde ${formatarData(fpeVigente.inicio)}` : '—'}</dd></div>
      </dl>
      <div className="form-actions">
        <Button variant="quiet" onClick={() => setHistoricoAberto(!historicoAberto)} aria-expanded={historicoAberto}>
          {historicoAberto ? 'Ocultar histórico' : 'Ver histórico'}
        </Button>
      </div>
      {historicoAberto && <div className="entity-list">
        {emOrdem<Centavos>(valor.fpe).map((item) => <LinhaDoHistorico
          key={`fpe-${item.inicio}`}
          rotulo={`FPE ${formatar(item.valor)}`}
          item={item}
          onRemover={() => campo('fpe', valor.fpe.filter((outro) => outro !== item))}
        />)}
        {emOrdem<number>(valor.percentualDeAudit).map((item) => <LinhaDoHistorico
          key={`audit-${item.inicio}`}
          rotulo={`Audit ${item.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}
          item={item}
          onRemover={() => campo('percentualDeAudit', valor.percentualDeAudit.filter((outro) => outro !== item))}
        />)}
        {!valor.fpe.length && !valor.percentualDeAudit.length && <p className="card-copy">Nenhum parâmetro informado.</p>}
      </div>}
    </Card>

    <Card title="Novo FPE">
      <div className="form-grid">
        <CampoDeValor id="config-fpe" label="Valor" valor={novoFpe} onChange={setNovoFpe} />
        <label className="field" htmlFor="config-fpe-inicio"><span className="field__label">Vale a partir de</span>
          <input id="config-fpe-inicio" className="field__input" type="date" value={inicioDoFpe} onChange={(evento) => setInicioDoFpe(evento.target.value)} />
        </label>
        <label className="field" htmlFor="config-fpe-ref"><span className="field__label">Documento</span>
          <input id="config-fpe-ref" className="field__input" value={referenciaDoFpe} onChange={(evento) => setReferenciaDoFpe(evento.target.value)} />
        </label>
      </div>
      <div className="form-actions"><Button icon={<Plus />} onClick={acrescentarFpe}>Acrescentar</Button></div>
    </Card>

    <Card title="Novo Percentual de Audit">
      <div className="form-grid">
        <CampoDePercentual id="config-audit" label="Percentual" valor={novoAudit} onChange={setNovoAudit} />
        <label className="field" htmlFor="config-audit-inicio"><span className="field__label">Vale a partir de</span>
          <input id="config-audit-inicio" className="field__input" type="date" value={inicioDoAudit} onChange={(evento) => setInicioDoAudit(evento.target.value)} />
        </label>
        <label className="field" htmlFor="config-audit-ref"><span className="field__label">Documento</span>
          <input id="config-audit-ref" className="field__input" value={referenciaDoAudit} onChange={(evento) => setReferenciaDoAudit(evento.target.value)} />
        </label>
      </div>
      <div className="form-actions"><Button icon={<Plus />} onClick={acrescentarAudit}>Acrescentar</Button></div>
    </Card>

    <Card title="Vínculo">
      <div className="form-grid">
        <label className="field" htmlFor="config-uniao"><span className="field__label">União</span>
          <input id="config-uniao" className="field__input" value={valor.uniao} onChange={(evento) => campo('uniao', evento.target.value)} />
        </label>
        <label className="field" htmlFor="config-campo"><span className="field__label">Campo</span>
          <input id="config-campo" className="field__input" value={valor.campo} onChange={(evento) => campo('campo', evento.target.value)} />
        </label>
        <label className="field" htmlFor="config-instituicao"><span className="field__label">Instituição</span>
          <input id="config-instituicao" className="field__input" value={valor.instituicao} onChange={(evento) => campo('instituicao', evento.target.value)} />
        </label>
        <label className="field" htmlFor="config-funcao"><span className="field__label">Função</span>
          <input id="config-funcao" className="field__input" value={valor.funcao} onChange={(evento) => campo('funcao', evento.target.value)} />
        </label>
        <label className="field" htmlFor="config-condicao"><span className="field__label">Condição</span>
          <select id="config-condicao" className="field__input" value={valor.condicao} onChange={(evento) => campo('condicao', evento.target.value as ConfiguracaoDoTrabalhoData['condicao'])}>
            {CONDICOES_MINISTERIAIS.map((opcao) => <option key={opcao} value={opcao}>{CONDICAO_LABELS[opcao]}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="config-credencial"><span className="field__label">Credencial</span>
          <input id="config-credencial" className="field__input" value={valor.credencial} onChange={(evento) => campo('credencial', evento.target.value)} />
        </label>
        <label className="field" htmlFor="config-ingresso"><span className="field__label">Data de ingresso</span>
          <input id="config-ingresso" className="field__input" type="date" value={valor.dataDeIngresso} onChange={(evento) => campo('dataDeIngresso', evento.target.value)} />
        </label>
        <label className="field" htmlFor="config-pais"><span className="field__label">País</span>
          <input id="config-pais" className="field__input" value={valor.pais} onChange={(evento) => campo('pais', evento.target.value)} />
        </label>
      </div>
    </Card>

    <Card title="Moradia">
      <div className="form-grid">
        <label className="field" htmlFor="config-moradia"><span className="field__label">Situação</span>
          <select id="config-moradia" className="field__input" value={valor.tipoDeMoradia} onChange={(evento) => campo('tipoDeMoradia', evento.target.value as ConfiguracaoDoTrabalhoData['tipoDeMoradia'])}>
            {TIPOS_DE_MORADIA.map((opcao) => <option key={opcao} value={opcao}>{TIPO_DE_MORADIA_LABELS[opcao]}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="config-agua"><span className="field__label">Água</span>
          <select id="config-agua" className="field__input" value={valor.situacaoDeAgua} onChange={(evento) => campo('situacaoDeAgua', evento.target.value as ConfiguracaoDoTrabalhoData['situacaoDeAgua'])}>
            {SITUACOES_DE_AGUA.map((opcao) => <option key={opcao} value={opcao}>{SITUACAO_DE_AGUA_LABELS[opcao]}</option>)}
          </select>
        </label>
      </div>
    </Card>

    <Card title="Quem paga cada conta">
      <div className="form-grid">
        <label className="field" htmlFor="config-nova-regra"><span className="field__label">Acrescentar item</span>
          <select id="config-nova-regra" className="field__input" value={novaRegra} onChange={(evento) => {
            const escolhido = evento.target.value
            setNovaRegra('')
            if (escolhido && !valor.regrasPorItem[escolhido]) mudarRegra(escolhido, {})
          }}>
            <option value="">Escolher</option>
            {CATALOGO_DO_TRABALHO.map((familia) => <optgroup key={familia.id} label={familia.nome}>
              {familia.subcategorias.map((subcategoria) => <option key={subcategoria.id} value={subcategoria.id}>{subcategoria.nome}</option>)}
            </optgroup>)}
          </select>
        </label>
      </div>
      {Object.keys(valor.regrasPorItem).length === 0
        ? <p className="card-copy">Nenhuma regra informada.</p>
        : <div className="lista-regras">
          {Object.entries(valor.regrasPorItem).map(([chave, regra]) => <fieldset key={chave} className="regra-do-item">
            <legend>{nomeCompleto(chave)}</legend>
            <div className="form-grid">
              <label className="field" htmlFor={`regra-${chave}-resp`}><span className="field__label">Responsabilidade</span>
                <select id={`regra-${chave}-resp`} className="field__input" value={regra.responsabilidade} onChange={(evento) => mudarRegra(chave, { responsabilidade: evento.target.value as RegraDeItem['responsabilidade'] })}>
                  {RESPONSABILIDADES.map((opcao) => <option key={opcao} value={opcao}>{RESPONSABILIDADE_LABELS[opcao]}</option>)}
                </select>
              </label>
              {regra.responsabilidade === 'reembolso_parcial' && <CampoDePercentual
                id={`regra-${chave}-perc`} label="Percentual reembolsado"
                valor={regra.percentual} onChange={(percentual) => mudarRegra(chave, { percentual })}
              />}
              <CampoDeValor id={`regra-${chave}-teto`} label="Teto" valor={regra.teto ?? 0} onChange={(teto) => mudarRegra(chave, { teto: teto || null })} />
              <CampoDePercentual id={`regra-${chave}-tetop`} label="Teto em percentual" valor={regra.tetoPercentual} onChange={(tetoPercentual) => mudarRegra(chave, { tetoPercentual })} />
              {regra.tetoPercentual !== null && <label className="field" htmlFor={`regra-${chave}-base`}><span className="field__label">Base do teto</span>
                <select id={`regra-${chave}-base`} className="field__input" value={regra.tetoBase ?? ''} onChange={(evento) => mudarRegra(chave, { tetoBase: (evento.target.value || null) as BaseDeCalculo | null })}>
                  <option value="">Escolher</option>
                  {BASES_DE_CALCULO.map((base) => <option key={base} value={base}>{BASE_LABELS[base]}</option>)}
                </select>
              </label>}
              {/*
                Escolher, e não digitar: dois itens só dividem um teto quando a
                chave é a mesma letra por letra, e "comunicacao" num campo e
                "Comunicação" no outro romperia o limite conjunto em silêncio.
              */}
              <label className="field" htmlFor={`regra-${chave}-conjunto`}><span className="field__label">Teto compartilhado</span>
                <select id={`regra-${chave}-conjunto`} className="field__input" value={regra.limiteConjunto} onChange={(evento) => mudarRegra(chave, { limiteConjunto: evento.target.value })}>
                  <option value="">Só deste item</option>
                  {chavesConjuntas.map((conjunta) => <option key={conjunta} value={conjunta}>{itensDoLimiteConjunto(conjunta).map(({ nome }) => nome).join(' e ') || conjunta}</option>)}
                </select>
              </label>
              <label className="field" htmlFor={`regra-${chave}-ref`}><span className="field__label">Documento</span>
                <input id={`regra-${chave}-ref`} className="field__input" value={regra.referencia} onChange={(evento) => mudarRegra(chave, { referencia: evento.target.value })} />
              </label>
            </div>
            <div className="form-actions form-actions--fim">
              <Button variant="danger" icon={<Trash2 />} aria-label={`Remover regra de ${nomeCompleto(chave)}`} onClick={() => removerRegra(chave)} />
            </div>
          </fieldset>)}
        </div>}
    </Card>

    <Card title="Dependentes">
      <div className="page-actions">
        <Button icon={<Plus />} onClick={() => {
          setDependenteId('')
          setDependente({
            nome: '', vinculo: 'filho', dataDeNascimento: '', dependente: true,
            nivelDeEnsino: '', instituicao: '', matriculaVigenteAte: '',
            temBolsaInstitucional: false, observacao: '', createdAt: '', updatedAt: '',
          })
        }}>Novo dependente</Button>
      </div>

      {dependente && <>
        <div className="form-grid">
          <label className="field" htmlFor="dependente-nome"><span className="field__label">Nome</span>
            <input id="dependente-nome" className="field__input" value={dependente.nome} onChange={(evento) => setDependente({ ...dependente, nome: evento.target.value })} />
          </label>
          <label className="field" htmlFor="dependente-vinculo"><span className="field__label">Vínculo</span>
            <select id="dependente-vinculo" className="field__input" value={dependente.vinculo} onChange={(evento) => setDependente({ ...dependente, vinculo: evento.target.value as VinculoDeDependente })}>
              {VINCULOS_DE_DEPENDENTE.map((opcao) => <option key={opcao} value={opcao}>{opcao === 'filho' ? 'Filho' : opcao === 'conjuge' ? 'Cônjuge' : 'Outro'}</option>)}
            </select>
          </label>
          <label className="field" htmlFor="dependente-nascimento"><span className="field__label">Nascimento</span>
            <input id="dependente-nascimento" className="field__input" type="date" value={dependente.dataDeNascimento} onChange={(evento) => setDependente({ ...dependente, dataDeNascimento: evento.target.value })} />
          </label>
          <label className="field" htmlFor="dependente-ensino"><span className="field__label">Nível de ensino</span>
            <input id="dependente-ensino" className="field__input" value={dependente.nivelDeEnsino} onChange={(evento) => setDependente({ ...dependente, nivelDeEnsino: evento.target.value })} />
          </label>
          <label className="field" htmlFor="dependente-instituicao"><span className="field__label">Instituição</span>
            <input id="dependente-instituicao" className="field__input" value={dependente.instituicao} onChange={(evento) => setDependente({ ...dependente, instituicao: evento.target.value })} />
          </label>
          <label className="field" htmlFor="dependente-matricula"><span className="field__label">Matrícula até</span>
            <input id="dependente-matricula" className="field__input" type="date" value={dependente.matriculaVigenteAte} onChange={(evento) => setDependente({ ...dependente, matriculaVigenteAte: evento.target.value })} />
          </label>
          <label className="field field--checkbox" htmlFor="dependente-dependente">
            <input id="dependente-dependente" type="checkbox" checked={dependente.dependente} onChange={(evento) => setDependente({ ...dependente, dependente: evento.target.checked })} />
            <span className="field__label">Consta como dependente</span>
          </label>
          <label className="field field--checkbox" htmlFor="dependente-bolsa">
            <input id="dependente-bolsa" type="checkbox" checked={dependente.temBolsaInstitucional} onChange={(evento) => setDependente({ ...dependente, temBolsaInstitucional: evento.target.checked })} />
            <span className="field__label">Tem bolsa institucional</span>
          </label>
        </div>
        <div className="form-actions">
          <Button onClick={() => { onSalvarDependente(dependente, dependenteId || undefined); setDependente(null); setDependenteId('') }}>Salvar dependente</Button>
          <Button variant="quiet" onClick={() => { setDependente(null); setDependenteId('') }}>Cancelar</Button>
        </div>
      </>}

      {dependentes.length === 0
        ? <p className="card-copy">Nenhum dependente cadastrado.</p>
        : <div className="entity-list">{dependentes.map((item) => {
          /*
            A quota muda no mês seguinte ao nono aniversário e termina no mês do
            décimo oitavo. Mostrá-la ao lado do nome é o que faz o pastor
            perceber a virada antes de ela passar em branco no contracheque.
          */
          const quota = quotaPais(item, competencia)
          return <div className="entity-row entity-row--texto" key={item.id}>
            <span>
              <strong>{item.nome}</strong>
              <small>
                {item.dataDeNascimento ? formatarData(item.dataDeNascimento) : 'Sem data de nascimento'}
                {item.instituicao ? ` · ${item.instituicao}` : ''}
                {item.temBolsaInstitucional ? ' · Com bolsa' : ''}
              </small>
            </span>
            {quota.elegivel
              ? <strong>{quota.percentual}%</strong>
              : <span className="valor-pendente">{quota.motivo}</span>}
            {Boolean(quota.motivo) && quota.elegivel && <span className="status-pill status-pill--muted">{quota.motivo}</span>}
            <Button variant="quiet" onClick={() => { setDependenteId(item.id); const { id: _id, ...dados } = item; void _id; setDependente(dados) }}>Editar</Button>
            <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar dependente ${item.nome}`} onClick={() => onApagarDependente(item.id)} />
          </div>
        })}</div>}
    </Card>

    <div className="form-actions"><Button onClick={onSalvar}>Salvar configuração</Button></div>
  </>
}

function LinhaDoHistorico<T>({ rotulo, item, onRemover }: {
  rotulo: string
  item: ValorComVigencia<T>
  onRemover: () => void
}) {
  return <div className="entity-row entity-row--texto">
    <span>
      <strong>{rotulo}</strong>
      <small>Desde {formatarData(item.inicio)}{item.referencia ? ` · ${item.referencia}` : ''}</small>
    </span>
    <Button variant="danger" icon={<Trash2 />} aria-label={`Remover ${rotulo}`} onClick={onRemover} />
  </div>
}
