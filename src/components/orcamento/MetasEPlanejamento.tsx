import { Copy, Plus, Target, Wallet } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { CATEGORIAS_DE_SAIDA } from '../../family-budget/catalogo'
import { formatar, lerValor, somar, type Centavos } from '../../family-budget/dinheiro'
import type { Integrante } from '../../family-budget/lancamento'
import { nomeDoIntegrante } from '../../family-budget/lancamento'
import {
  copiarPlanejamento, guardadoNaMeta, MODELOS_DE_META, objetivoDaMeta, preverMeta,
  reservaMensalDoFundo, somarMeses, totaisDoPlanejamento,
  type Aporte, type EspecieDeMeta, type Meta, type MetaData, type PlanejamentoData,
} from '../../family-budget/metas'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { ProgressRing } from '../ui/ProgressRing'

const ABAS = [
  ['planejamento', 'Planejamento mensal'],
  ['metas', 'Metas e sonhos'],
  ['fundos', 'Fundos planejados'],
  ['reserva', 'Reserva de emergência'],
] as const
type Aba = (typeof ABAS)[number][0]

const ESPECIE_DA_ABA: Record<string, EspecieDeMeta> = { metas: 'meta', fundos: 'fundo', reserva: 'reserva' }

function metaVazia(especie: EspecieDeMeta, hoje: string): MetaData {
  return {
    especie, nome: '', categoria: especie === 'reserva' ? 'seguranca' : 'casa', integranteId: null,
    objetivo: 0, dataInicial: hoje, prazo: somarMeses(hoje.slice(0, 7), 12),
    contribuicaoPlanejada: 0, contaId: null,
    mesesDeReserva: especie === 'reserva' ? 6 : 0, despesaEssencial: 0,
    observacao: '', status: 'ativa', createdAt: '', updatedAt: '',
  }
}

interface MetasEPlanejamentoProps {
  mes: string
  hoje: string
  metas: Meta[]
  aportes: Aporte[]
  planejamento: PlanejamentoData | null
  planejamentoAnterior: PlanejamentoData | null
  integrantes: Integrante[]
  onSalvarPlanejamento: (dados: PlanejamentoData) => void
  onSalvarMeta: (dados: MetaData, id?: string) => void
  onAportar: (metaId: string, valor: Centavos, data: string) => void
  onApagarMeta: (meta: Meta) => void
}

/**
 * Metas e Planejamento numa área só.
 *
 * Planejar o mês e guardar para um sonho são o mesmo gesto em prazos
 * diferentes: os dois decidem, antes de o dinheiro chegar, para onde ele vai.
 * Separá-los em duas áreas fazia o pastor planejar num lugar e descobrir no
 * outro que não sobrou nada para a meta.
 */
export function MetasEPlanejamento({
  mes, hoje, metas, aportes, planejamento, planejamentoAnterior, integrantes,
  onSalvarPlanejamento, onSalvarMeta, onAportar, onApagarMeta,
}: MetasEPlanejamentoProps) {
  const [aba, setAba] = useState<Aba>('planejamento')
  const [rascunho, setRascunho] = useState<{ dados: MetaData; id?: string } | null>(null)

  return <div className="painel-financeiro">
    <nav className="tira-abas" aria-label="Áreas de metas e planejamento">
      {ABAS.map(([chave, rotulo]) => <button
        key={chave}
        type="button"
        aria-current={aba === chave ? 'page' : undefined}
        className={`chip-aba ${aba === chave ? 'chip-aba--ativa' : ''}`}
        onClick={() => { setAba(chave); setRascunho(null) }}
      >{rotulo}</button>)}
    </nav>

    {aba === 'planejamento' && <PlanejamentoMensal
      mes={mes}
      planejamento={planejamento}
      anterior={planejamentoAnterior}
      integrantes={integrantes}
      onSalvar={onSalvarPlanejamento}
    />}

    {aba !== 'planejamento' && <ListaDeMetas
      especie={ESPECIE_DA_ABA[aba]!}
      metas={metas.filter((meta) => meta.especie === ESPECIE_DA_ABA[aba])}
      aportes={aportes}
      integrantes={integrantes}
      hoje={hoje}
      rascunho={rascunho}
      onNovo={() => setRascunho({ dados: metaVazia(ESPECIE_DA_ABA[aba]!, hoje) })}
      onEditar={(meta) => { const { id, ...dados } = meta; setRascunho({ dados, id }) }}
      onFechar={() => setRascunho(null)}
      onSalvar={(dados, id) => { onSalvarMeta(dados, id); setRascunho(null) }}
      onAportar={onAportar}
      onApagar={onApagarMeta}
    />}
  </div>
}

