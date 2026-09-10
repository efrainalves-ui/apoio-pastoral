import { ChevronDown, ChevronUp, Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { NaturezaDoLancamento } from '../../family-budget/catalogo'
import { emReais, formatar, lerValor } from '../../family-budget/dinheiro'
import {
  FORMA_DE_PAGAMENTO_LABELS, FORMAS_DE_PAGAMENTO, RECORRENCIA_LABELS, RECORRENCIAS,
  type Cartao, type Conta, type FormaDePagamento, type Integrante, type LancamentoData, type Recorrencia,
} from '../../family-budget/lancamento'
import type { PlanoDeParcelamento } from '../../family-budget/series'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { SeletorDeCategoria } from './SeletorDeCategoria'

const hoje = () => {
  const agora = new Date()
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
}

export function lancamentoVazio(natureza: NaturezaDoLancamento): LancamentoData {
  const data = hoje()
  return {
    natureza, descricao: '', valor: 0, subcategoria: '', data, competencia: data.slice(0, 7),
    vencimento: natureza === 'saida' ? data : '',
    situacao: natureza === 'entrada' ? 'prevista' : 'pendente',
    tipo: 'variavel', formaDePagamento: null, contaId: null, cartaoId: null,
    integranteId: null, referenteA: null, recorrencia: 'nenhuma', serieId: null,
    parcelamento: null, descontadoNaFonte: false, observacao: '', createdAt: '', updatedAt: '',
  }
}

interface FormularioDeLancamentoProps {
  natureza: NaturezaDoLancamento
  valorInicial: LancamentoData
  contas: Conta[]
  cartoes: Cartao[]
  integrantes: Integrante[]
  editando: boolean
  onSalvar: (dados: LancamentoData, parcelamento?: PlanoDeParcelamento) => void
  onCancelar: () => void
}

/**
 * O cadastro de um lançamento.
 *
 * A primeira etapa tem seis campos e cabe na tela: descrição, valor,
 * categoria, data, vencimento e situação. Todo o resto — competência, conta,
 * cartão, quem pagou, para quem foi, recorrência, parcelamento — fica atrás de
 * "Mais detalhes". Um formulário com dezoito campos abertos é um formulário
 * que ninguém preenche até o fim, e entrevista pela metade não vale nada.
 */
export function FormularioDeLancamento({
  natureza, valorInicial, contas, cartoes, integrantes, editando, onSalvar, onCancelar,
}: FormularioDeLancamentoProps) {
  const [dados, setDados] = useState<LancamentoData>(valorInicial)
  const [valorDigitado, setValorDigitado] = useState(valorInicial.valor ? String(emReais(valorInicial.valor)).replace('.', ',') : '')
  const [detalhes, setDetalhes] = useState(false)
  const [parcelas, setParcelas] = useState(0)
  const [jaPagas, setJaPagas] = useState(0)
  const [erro, setErro] = useState('')

  const entrada = natureza === 'entrada'
  const muda = (mudanca: Partial<LancamentoData>) => setDados((atual) => ({ ...atual, ...mudanca }))

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const valor = lerValor(valorDigitado)
    if (!dados.descricao.trim()) { setErro('Informe uma descrição.'); return }
    if (valor === null || valor <= 0) { setErro('Informe um valor maior que zero.'); return }
    if (!dados.subcategoria) { setErro('Escolha uma categoria.'); return }
    setErro('')

    const plano = parcelas > 1 ? { total: valor, parcelas, jaPagas } : undefined
    onSalvar({ ...dados, valor, descricao: dados.descricao.trim() }, plano)
  }

  return <form className="formulario-lancamento" onSubmit={enviar} noValidate>
    {erro && <div className="alert alert--error" role="alert">{erro}</div>}

    <div className="form-grid">
      <Field
        label="Descrição *"
        name="lancamento-descricao"
        value={dados.descricao}
        onChange={(evento) => muda({ descricao: evento.target.value })}
        maxLength={120}
        autoFocus
      />
      <Field
        label="Valor *"
        name="lancamento-valor"
        inputMode="decimal"
        value={valorDigitado}
        onChange={(evento) => setValorDigitado(evento.target.value)}
        placeholder="0,00"
        hint={lerValor(valorDigitado) ? formatar(lerValor(valorDigitado)!) : undefined}
      />
    </div>

    <SeletorDeCategoria
      natureza={natureza}
      valor={dados.subcategoria}
      onEscolher={(codigo) => muda({ subcategoria: codigo })}
    />

    <div className="form-grid">
      <Field
        label={entrada ? 'Data do recebimento *' : 'Data *'}
        name="lancamento-data"
        type="date"
        value={dados.data}
        onChange={(evento) => {
          const data = evento.target.value
          // A competência acompanha a data enquanto ninguém a separa à mão.
          muda(dados.competencia === dados.data.slice(0, 7) ? { data, competencia: data.slice(0, 7) } : { data })
        }}
      />
      {!entrada && <Field
        label="Vencimento"
        name="lancamento-vencimento"
        type="date"
        value={dados.vencimento}
        onChange={(evento) => muda({ vencimento: evento.target.value })}
      />}
    </div>

    <fieldset className="escolha-situacao">
      <legend className="field__label">Situação</legend>
      {(entrada ? ['prevista', 'recebida'] : ['pendente', 'paga']).map((situacao) => <button
        key={situacao}
        type="button"
        className={`chip-filtro ${dados.situacao === situacao ? 'chip-filtro--ativo' : ''}`}
        aria-pressed={dados.situacao === situacao}
        onClick={() => muda({ situacao: situacao as LancamentoData['situacao'] })}
      >{situacao === 'prevista' ? 'Prevista' : situacao === 'recebida' ? 'Recebida' : situacao === 'pendente' ? 'Pendente' : 'Paga'}</button>)}
    </fieldset>

    {/*
      O dízimo descontado na folha precisa aparecer no acompanhamento — é
      dízimo devolvido, e o total do ano importa. Mas não pode descontar de
      novo: o dinheiro nunca chegou à conta.
    */}
    {dados.subcategoria === 'generosidade.dizimo' && <label className="marca-dizimo">
      <input
        type="checkbox"
        checked={dados.descontadoNaFonte}
        onChange={(evento) => muda({ descontadoNaFonte: evento.target.checked })}
      />
      <span>
        <strong>Já foi descontado do salário</strong>
        <small>Entra no acompanhamento, mas não diminui o disponível outra vez.</small>
      </span>
    </label>}

    <button type="button" className="linhas-visita__mais" onClick={() => setDetalhes((atual) => !atual)}>
      {detalhes ? 'Menos detalhes' : 'Mais detalhes'}{detalhes ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
    </button>

    {detalhes && <div className="detalhes-lancamento">
      <div className="form-grid">
        <label className="field" htmlFor="lancamento-competencia">
          <span className="field__label">Competência</span>
          <input
            id="lancamento-competencia"
            className="field__input"
            type="month"
            value={dados.competencia}
            onChange={(evento) => muda({ competencia: evento.target.value })}
          />
          <span className="field__hint">Salário de agosto recebido em setembro fica com competência de agosto.</span>
        </label>

        {!entrada && <label className="field" htmlFor="lancamento-tipo">
          <span className="field__label">Tipo</span>
          <select id="lancamento-tipo" className="field__input" value={dados.tipo} onChange={(evento) => muda({ tipo: evento.target.value as LancamentoData['tipo'] })}>
            <option value="variavel">Variável</option>
            <option value="fixa">Fixa</option>
          </select>
        </label>}
      </div>

      <div className="form-grid">
        {!entrada && <label className="field" htmlFor="lancamento-forma">
          <span className="field__label">Forma de pagamento</span>
          <select
            id="lancamento-forma"
            className="field__input"
            value={dados.formaDePagamento ?? ''}
            onChange={(evento) => muda({ formaDePagamento: (evento.target.value || null) as FormaDePagamento | null })}
          >
            <option value="">Não informar</option>
            {FORMAS_DE_PAGAMENTO.map((forma) => <option key={forma} value={forma}>{FORMA_DE_PAGAMENTO_LABELS[forma]}</option>)}
          </select>
        </label>}

        <label className="field" htmlFor="lancamento-conta">
          <span className="field__label">{entrada ? 'Conta de destino' : 'Conta'}</span>
          <select id="lancamento-conta" className="field__input" value={dados.contaId ?? ''} onChange={(evento) => muda({ contaId: evento.target.value || null })}>
            <option value="">Não informar</option>
            {contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
          </select>
        </label>
      </div>

      {!entrada && dados.formaDePagamento === 'credito' && <label className="field" htmlFor="lancamento-cartao">
        <span className="field__label">Cartão</span>
        <select id="lancamento-cartao" className="field__input" value={dados.cartaoId ?? ''} onChange={(evento) => muda({ cartaoId: evento.target.value || null })}>
          <option value="">Não informar</option>
          {cartoes.map((cartao) => <option key={cartao.id} value={cartao.id}>{cartao.nome}</option>)}
        </select>
      </label>}

      <div className="form-grid">
        <label className="field" htmlFor="lancamento-integrante">
          <span className="field__label">{entrada ? 'Recebido por' : 'Pago por'}</span>
          <select id="lancamento-integrante" className="field__input" value={dados.integranteId ?? ''} onChange={(evento) => muda({ integranteId: evento.target.value || null })}>
            <option value="">Família</option>
            {integrantes.filter(({ ativo }) => ativo).map((integrante) => <option key={integrante.id} value={integrante.id}>{integrante.nome}</option>)}
          </select>
        </label>

        {!entrada && <label className="field" htmlFor="lancamento-referente">
          <span className="field__label">Referente a</span>
          <select id="lancamento-referente" className="field__input" value={dados.referenteA ?? ''} onChange={(evento) => muda({ referenteA: evento.target.value || null })}>
            <option value="">Família</option>
            {integrantes.filter(({ ativo }) => ativo).map((integrante) => <option key={integrante.id} value={integrante.id}>{integrante.nome}</option>)}
          </select>
          <span className="field__hint">Quem pagou pode ser diferente de para quem foi.</span>
        </label>}
      </div>

      {!editando && <div className="form-grid">
        <label className="field" htmlFor="lancamento-recorrencia">
          <span className="field__label">Repetição</span>
          <select
            id="lancamento-recorrencia"
            className="field__input"
            value={dados.recorrencia}
            onChange={(evento) => muda({ recorrencia: evento.target.value as Recorrencia })}
            disabled={parcelas > 1}
          >
            {RECORRENCIAS.map((recorrencia) => <option key={recorrencia} value={recorrencia}>{RECORRENCIA_LABELS[recorrencia]}</option>)}
          </select>
        </label>

        {!entrada && <Field
          label="Parcelas"
          name="lancamento-parcelas"
          type="number"
          min={0}
          max={360}
          value={parcelas || ''}
          onChange={(evento) => setParcelas(Number(evento.target.value) || 0)}
          hint={parcelas > 1 ? 'O valor acima é o total da compra.' : undefined}
        />}
      </div>}

      {/*
        A dívida que já começou antes do aplicativo. Sem este campo o pastor
        teria de cadastrar as parcelas que já pagou só para o número bater.
      */}
      {!editando && parcelas > 1 && <Field
        label="Parcelas já pagas antes"
        name="lancamento-ja-pagas"
        type="number"
        min={0}
        max={parcelas - 1}
        value={jaPagas || ''}
        onChange={(evento) => setJaPagas(Math.min(Number(evento.target.value) || 0, parcelas - 1))}
        hint={jaPagas > 0 ? `Entram ${parcelas - jaPagas} parcelas, numeradas de ${jaPagas + 1} a ${parcelas}.` : undefined}
      />}

      <label className="field" htmlFor="lancamento-observacao">
        <span className="field__label">Observação</span>
        <textarea
          id="lancamento-observacao"
          className="field__input field__textarea"
          rows={2}
          value={dados.observacao}
          onChange={(evento) => muda({ observacao: evento.target.value })}
          maxLength={500}
        />
      </label>
    </div>}

    <div className="form-actions">
      <Button type="submit" icon={<Save size={17} />}>{editando ? 'Salvar alterações' : entrada ? 'Salvar entrada' : 'Salvar saída'}</Button>
      <button type="button" className="button button--secondary" onClick={onCancelar}>Cancelar</button>
    </div>
  </form>
}
