import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { ClipboardList, PackageCheck, Plus, Split, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { localDateKey } from '../shared/dates'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import { CHURCH_TYPE_LABELS, type ChurchEntity } from '../district/types'
import { comAjustes, distributionPreview, materialStock, materialsSummary } from '../materials/core'
import { CareService } from '../care/service'
import { MaterialsService } from '../materials/service'
import {
  DEFAULT_WEIGHTS, MATERIAL_CATEGORY_LABELS,
  MATERIAL_UNIT_LABELS, NEED_PRIORITY_LABELS, NEED_STATUS_LABELS,
  type DistributionWeights, type MaterialCategory, type MaterialData,
  type MaterialDistributionEntity, type MaterialEntity, type MaterialNeedData, type MaterialNeedEntity,
  type MaterialUnit, type NeedPriority, type NeedStatus,
} from '../materials/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'

const service = new MaterialsService()
const care = new CareService()
const districtService = new DistrictService()
const peopleService = new PeopleService()
const carimbo = () => new Date().toISOString()
const hoje = localDateKey

const abas = { estoque: 'Estoque', distribuicao: 'Distribuição', necessidades: 'Necessidades' } as const
type Aba = keyof typeof abas

const vazioMaterial = (): MaterialData => ({ name: '', category: 'literature', quantity: 0, unit: 'un', date: hoje(), notes: '', createdAt: carimbo(), updatedAt: carimbo() })
const vazioNecessidade = (): MaterialNeedData => ({ item: '', quantity: 1, unit: 'un', priority: 'normal', reason: '', notes: '', taskId: null, status: 'to_request', stockMaterialId: null, createdAt: carimbo(), updatedAt: carimbo() })

export function MaterialsPage() {
  const { account, masterKey } = useAuthVault()
  const [searchParams, setSearchParams] = useSearchParams()
  const aba = (Object.hasOwn(abas, searchParams.get('aba') ?? '') ? searchParams.get('aba') : 'estoque') as Aba

  const [materials, setMaterials] = useState<MaterialEntity[]>([])
  const [distributions, setDistributions] = useState<MaterialDistributionEntity[]>([])
  const [needs, setNeeds] = useState<MaterialNeedEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const [materialDraft, setMaterialDraft] = useState<MaterialData | null>(null)
  const [materialId, setMaterialId] = useState('')
  const [needDraft, setNeedDraft] = useState<MaterialNeedData | null>(null)
  const [needId, setNeedId] = useState('')

  const [distribuindo, setDistribuindo] = useState<MaterialEntity | null>(null)
  const [pesos, setPesos] = useState<DistributionWeights>(DEFAULT_WEIGHTS)
  const [quantidade, setQuantidade] = useState(0)
  const [manual, setManual] = useState<Record<string, number>>({})
  const [entregando, setEntregando] = useState<MaterialDistributionEntity | null>(null)
  /*
    O formulário de entrega nasce abaixo da lista de entregas. Com treze
    igrejas, ele nasce fora da tela: o pastor toca em "Confirmar entrega", nada
    muda no que ele está vendo, e a conclusão é que o botão não funciona.
    Trazê-lo para a vista é o que torna o clique visível.
  */
  const formularioDaEntrega = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (entregando) formularioDaEntrega.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [entregando])
  const [entrega, setEntrega] = useState({ delivered: 0, deliveredAt: hoje(), receivedByPersonId: '', receivedByName: '', notes: '' })

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    try {
      const [listaMateriais, listaDistribuicoes, listaNecessidades] = await Promise.all([
        service.materials(account.id, masterKey), service.distributions(account.id, masterKey), service.needs(account.id, masterKey),
      ])
      setMaterials(listaMateriais.sort((a, b) => b.date.localeCompare(a.date)))
      setDistributions(listaDistribuicoes)
      setNeeds(listaNecessidades.sort((a, b) => a.status.localeCompare(b.status) || a.item.localeCompare(b.item, 'pt-BR')))
      const district = await districtService.getDistrict(account.id, masterKey)
      setChurches(district ? await districtService.listChurches(account.id, masterKey, district.id) : [])
      setPeople(await peopleService.listPeople(account.id, masterKey))
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível abrir os materiais.')
    } finally { setLoading(false) }
  }, [account, masterKey])
  useReloadOnSync(load)

  const nomeDaIgreja = useMemo(() => {
    const porId = new Map(churches.map((church) => [church.id, church.name]))
    return (id: string) => porId.get(id) ?? 'Igreja removida'
  }, [churches])
  const resumo = useMemo(() => materialsSummary(materials, distributions, needs.filter(({ status }) => status === 'to_request').length), [materials, distributions, needs])
  /*
    A divisão é sempre a da regra, com os ajustes por cima. Não há mais "modo":
    editar uma igreja não abandona a regra para as outras.
  */
  const previa = useMemo(
    () => distribuindo ? comAjustes(distributionPreview(churches, quantidade, 'rule', { weights: pesos }), manual) : null,
    [distribuindo, churches, quantidade, pesos, manual],
  )
  const aEntregar = useMemo(() => distributions.filter(({ status }) => status === 'pending'), [distributions])
  const entregues = useMemo(
    () => distributions.filter(({ status }) => status === 'delivered').sort((esquerda, direita) => direita.deliveredAt.localeCompare(esquerda.deliveredAt)),
    [distributions],
  )

  /* Por que não dá para confirmar a divisão agora. Nulo quando dá. */
  const impedimento = !previa ? 'Escolha um material.'
    : previa.available === 0 ? 'Informe quanto quer dividir.'
      : previa.missing > 0 ? `Faltam ${previa.missing} para esta divisão. Diminua a quantidade das igrejas ou aumente o total.`
        : previa.distributed === 0 ? 'Nenhuma igreja recebeu nada nesta divisão. Ajuste os pesos ou as quantidades.'
          : null

  const pronto = async (mensagem: string) => { setNotice(mensagem); setError(''); await load() }
  const falhou = (motivo: unknown) => setError(motivo instanceof Error ? motivo.message : 'Não foi possível salvar.')
  const irPara = (proxima: Aba) => setSearchParams({ aba: proxima })

  async function salvarMaterial() {
    if (!account || !masterKey || !materialDraft) return
    try { await service.saveMaterial(account.id, masterKey, materialDraft, materialId || undefined); setMaterialDraft(null); setMaterialId(''); await pronto('Material registrado.') } catch (motivo) { falhou(motivo) }
  }
  async function salvarNecessidade() {
    if (!account || !masterKey || !needDraft) return
    try {
      // Prioridade alta é uma promessa de fazer alguma coisa. Ela ficava só
      // numa lista que o pastor precisava lembrar de abrir; agora vira tarefa,
      // que é onde o dia é organizado.
      let taskId = needDraft.taskId ?? null
      if (needDraft.priority === 'high' && !taskId) {
        const tarefa = await care.createTask(account.id, masterKey, {
          title: `Conseguir ${needDraft.item.trim()}`,
          description: needDraft.reason.trim(),
          dueAt: new Date().toISOString(),
          priority: 'high', churchId: null, relatedType: null, relatedId: null, reminderMinutes: null,
        })
        taskId = tarefa.id
      }
      await service.saveNeed(account.id, masterKey, { ...needDraft, taskId }, needId || undefined)
      setNeedDraft(null); setNeedId('')
      await pronto(taskId && !needDraft.taskId ? 'Necessidade registrada e tarefa aberta.' : 'Necessidade registrada.')
    } catch (motivo) { falhou(motivo) }
  }
  async function confirmarDistribuicao() {
    if (!account || !masterKey || !distribuindo || !previa) return
    try {
      await service.distribute(account.id, masterKey, distribuindo.id, previa.lines)
      setDistribuindo(null); setQuantidade(0); setManual({})
      await pronto('Distribuição registrada. Confirme cada entrega quando o material chegar à igreja.')
    } catch (motivo) { falhou(motivo) }
  }
  async function confirmarEntrega() {
    if (!account || !masterKey || !entregando) return
    try {
      // A data é a de agora: quem está entregando está entregando agora.
      await service.confirmDelivery(account.id, masterKey, entregando.id, { ...entrega, deliveredAt: hoje(), receivedByPersonId: entrega.receivedByPersonId || null })
      setEntregando(null)
      await pronto('Entrega confirmada.')
    } catch (motivo) { falhou(motivo) }
  }
  async function receberNecessidade(need: MaterialNeedEntity) {
    if (!account || !masterKey) return
    const quantidadeTexto = window.prompt(`Quantos ${MATERIAL_UNIT_LABELS[need.unit]}(s) de ${need.item} chegaram?`, String(need.quantity))
    if (!quantidadeTexto) return
    try {
      await service.receiveNeed(account.id, masterKey, need.id, { quantity: Number(quantidadeTexto.replace(',', '.')), date: hoje(), category: 'literature', notes: '' })
      await pronto('Pedido recebido e lançado no estoque.')
    } catch (motivo) { falhou(motivo) }
  }
  async function apagar(id: string, oQue: string) {
    if (!account || !masterKey || !window.confirm(`Apagar ${oQue}?`)) return
    try { await service.remove(account.id, masterKey, id); await pronto('Registro apagado.') } catch (motivo) { falhou(motivo) }
  }

  if (loading) return <div className="app-loading" role="status">Abrindo os materiais…</div>

  return <div className="page-stack">
    <header className="page-hero"><div><p className="eyebrow">Distrito</p><h1>Materiais</h1></div></header>
    <nav className="budget-nav" aria-label="Áreas de Materiais">
      {(Object.keys(abas) as Aba[]).map((chave) => <button className={aba === chave ? 'active' : ''} key={chave} onClick={() => irPara(chave)}>{abas[chave]}</button>)}
    </nav>
    <section className="budget-metrics" aria-label="Resumo dos materiais">
      <div><span>Materiais</span><strong>{resumo.materials}</strong></div>
      <div><span>Recebido</span><strong>{resumo.received}</strong></div>
      <div><span>Distribuído</span><strong>{resumo.distributed}</strong></div>
      <div><span>A entregar</span><strong>{resumo.pending}</strong></div>
      <div><span>Disponível</span><strong>{resumo.available}</strong></div>
      <div><span>A pedir</span><strong>{resumo.needsToRequest}</strong></div>
    </section>
    {notice && <div className="alert alert--success" role="status">{notice}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}

    {aba === 'estoque' && <>
      <div className="page-actions"><Button icon={<Plus />} onClick={() => { setMaterialId(''); setMaterialDraft(vazioMaterial()) }}>Registrar material recebido</Button></div>
      {materialDraft && <Card title={materialId ? 'Editar material' : 'Material recebido'}>
        <div className="form-grid">
          <label className="field"><span className="field__label">Nome</span><input className="field__input" value={materialDraft.name} onChange={(event) => setMaterialDraft({ ...materialDraft, name: event.target.value })} /></label>
          <label className="field"><span className="field__label">Categoria</span><select className="field__input" value={materialDraft.category} onChange={(event) => setMaterialDraft({ ...materialDraft, category: event.target.value as MaterialCategory })}>{Object.entries(MATERIAL_CATEGORY_LABELS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></label>
          <label className="field"><span className="field__label">Quantidade</span><input className="field__input" type="number" min="0" value={materialDraft.quantity || ''} onChange={(event) => setMaterialDraft({ ...materialDraft, quantity: Number(event.target.value) })} /></label>
          <label className="field"><span className="field__label">Unidade</span><select className="field__input" value={materialDraft.unit} onChange={(event) => setMaterialDraft({ ...materialDraft, unit: event.target.value as MaterialUnit })}>{Object.entries(MATERIAL_UNIT_LABELS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></label>
          <label className="field"><span className="field__label">Data</span><input className="field__input" type="date" value={materialDraft.date} onChange={(event) => setMaterialDraft({ ...materialDraft, date: event.target.value })} /></label>
        </div>
        <label className="field"><span className="field__label">Observação</span><textarea className="field__input field__textarea" value={materialDraft.notes} onChange={(event) => setMaterialDraft({ ...materialDraft, notes: event.target.value })} /></label>
        <div className="form-actions"><Button onClick={salvarMaterial}>Salvar material</Button><Button variant="secondary" onClick={() => setMaterialDraft(null)}>Cancelar</Button></div>
      </Card>}
      <Card title="Estoque">
        {materials.length === 0 ? <p className="card-copy">Nenhum material registrado ainda.</p> : <div className="entity-list">{materials.map((material) => {
          const estoque = materialStock(material, distributions)
          return <div className="entity-row entity-row--acoes" key={material.id}>
            <span className="entity-row__nome">
              <strong>{material.name}</strong>
              <small>{MATERIAL_CATEGORY_LABELS[material.category]} · {material.date} · recebido {estoque.received} {MATERIAL_UNIT_LABELS[material.unit]}(s)</small>
            </span>
            <span className="entity-row__numeros">
              <strong>{estoque.available} disponível</strong>
              <small>Distribuído {estoque.distributed} · a entregar {estoque.pending}</small>
            </span>
            <span className="entity-row__botoes">
              <Button
                variant="secondary"
                icon={<Split />}
                disabled={estoque.available === 0}
                onClick={() => { setDistribuindo(material); setQuantidade(estoque.available); setManual({}); irPara('distribuicao') }}
              >Distribuir</Button>
              <Button variant="quiet" onClick={() => { setMaterialId(material.id); const { id: _id, ...dados } = material; void _id; setMaterialDraft(dados) }}>Editar</Button>
              <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar material ${material.name}`} onClick={() => apagar(material.id, 'este material')} />
            </span>
          </div>
        })}</div>}
      </Card>
    </>}

    {aba === 'distribuicao' && <>
      {/*
        A divisão já chega pronta.

        Antes era preciso digitar quanto dividir, escolher um modo e conferir
        três pesos antes de ver qualquer número — e o pastor já tinha dito
        quanto recebeu ao cadastrar, e a regra já estava guardada. Agora o
        toque em Distribuir mostra a divisão feita, e o que ele faz aqui é
        corrigir o que quiser. A regra fica à mão, recolhida, para quem precisa
        mudá-la.
      */}
      {distribuindo && previa && <Card title={`Dividir ${previa.available} de ${distribuindo.name}`}>
        <div className="entity-list">{previa.lines.map((linha) => <div className="entity-row entity-row--acoes" key={linha.churchId}>
          <span className="entity-row__nome"><strong>{linha.churchName}</strong><small>{CHURCH_TYPE_LABELS[linha.churchType]}</small></span>
          <span className="entity-row__botoes">
            <input
              className="field__input campo-da-divisao"
              type="number"
              min="0"
              aria-label={`Quantidade para ${linha.churchName}`}
              value={linha.quantity}
              onChange={(evento) => setManual({ ...manual, [linha.churchId]: Number(evento.target.value) })}
            />
          </span>
        </div>)}</div>

        <div className="budget-next-grid">
          <span>A dividir<strong>{previa.available}</strong></span>
          <span>Distribuído<strong>{previa.distributed}</strong></span>
          <span>Sobra<strong>{previa.leftover}</strong></span>
          <span>Falta<strong>{previa.missing}</strong></span>
        </div>

        {impedimento && <div className="alert alert--warning" role="status">{impedimento}</div>}
        <div className="form-actions">
          <Button disabled={Boolean(impedimento)} onClick={confirmarDistribuicao}>Confirmar divisão</Button>
          <Button variant="secondary" onClick={() => { setDistribuindo(null); setManual({}) }}>Cancelar</Button>
        </div>

        <details className="regra-da-divisao">
          <summary>Ajustar a regra</summary>
          <div className="form-grid">
            {Object.entries(CHURCH_TYPE_LABELS).map(([tipo, rotulo]) => <label className="field" key={tipo}>
              <span className="field__label">{rotulo} recebe</span>
              <input
                className="field__input"
                type="number"
                min="0"
                value={pesos[tipo as keyof DistributionWeights]}
                onChange={(evento) => { setPesos({ ...pesos, [tipo]: Number(evento.target.value) }); setManual({}) }}
              />
            </label>)}
          </div>
          <label className="field">
            <span className="field__label">Quantidade a dividir</span>
            <input className="field__input" type="number" min="0" value={quantidade || ''} onChange={(evento) => { setQuantidade(Number(evento.target.value)); setManual({}) }} />
          </label>
        </details>
      </Card>}

      <Card title="A entregar">
        {aEntregar.length === 0 ? <p className="card-copy">Nada esperando entrega.</p> : <div className="entity-list">{aEntregar.map((item) => {
          const material = materials.find(({ id }) => id === item.materialId)
          return <div className="entity-row entity-row--acoes" key={item.id}>
            <span className="entity-row__nome"><strong>{nomeDaIgreja(item.churchId)}</strong><small>{material?.name ?? 'Material removido'}</small></span>
            <span className="entity-row__numeros"><strong>{item.planned}</strong></span>
            <span className="entity-row__botoes">
              <Button variant="secondary" icon={<PackageCheck />} onClick={() => { setEntregando(item); setEntrega({ delivered: item.planned, deliveredAt: hoje(), receivedByPersonId: '', receivedByName: '', notes: '' }) }}>Entregar</Button>
              <Button variant="quiet" onClick={() => void service.cancelDistribution(account!.id, masterKey!, item.id).then(() => pronto('Distribuição cancelada.')).catch(falhou)}>Cancelar</Button>
            </span>
          </div>
        })}</div>}
      </Card>

      {/*
        Confirmar entrega pergunta uma coisa só: com quem o material ficou. A
        data e a hora são as de agora — quem está entregando está entregando
        agora, e pedir que ele confirme isso é pedir confirmação do óbvio. A
        quantidade só aparece quando ele diz que entregou outra.
      */}
      {entregando && <div ref={formularioDaEntrega}><Card title={`Entregar em ${nomeDaIgreja(entregando.churchId)}`}>
        <label className="field">
          <span className="field__label">Quem recebeu</span>
          <select className="field__input" value={entrega.receivedByPersonId} onChange={(evento) => setEntrega({ ...entrega, receivedByPersonId: evento.target.value })}>
            <option value="">Escrever o nome</option>
            {people.filter((person) => person.currentChurchId === entregando.churchId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        {!entrega.receivedByPersonId && <label className="field">
          <span className="field__label">Nome de quem recebeu</span>
          <input className="field__input" value={entrega.receivedByName} onChange={(evento) => setEntrega({ ...entrega, receivedByName: evento.target.value })} />
        </label>}

        <details>
          <summary>Entreguei quantidade diferente de {entregando.planned}</summary>
          <label className="field">
            <span className="field__label">Quantidade entregue</span>
            <input className="field__input" type="number" min="0" value={entrega.delivered || ''} onChange={(evento) => setEntrega({ ...entrega, delivered: Number(evento.target.value) })} />
          </label>
        </details>

        <div className="form-actions">
          <Button onClick={confirmarEntrega}>Confirmar entrega</Button>
          <Button variant="secondary" onClick={() => setEntregando(null)}>Cancelar</Button>
        </div>
      </Card></div>}

      {entregues.length > 0 && <Card eyebrow="Histórico" title="Entregues">
        <div className="entity-list">{entregues.map((item) => {
          const material = materials.find(({ id }) => id === item.materialId)
          return <div className="entity-row entity-row--texto" key={item.id}>
            <span><strong>{nomeDaIgreja(item.churchId)}</strong><small>{material?.name ?? 'Material removido'} · {item.deliveredAt} · para {item.receivedByName || 'membro cadastrado'}</small></span>
            <strong>{item.delivered}</strong>
          </div>
        })}</div>
      </Card>}
    </>}

    {aba === 'necessidades' && <>
      <div className="page-actions"><Button icon={<Plus />} onClick={() => { setNeedId(''); setNeedDraft(vazioNecessidade()) }}>Nova necessidade</Button></div>
      {needDraft && <Card title={needId ? 'Editar necessidade' : 'Necessidade / pedido à Associação'}>
        <div className="form-grid">
          <label className="field"><span className="field__label">Item</span><input className="field__input" value={needDraft.item} onChange={(event) => setNeedDraft({ ...needDraft, item: event.target.value })} /></label>
          <label className="field"><span className="field__label">Quantidade</span><input className="field__input" type="number" min="0" value={needDraft.quantity || ''} onChange={(event) => setNeedDraft({ ...needDraft, quantity: Number(event.target.value) })} /></label>
          <label className="field"><span className="field__label">Unidade</span><select className="field__input" value={needDraft.unit} onChange={(event) => setNeedDraft({ ...needDraft, unit: event.target.value as MaterialUnit })}>{Object.entries(MATERIAL_UNIT_LABELS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></label>
          <label className="field"><span className="field__label">Prioridade</span><select className="field__input" value={needDraft.priority} onChange={(event) => setNeedDraft({ ...needDraft, priority: event.target.value as NeedPriority })}>{Object.entries(NEED_PRIORITY_LABELS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></label>
          <label className="field"><span className="field__label">Situação</span><select className="field__input" value={needDraft.status} onChange={(event) => setNeedDraft({ ...needDraft, status: event.target.value as NeedStatus })}>{Object.entries(NEED_STATUS_LABELS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></label>
        </div>
        <label className="field"><span className="field__label">Motivo</span><input className="field__input" value={needDraft.reason} onChange={(event) => setNeedDraft({ ...needDraft, reason: event.target.value })} /></label>
        <label className="field"><span className="field__label">Observação</span><textarea className="field__input field__textarea" value={needDraft.notes} onChange={(event) => setNeedDraft({ ...needDraft, notes: event.target.value })} /></label>
        <div className="form-actions"><Button onClick={salvarNecessidade}>Salvar necessidade</Button><Button variant="secondary" onClick={() => setNeedDraft(null)}>Cancelar</Button></div>
      </Card>}
      <Card title="Necessidades e pedidos" action={<ClipboardList />}>
        {needs.length === 0 ? <p className="card-copy">Nenhuma necessidade registrada.</p> : <div className="entity-list">{needs.map((need) => <div className="entity-row" key={need.id}>
          <span><strong>{need.item}</strong><small>{need.quantity} {MATERIAL_UNIT_LABELS[need.unit]}(s) · {NEED_PRIORITY_LABELS[need.priority]} · {NEED_STATUS_LABELS[need.status]}{need.reason ? ` · ${need.reason}` : ''}</small></span>
          {need.status !== 'received' && need.status !== 'cancelled' && <Button variant="secondary" icon={<PackageCheck />} onClick={() => receberNecessidade(need)}>Recebi</Button>}
          <Button variant="quiet" onClick={() => { setNeedId(need.id); const { id: _id, ...dados } = need; void _id; setNeedDraft(dados) }}>Editar</Button>
          <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar necessidade ${need.item}`} onClick={() => apagar(need.id, 'esta necessidade')} />
        </div>)}</div>}
      </Card>
    </>}
  </div>
}