function PlanejamentoMensal({ mes, planejamento, anterior, integrantes, onSalvar }: {
  mes: string
  planejamento: PlanejamentoData | null
  anterior: PlanejamentoData | null
  integrantes: Integrante[]
  onSalvar: (dados: PlanejamentoData) => void
}) {
  const inicial = planejamento ?? { mes, rendaPrevista: {}, orcamento: {}, createdAt: '', updatedAt: '' }
  const [dados, setDados] = useState<PlanejamentoData>(inicial)
  const [textos, setTextos] = useState<Record<string, string>>({})

  const totais = useMemo(() => totaisDoPlanejamento(dados), [dados])
  const pessoas: Array<[string, string]> = [['', 'Família'], ...integrantes.filter(({ ativo }) => ativo).map((pessoa) => [pessoa.id, pessoa.nome] as [string, string])]

  function mudarValor(grupo: 'rendaPrevista' | 'orcamento', chave: string, texto: string) {
    setTextos((atual) => ({ ...atual, [`${grupo}:${chave}`]: texto }))
    const valor = lerValor(texto) ?? 0
    setDados((atual) => ({ ...atual, [grupo]: { ...atual[grupo], [chave]: valor } }))
  }

  const texto = (grupo: string, chave: string, valor: Centavos) =>
    textos[`${grupo}:${chave}`] ?? (valor ? String(valor / 100).replace('.', ',') : '')

  return <>
    {anterior && !planejamento && <div className="linha-de-busca">
      <p className="conta-de-tarefas">Nada planejado para este mês ainda.</p>
      {/*
        Quem planeja todo mês repete quase tudo: o aluguel é o mesmo, a escola
        é a mesma. Recomeçar do zero é o que faz desistir no segundo mês.
      */}
      <button type="button" className="botao-novo" onClick={() => setDados(copiarPlanejamento(anterior, mes))}>
        <Copy aria-hidden="true" />Copiar do mês anterior
      </button>
    </div>}

    <section className="faixa" aria-label="Renda prevista">
      <h2 className="rotulo-secao">Renda prevista</h2>
      <div className="form-grid">
        {pessoas.map(([id, nome]) => <Field
          key={id || 'familia'}
          label={nome}
          name={`renda-${id || 'familia'}`}
          inputMode="decimal"
          value={texto('rendaPrevista', id, dados.rendaPrevista[id] ?? 0)}
          onChange={(evento) => mudarValor('rendaPrevista', id, evento.target.value)}
          placeholder="0,00"
        />)}
      </div>
    </section>

    <section className="faixa" aria-label="Orçamento por categoria">
      <h2 className="rotulo-secao">Orçamento por categoria</h2>
      <div className="form-grid">
        {CATEGORIAS_DE_SAIDA.map((categoria) => <Field
          key={categoria.codigo}
          label={categoria.nome}
          name={`orcamento-${categoria.codigo}`}
          inputMode="decimal"
          value={texto('orcamento', categoria.codigo, dados.orcamento[categoria.codigo] ?? 0)}
          onChange={(evento) => mudarValor('orcamento', categoria.codigo, evento.target.value)}
          placeholder="0,00"
        />)}
      </div>
    </section>

    <dl className="estrato">
      <div><dt>Renda prevista</dt><dd>{formatar(totais.renda)}</dd></div>
      <div><dt>Total planejado</dt><dd>{formatar(totais.planejado)}</dd></div>
      <div>
        <dt>{totais.estourou ? 'Passou da renda' : 'A distribuir'}</dt>
        <dd className={totais.estourou ? 'valor-negativo' : ''}>{formatar(Math.abs(totais.aDistribuir))}</dd>
      </div>
    </dl>

    {totais.estourou && <div className="alert alert--error" role="alert">
      O planejamento passa da renda prevista em {formatar(Math.abs(totais.aDistribuir))}.
    </div>}

    <div className="form-actions">
      <Button onClick={() => onSalvar(dados)} icon={<Wallet size={17} />}>Salvar planejamento</Button>
    </div>
  </>
}

