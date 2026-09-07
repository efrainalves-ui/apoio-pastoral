import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowLeft, CheckCircle2, Edit3, FileUp, Plus, Save, Trash2, UsersRound, X } from 'lucide-react'
import { type FormEvent, useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { MissionaryService } from '../missionary/service'
import { MEMBROS_POR_GRUPO, quadroDeGrupos } from '../missionary/metasDeGrupos'
import { AGE_GROUP_LABELS, type AgeGroup, type SabbathClassData, type SabbathClassEntity, type SmallGroupData, type SmallGroupEntity, type UapgData, type UapgEntity } from '../missionary/types'
import { extractPdfText, validatePdfFile } from '../imports/pdf'
import { parseClassesDaEscolaSabatina, ehRelatorioDeClasses } from '../imports/escolaSabatina'
import { ehClasseInfantil } from '../imports/classesInfantis'
import { normalizePersonName } from '../people/validation'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'

const service = new MissionaryService()
const district = new DistrictService()
const peopleService = new PeopleService()

type ClassDraft = Omit<SabbathClassData, 'createdAt' | 'updatedAt'>
type GroupDraft = Omit<SmallGroupData, 'createdAt' | 'updatedAt'>
type UapgDraft = Omit<UapgData, 'createdAt' | 'updatedAt'>
interface UnidadeConferida { nome: string; encontrados: string[]; visitantes: string[]; criarInteressados: boolean }
interface PreviaDeClasses { igrejaDoArquivo: string; unidades: UnidadeConferida[] }

type Editor = { type: 'class'; id: string; draft: ClassDraft } | { type: 'group'; id: string; draft: GroupDraft } | { type: 'uapg'; id: string; draft: UapgDraft }

const emptyClass = (): ClassDraft => ({ name: '', churchId: '', teacherId: '', assistantId: null, ageGroup: 'adults', participantIds: [] })
const emptyGroup = (): GroupDraft => ({ name: '', churchId: '', leaderId: '', associateId: null, host: '', address: '', day: '', time: '', participantIds: [], active: true })
const emptyUapg = (): UapgDraft => ({ name: '', churchId: '', smallGroupId: null, notes: '', active: true })

export function CommunityGroupsPage({ embutida = false }: { embutida?: boolean } = {}) {
  const { account, masterKey } = useAuthVault()
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [classes, setClasses] = useState<SabbathClassEntity[]>([])
  const [groups, setGroups] = useState<SmallGroupEntity[]>([])
  const [uapgs, setUapgs] = useState<UapgEntity[]>([])
  const [classDraft, setClassDraft] = useState<ClassDraft>(emptyClass)
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(emptyGroup)
  const [uapgDraft, setUapgDraft] = useState<UapgDraft>(emptyUapg)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importIgreja, setImportIgreja] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importPrevia, setImportPrevia] = useState<PreviaDeClasses | null>(null)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const root = await district.getDistrict(account.id, masterKey)
      const [nextChurches, nextPeople, nextClasses, nextGroups, nextUapgs] = await Promise.all([
        root ? district.listChurches(account.id, masterKey, root.id) : [], peopleService.listPeople(account.id, masterKey),
        service.listClasses(account.id, masterKey), service.listSmallGroups(account.id, masterKey), service.listUapgs(account.id, masterKey),
      ])
      setChurches(nextChurches); setPeople(nextPeople); setClasses(nextClasses); setGroups(nextGroups); setUapgs(nextUapgs)
    } catch { setError('Não foi possível abrir os registros missionários.') }
  }, [account, masterKey])

  useReloadOnSync(load)

  const churchName = (id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja não encontrada'
  const personName = (id: string | null) => people.find((person) => person.id === id)?.name ?? (id ? 'Pessoa não encontrada' : 'Não informado')
  const members = (churchId: string) => people.filter((person) => person.currentChurchId === churchId)
  const linkedGroupName = (id: string | null) => groups.find((group) => group.id === id)?.name ?? (id ? 'PG não encontrado' : 'Sem PG vinculado')
  const clearMessage = () => { setError(''); setNotice('') }
  const toggleParticipant = (ids: string[], id: string) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]

  function churchField(value: string, onChange: (churchId: string) => void) {
    return <label className="field"><span className="field__label">Igreja</span><select className="field__input" value={value} onChange={(event) => onChange(event.target.value)} required><option value="">Selecionar</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label>
  }

  function personField(label: string, churchId: string, value: string | null, onChange: (personId: string) => void, optional = false) {
    return <label className="field"><span className="field__label">{label}</span><select className="field__input" value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={!optional}><option value="">{optional ? 'Não informado' : 'Selecionar'}</option>{members(churchId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
  }

  function participantField(churchId: string, selected: string[], onChange: (ids: string[]) => void) {
    const available = members(churchId)
    return <fieldset className="missionary-participants"><legend>Participantes</legend>{available.length ? available.map((person) => <label key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={() => onChange(toggleParticipant(selected, person.id))} />{person.name}</label>) : <span>Selecione uma igreja com membros cadastrados.</span>}</fieldset>
  }

  function classFields(draft: ClassDraft, update: (next: ClassDraft) => void) {
    return <><div className="form-grid">{churchField(draft.churchId, (churchId) => update({ ...draft, churchId, teacherId: '', assistantId: null, participantIds: [] }))}<Field label="Nome da unidade" name={`class-name-${editor?.id ?? 'new'}`} value={draft.name ?? ''} onChange={(event) => update({ ...draft, name: event.target.value })} />{personField('Professor', draft.churchId, draft.teacherId, (teacherId) => update({ ...draft, teacherId }))}{personField('Auxiliar opcional', draft.churchId, draft.assistantId, (assistantId) => update({ ...draft, assistantId: assistantId || null }), true)}<label className="field"><span className="field__label">Faixa etária</span><select className="field__input" value={draft.ageGroup} onChange={(event) => update({ ...draft, ageGroup: event.target.value as AgeGroup })}>{Object.entries(AGE_GROUP_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>{participantField(draft.churchId, draft.participantIds, (participantIds) => update({ ...draft, participantIds }))}</>
  }

  function groupFields(draft: GroupDraft, update: (next: GroupDraft) => void) {
    return <><div className="form-grid">{churchField(draft.churchId, (churchId) => update({ ...draft, churchId, leaderId: '', associateId: null, participantIds: [] }))}<Field label="Nome" name={`pg-name-${editor?.id ?? 'new'}`} value={draft.name} onChange={(event) => update({ ...draft, name: event.target.value })} required />{personField('Líder', draft.churchId, draft.leaderId, (leaderId) => update({ ...draft, leaderId }))}{personField('Associado opcional', draft.churchId, draft.associateId, (associateId) => update({ ...draft, associateId: associateId || null }), true)}<Field label="Anfitrião" name={`pg-host-${editor?.id ?? 'new'}`} value={draft.host} onChange={(event) => update({ ...draft, host: event.target.value })} /><Field label="Endereço" name={`pg-address-${editor?.id ?? 'new'}`} value={draft.address} onChange={(event) => update({ ...draft, address: event.target.value })} /><Field label="Dia" name={`pg-day-${editor?.id ?? 'new'}`} value={draft.day} onChange={(event) => update({ ...draft, day: event.target.value })} /><Field label="Horário" name={`pg-time-${editor?.id ?? 'new'}`} type="time" value={draft.time} onChange={(event) => update({ ...draft, time: event.target.value })} /></div>{participantField(draft.churchId, draft.participantIds, (participantIds) => update({ ...draft, participantIds }))}</>
  }

  function uapgFields(draft: UapgDraft, update: (next: UapgDraft) => void) {
    const availableGroups = groups.filter((group) => group.churchId === draft.churchId)
    return <div className="form-grid">{churchField(draft.churchId, (churchId) => update({ ...draft, churchId, smallGroupId: null }))}<Field label="Nome" name={`uapg-name-${editor?.id ?? 'new'}`} value={draft.name} onChange={(event) => update({ ...draft, name: event.target.value })} required /><label className="field"><span className="field__label">PG vinculado (opcional)</span><select className="field__input" value={draft.smallGroupId ?? ''} onChange={(event) => update({ ...draft, smallGroupId: event.target.value || null })}><option value="">Sem vínculo</option>{availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="field"><span className="field__label">Observações</span><textarea className="field__input field__textarea" value={draft.notes} onChange={(event) => update({ ...draft, notes: event.target.value })} /></label></div>
  }

  /**
   * O relatório de Classes ES do ACMS sai de uma igreja por vez, e é assim que
   * ele entra. A igreja é escolhida aqui, e não deduzida do cabeçalho: o nome
   * que o ACMS escreve traz sufixo de distrito e associação, e errar a igreja
   * levaria as unidades inteiras para o lugar errado.
   */
  async function lerRelatorioDeClasses(file: File | undefined) {
    if (!file || !importIgreja) return
    setImportBusy(true); clearMessage(); setImportPrevia(null)
    try {
      validatePdfFile(file)
      const texto = await extractPdfText(await file.arrayBuffer())
      if (!ehRelatorioDeClasses(texto)) throw new Error('Este arquivo não parece o relatório de Classes ES do ACMS.')
      const lido = parseClassesDaEscolaSabatina(texto)
      const daIgreja = members(importIgreja)
      setImportPrevia({
        igrejaDoArquivo: lido.igreja,
        unidades: lido.unidades.map((unidade) => {
          const encontrados: string[] = []; const visitantes: string[] = []
          for (const nome of unidade.membros) {
            const pessoa = daIgreja.find((candidato) => normalizePersonName(candidato.name) === normalizePersonName(nome))
            if (pessoa) encontrados.push(pessoa.id); else visitantes.push(nome)
          }
          // Quem não é membro fica na unidade e vira interessado — menos nas
          // classes de crianças, onde a decisão não é dela.
          return { nome: unidade.nome, encontrados, visitantes, criarInteressados: !ehClasseInfantil(unidade.nome) }
        }),
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível ler o relatório.')
    } finally { setImportBusy(false) }
  }

  async function aplicarRelatorioDeClasses() {
    if (!account || !masterKey || !importPrevia) return
    setImportBusy(true); clearMessage()
    try {
      const resultado = await service.importarClasses(account.id, masterKey, importIgreja, importPrevia.unidades.map(({ nome, encontrados, visitantes }) => ({ nome, participantIds: encontrados, visitors: visitantes })))
      const jaInteressados = (await service.listInterests(account.id, masterKey)).filter(({ churchId }) => churchId === importIgreja)
      let novos = 0
      for (const unidade of importPrevia.unidades) {
        if (!unidade.criarInteressados) continue
        for (const nome of unidade.visitantes) {
          if (jaInteressados.some((item) => normalizePersonName(item.name) === normalizePersonName(nome))) continue
          await service.saveInterest(account.id, masterKey, { churchId: importIgreja, name: nome, contact: '', notes: `Participa da unidade ${unidade.nome} da Escola Sabatina.`, status: 'waiting_study' })
          jaInteressados.push({ id: '', churchId: importIgreja, name: nome, contact: '', notes: '', status: 'waiting_study', createdAt: '', updatedAt: '' })
          novos += 1
        }
      }
      setImportPrevia(null)
      setNotice(`${resultado.criadas} unidade(s) criada(s), ${resultado.atualizadas} atualizada(s) e ${novos} interessado(s) cadastrado(s).`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar o relatório.')
    } finally { setImportBusy(false) }
  }

  async function createClass(event: FormEvent) { event.preventDefault(); if (!account || !masterKey) return; clearMessage(); try { await service.saveClass(account.id, masterKey, classDraft); setClassDraft(emptyClass()); setNotice('Classe cadastrada.'); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível cadastrar a classe.') } }
  async function createGroup(event: FormEvent) { event.preventDefault(); if (!account || !masterKey) return; clearMessage(); try { await service.saveSmallGroup(account.id, masterKey, groupDraft); setGroupDraft(emptyGroup()); setNotice('PG cadastrado.'); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível cadastrar o PG.') } }
  async function createUapg(event: FormEvent) { event.preventDefault(); if (!account || !masterKey) return; clearMessage(); try { await service.saveUapg(account.id, masterKey, uapgDraft); setUapgDraft(emptyUapg()); setNotice('UAPG cadastrada.'); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível cadastrar a UAPG.') } }

  async function saveEdit(event: FormEvent) {
    event.preventDefault(); if (!account || !masterKey || !editor) return; clearMessage()
    try {
      if (editor.type === 'class') await service.updateClass(account.id, masterKey, editor.id, editor.draft)
      if (editor.type === 'group') await service.updateSmallGroup(account.id, masterKey, editor.id, editor.draft)
      if (editor.type === 'uapg') await service.updateUapg(account.id, masterKey, editor.id, editor.draft)
      setEditor(null); setNotice('Alterações salvas.'); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar as alterações.') }
  }

  async function remove(id: string, label: string) {
    if (!account || !masterKey || !window.confirm(`Remover ${label}? Esta ação não pode ser desfeita.`)) return
    clearMessage()
    try { await service.remove(account.id, masterKey, id); if (editor?.id === id) setEditor(null); setNotice('Registro removido.'); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível remover o registro.') }
  }

  function row(icon: string, title: string, detail: string, id: string, edit: () => void) {
    return <div className="entity-row missionary-record" key={id}><span className="avatar" aria-hidden="true">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span><Button variant="secondary" icon={<Edit3 />} onClick={edit}>Editar</Button><Button variant="danger" icon={<Trash2 />} onClick={() => void remove(id, title)}>Remover</Button></div>
  }

  const quadro = quadroDeGrupos(churches, people, classes, groups, uapgs)
  const celula = (alcancado: number, meta: number) => <td className={alcancado >= meta ? 'quadro--alcancado' : 'quadro--falta'}>{alcancado}<small>/{meta}</small></td>

  const editorTitle = editor?.type === 'class' ? 'Editar classe da Escola Sabatina' : editor?.type === 'group' ? 'Editar Pequeno Grupo' : 'Editar integração Unidade de Ação e PG'

  return <div className="page-stack">{!embutida && <><Link className="text-link back-link" to="/app/metas"><ArrowLeft />Voltar às metas</Link><header className="page-hero"><div><p className="eyebrow">Missão e discipulado</p><h1>Escola Sabatina e Pequenos Grupos</h1></div><UsersRound /></header></>}{error && <div className="alert alert--error" role="alert">{error}</div>}{notice && <div className="alert alert--success" role="status">{notice}</div>}<Card title="Metas por igreja" eyebrow={`Um grupo para cada ${MEMBROS_POR_GRUPO} membros`}>
    <div className="tabela-rolavel"><table className="quadro-grupos">
      <thead><tr><th scope="col">Igreja</th><th scope="col">Membros</th><th scope="col">Meta</th><th scope="col">Escola Sabatina</th><th scope="col">Pequenos Grupos</th><th scope="col">Integração</th></tr></thead>
      <tbody>{quadro.igrejas.map((linha) => <tr key={linha.churchId}>
        <th scope="row">{linha.nome}</th><td>{linha.membros}</td><td>{linha.meta}</td>
        {celula(linha.escolaSabatina, linha.meta)}{celula(linha.pequenosGrupos, linha.meta)}{celula(linha.integracoes, linha.meta)}
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Distrito</th><td>{quadro.distrito.membros}</td><td>{quadro.distrito.meta}</td>
        {celula(quadro.distrito.escolaSabatina, quadro.distrito.meta)}{celula(quadro.distrito.pequenosGrupos, quadro.distrito.meta)}{celula(quadro.distrito.integracoes, quadro.distrito.meta)}
      </tr></tfoot>
    </table></div>
  </Card><Card title="Importar classes do ACMS" eyebrow="Relatório de Classes ES, uma igreja por vez">
    <div className="form-grid">{churchField(importIgreja, (churchId) => { setImportIgreja(churchId); setImportPrevia(null) })}</div>
    <label className="file-picker"><FileUp /><span><strong>{importBusy ? 'Lendo o relatório…' : 'Escolher PDF'}</strong></span><input type="file" accept="application/pdf,.pdf" disabled={importBusy || !importIgreja} onChange={(event) => { void lerRelatorioDeClasses(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
    {importPrevia && <>
      <div className="import-metrics"><div><small>Igreja no arquivo</small><strong>{importPrevia.igrejaDoArquivo || '—'}</strong></div><div><small>Unidades</small><strong>{importPrevia.unidades.length}</strong></div><div><small>Membros associados</small><strong>{importPrevia.unidades.reduce((total, unidade) => total + unidade.encontrados.length, 0)}</strong></div><div><small>Não são membros</small><strong>{importPrevia.unidades.reduce((total, unidade) => total + unidade.visitantes.length, 0)}</strong></div></div>
      <div className="entity-list">{importPrevia.unidades.map((unidade) => <div className="entity-row" key={unidade.nome}><span><strong>{unidade.nome}</strong><small>{unidade.encontrados.length} membro(s){unidade.visitantes.length ? ` · ${unidade.visitantes.map((nome) => `*${nome}`).join(', ')}` : ''}</small></span>{unidade.visitantes.length > 0 && <label className="confirmation-check"><input type="checkbox" checked={unidade.criarInteressados} onChange={(event) => setImportPrevia((atual) => atual && ({ ...atual, unidades: atual.unidades.map((item) => item.nome === unidade.nome ? { ...item, criarInteressados: event.target.checked } : item) }))} /><span>Cadastrar como interessados</span></label>}</div>)}</div>
      <Button disabled={importBusy} icon={<CheckCircle2 />} onClick={() => void aplicarRelatorioDeClasses()}>Aplicar às classes desta igreja</Button>
    </>}
  </Card><div className="missionary-create-grid"><Card title="Escola Sabatina" eyebrow="Nova classe"><form onSubmit={(event) => void createClass(event)}>{classFields(classDraft, setClassDraft)}<Button type="submit" disabled={!classDraft.churchId || !classDraft.teacherId} icon={<Plus />}>Cadastrar classe</Button></form></Card><Card title="Pequeno Grupo" eyebrow="Novo PG"><form onSubmit={(event) => void createGroup(event)}>{groupFields(groupDraft, setGroupDraft)}<Button type="submit" disabled={!groupDraft.churchId || !groupDraft.name.trim() || !groupDraft.leaderId} icon={<Plus />}>Cadastrar PG</Button></form></Card></div><Card title="Integração Unidade de Ação e PG" eyebrow="Novo registro"><form onSubmit={(event) => void createUapg(event)}>{uapgFields(uapgDraft, setUapgDraft)}<Button type="submit" disabled={!uapgDraft.churchId || !uapgDraft.name.trim()} icon={<Plus />}>Cadastrar integração</Button></form></Card><Card title="Registros missionários" eyebrow={`${classes.length + groups.length + uapgs.length} registro(s)`}>{classes.length + groups.length + uapgs.length === 0 ? <div className="empty-state compact-empty"><UsersRound /><strong>Nenhum registro cadastrado</strong><span>Cadastre uma classe, um PG ou uma integração.</span></div> : <div className="missionary-record-groups"><section><h3>Escola Sabatina</h3><div className="entity-list">{classes.length ? classes.map((item) => row('ES', item.name?.trim() || `Classe ${AGE_GROUP_LABELS[item.ageGroup]}`, `${churchName(item.churchId)} · Professor: ${item.teacherId ? personName(item.teacherId) : 'A definir'} · ${item.participantIds.length} membro(s)${item.visitors?.length ? ` · ${item.visitors.map((nome) => `*${nome}`).join(', ')}` : ''}`, item.id, () => setEditor({ type: 'class', id: item.id, draft: { name: item.name ?? '', churchId: item.churchId, teacherId: item.teacherId, assistantId: item.assistantId, ageGroup: item.ageGroup, participantIds: [...item.participantIds] } }))) : <p className="muted">Nenhuma classe cadastrada.</p>}</div></section><section><h3>Pequenos Grupos</h3><div className="entity-list">{groups.length ? groups.map((item) => row('PG', item.name, `${churchName(item.churchId)} · Líder: ${personName(item.leaderId)} · ${item.day || 'Dia não informado'}${item.time ? ` às ${item.time}` : ''}`, item.id, () => setEditor({ type: 'group', id: item.id, draft: { name: item.name, churchId: item.churchId, leaderId: item.leaderId, associateId: item.associateId, host: item.host, address: item.address, day: item.day, time: item.time, participantIds: [...item.participantIds], active: item.active } }))) : <p className="muted">Nenhum PG cadastrado.</p>}</div></section><section><h3>Integração Unidade de Ação e PG</h3><div className="entity-list">{uapgs.length ? uapgs.map((item) => row('UA', item.name, `${churchName(item.churchId)} · ${linkedGroupName(item.smallGroupId)}`, item.id, () => setEditor({ type: 'uapg', id: item.id, draft: { name: item.name, churchId: item.churchId, smallGroupId: item.smallGroupId, notes: item.notes, active: item.active } }))) : <p className="muted">Nenhuma integração cadastrada.</p>}</div></section></div>}</Card>{editor && <Card title={editorTitle} eyebrow="Dados atuais preenchidos"><form className="missionary-edit-form" onSubmit={(event) => void saveEdit(event)}>{editor.type === 'class' && classFields(editor.draft, (draft) => setEditor({ ...editor, draft }))}{editor.type === 'group' && groupFields(editor.draft, (draft) => setEditor({ ...editor, draft }))}{editor.type === 'uapg' && uapgFields(editor.draft, (draft) => setEditor({ ...editor, draft }))}<div className="form-actions"><Button type="submit" icon={<Save />}>Salvar alterações</Button><Button type="button" variant="secondary" icon={<X />} onClick={() => setEditor(null)}>Cancelar</Button></div></form></Card>}</div>
}