function ListaDeMetas({
  especie, metas, aportes, integrantes, hoje, rascunho,
  onNovo, onEditar, onFechar, onSalvar, onAportar, onApagar,
}: {
  especie: EspecieDeMeta
  metas: Meta[]
  aportes: Aporte[]
  integrantes: Integrante[]
  hoje: string
  rascunho: { dados: MetaData; id?: string } | null
  onNovo: () => void
  onEditar: (meta: Meta) => void
  onFechar: () => void
  onSalvar: (dados: MetaData, id?: string) => void
  onAportar: (metaId: string, valor: Centavos, data: string) => void
  onApagar: (meta: Meta) => void
}) {
  const rotulo = especie === 'fundo' ? 'fundo' : especie === 'reserva' ? 'reserva' : 'meta'

  if (rascunho) {
    return <FormularioDeMeta
      valorInicial={rascunho.dados}
      id={rascunho.id}
      integrantes={integrantes}
      onSalvar={onSalvar}
      onCancelar={onFechar}
    />
  }

  return <>
    <div className="linha-de-busca">
      <p className="conta-de-tarefas">{metas.length} {metas.length === 1 ? rotulo : `${rotulo}s`}</p>
      <button type="button" className="botao-novo" onClick={onNovo}>
        <Plus aria-hidden="true" />{especie === 'fundo' ? 'Novo fundo' : especie === 'reserva' ? 'Nova reserva' : 'Nova meta'}
      </button>
    </div>

    {!metas.length && <div className="empty-state">
      <Target />
      <strong>{especie === 'fundo' ? 'Nenhum fundo planejado' : especie === 'reserva' ? 'Nenhuma reserva' : 'Nenhuma meta'}</strong>
      <span>{especie === 'fundo'
        ? 'Um fundo transforma a despesa anual em parcela mensal.'
        : especie === 'reserva'
          ? 'A reserva é calculada a partir do que a casa gasta por mês.'
          : 'O que a família quer alcançar aparece aqui.'}</span>
    </div>}

    <div className="lista-metas">
      {metas.map((meta) => {
        const guardado = guardadoNaMeta(aportes, meta.id)
        const objetivo = objetivoDaMeta(meta)
        const previsao = preverMeta(meta, guardado, hoje)
        const mensalDoFundo = especie === 'fundo' ? reservaMensalDoFundo(meta, guardado, hoje) : null
        const alcancada = previsao.falta === 0

        return <article className="cartao-meta" key={meta.id}>
          <ProgressRing
            percent={objetivo > 0 ? (guardado / objetivo) * 100 : 0}
            label={`Progresso de ${meta.nome}`}
            size={72}
            tone={alcancada ? 'ok' : previsao.noRitmo ? 'neutro' : 'atencao'}
          >{objetivo > 0 ? `${Math.round((guardado / objetivo) * 100)}%` : '—'}</ProgressRing>

          <div className="cartao-meta__corpo">
            <strong>{meta.nome}</strong>
            <small>{formatar(guardado)} de {formatar(objetivo)}{meta.integranteId ? ` · ${nomeDoIntegrante(integrantes, meta.integranteId)}` : ''}</small>

            {alcancada
              ? <p className="cartao-meta__nota valor-entrada">Alcançada.</p>
              : <p className="cartao-meta__nota">
                Faltam {formatar(previsao.falta)}
                {mensalDoFundo !== null && <> · reserve {formatar(mensalDoFundo)} por mês</>}
                {mensalDoFundo === null && previsao.necessarioPorMes !== null && <> · {formatar(previsao.necessarioPorMes)} por mês até {meta.prazo}</>}
              </p>}

            {/*
              Duas contas diferentes: o que o prazo exige e o que o ritmo atual
              entrega. Mostrar só a primeira faz a meta parecer viável quando
              não é.
            */}
            {!alcancada && previsao.conclusaoNoRitmoAtual && <p className={`cartao-meta__nota ${previsao.noRitmo ? '' : 'valor-atencao'}`}>
              Guardando {formatar(meta.contribuicaoPlanejada)} por mês, conclui em {previsao.conclusaoNoRitmoAtual}.
            </p>}

            <div className="cartao-meta__acoes">
              <FormularioDeAporte metaId={meta.id} hoje={hoje} onAportar={onAportar} />
              <button type="button" className="text-button" onClick={() => onEditar(meta)}>Editar</button>
              <button type="button" className="text-button danger-icon" onClick={() => onApagar(meta)}>Excluir</button>
            </div>
          </div>
        </article>
      })}
    </div>

    {Boolean(metas.length) && <dl className="estrato">
      <div><dt>Objetivo total</dt><dd>{formatar(somar(metas.map(objetivoDaMeta)))}</dd></div>
      <div><dt>Já guardado</dt><dd className="valor-entrada">{formatar(somar(metas.map((meta) => guardadoNaMeta(aportes, meta.id))))}</dd></div>
    </dl>}
  </>
}

function FormularioDeAporte({ metaId, hoje, onAportar }: { metaId: string; hoje: string; onAportar: (metaId: string, valor: Centavos, data: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')

  if (!aberto) return <button type="button" className="text-button" onClick={() => setAberto(true)}>+ Aporte</button>

  return <span className="aporte-rapido">
    <input
      className="field__input"
      inputMode="decimal"
      value={texto}
      onChange={(evento) => setTexto(evento.target.value)}
      placeholder="0,00"
      aria-label="Valor do aporte"
      autoFocus
    />
    <button type="button" className="botao-novo" onClick={() => {
      const valor = lerValor(texto)
      if (valor && valor > 0) onAportar(metaId, valor, hoje)
      setTexto('')
      setAberto(false)
    }}>Guardar</button>
    <button type="button" className="text-button" onClick={() => { setTexto(''); setAberto(false) }}>Cancelar</button>
  </span>
}

function FormularioDeMeta({ valorInicial, id, integrantes, onSalvar, onCancelar }: {
  valorInicial: MetaData
  id?: string | undefined
  integrantes: Integrante[]
  onSalvar: (dados: MetaData, id?: string) => void
  onCancelar: () => void
}) {
  const [dados, setDados] = useState(valorInicial)
  const [objetivo, setObjetivo] = useState(valorInicial.objetivo ? String(valorInicial.objetivo / 100).replace('.', ',') : '')
  const [contribuicao, setContribuicao] = useState(valorInicial.contribuicaoPlanejada ? String(valorInicial.contribuicaoPlanejada / 100).replace('.', ',') : '')
  const [essencial, setEssencial] = useState(valorInicial.despesaEssencial ? String(valorInicial.despesaEssencial / 100).replace('.', ',') : '')
  const [erro, setErro] = useState('')

  const muda = (mudanca: Partial<MetaData>) => setDados((atual) => ({ ...atual, ...mudanca }))
  const reserva = dados.especie === 'reserva'

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!dados.nome.trim()) { setErro('Informe um nome.'); return }
    const valorObjetivo = lerValor(objetivo) ?? 0
    const valorEssencial = lerValor(essencial) ?? 0
    if (!reserva && valorObjetivo <= 0) { setErro('Informe o valor do objetivo.'); return }
    if (reserva && valorEssencial <= 0 && valorObjetivo <= 0) { setErro('Informe a despesa essencial média.'); return }
    setErro('')
    onSalvar({
      ...dados,
      nome: dados.nome.trim(),
      objetivo: valorObjetivo,
      contribuicaoPlanejada: lerValor(contribuicao) ?? 0,
      despesaEssencial: valorEssencial,
    }, id)
  }

  return <form className="formulario-lancamento" onSubmit={enviar} noValidate>
    {erro && <div className="alert alert--error" role="alert">{erro}</div>}

    {!id && dados.especie === 'meta' && <div className="tira-filtros" role="group" aria-label="Modelos de meta">
      {MODELOS_DE_META.flatMap(([codigo, , exemplos]) => exemplos.slice(0, 2).map((exemplo) => <button
        key={`${codigo}-${exemplo}`}
        type="button"
        className="chip-filtro"
        onClick={() => muda({ nome: exemplo, categoria: codigo })}
      >{exemplo}</button>))}
    </div>}

    <Field label="Nome *" name="meta-nome" value={dados.nome} onChange={(evento) => muda({ nome: evento.target.value })} autoFocus />

    {reserva
      ? <div className="form-grid">
        <Field
          label="Despesa essencial média por mês *"
          name="meta-essencial"
          inputMode="decimal"
          value={essencial}
          onChange={(evento) => setEssencial(evento.target.value)}
          placeholder="0,00"
        />
        <label className="field" htmlFor="meta-meses">
          <span className="field__label">Quantos meses cobrir</span>
          <select id="meta-meses" className="field__input" value={dados.mesesDeReserva} onChange={(evento) => muda({ mesesDeReserva: Number(evento.target.value) })}>
            {[3, 6, 9, 12].map((meses) => <option key={meses} value={meses}>{meses} meses</option>)}
          </select>
        </label>
      </div>
      : <Field
        label={dados.especie === 'fundo' ? 'Despesa prevista *' : 'Valor da meta *'}
        name="meta-objetivo"
        inputMode="decimal"
        value={objetivo}
        onChange={(evento) => setObjetivo(evento.target.value)}
        placeholder="0,00"
      />}

    {reserva && lerValor(essencial) ? <p className="field__hint">
      Objetivo: {formatar((lerValor(essencial) ?? 0) * dados.mesesDeReserva)}
    </p> : null}

    <div className="form-grid">
      <label className="field" htmlFor="meta-prazo">
        <span className="field__label">{dados.especie === 'fundo' ? 'Quando vence' : 'Prazo'}</span>
        <input id="meta-prazo" className="field__input" type="month" value={dados.prazo} onChange={(evento) => muda({ prazo: evento.target.value })} />
      </label>
      <Field
        label="Quanto pretende guardar por mês"
        name="meta-contribuicao"
        inputMode="decimal"
        value={contribuicao}
        onChange={(evento) => setContribuicao(evento.target.value)}
        placeholder="0,00"
      />
    </div>

    <label className="field" htmlFor="meta-integrante">
      <span className="field__label">De quem é</span>
      <select id="meta-integrante" className="field__input" value={dados.integranteId ?? ''} onChange={(evento) => muda({ integranteId: evento.target.value || null })}>
        <option value="">Família</option>
        {integrantes.filter(({ ativo }) => ativo).map((integrante) => <option key={integrante.id} value={integrante.id}>{integrante.nome}</option>)}
      </select>
    </label>

    <div className="form-actions">
      <Button type="submit" icon={<Target size={17} />}>{id ? 'Salvar alterações' : 'Criar'}</Button>
      <button type="button" className="button button--secondary" onClick={onCancelar}>Cancelar</button>
    </div>
  </form>
}
