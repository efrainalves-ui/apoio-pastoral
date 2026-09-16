import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { BookCheck, BookOpen, ChevronLeft, ChevronRight, Clock3, Goal, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { localDateKey } from '../shared/dates'
import { LeituraMesAMes } from '../components/leitura/LeituraMesAMes'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import {
  acumuladoAteOMes, bookProgress, datasCoerentes, formatarTempo, metaDoAno, metasMensaisAntigas, propostaDeSoma, readingMonth,
  relatorioMensal, resumoAnual, revisaoPendente, sessaoDoRegistroRetroativo, type ProgressoDaMeta,
} from '../reading/core'
import { ReadingService } from '../reading/service'
import {
  BOOK_CATEGORIES, BOOK_CATEGORY_LABELS, BOOK_STATUSES, BOOK_STATUS_LABELS, type BookCategory, type BookStatus, type DecisaoSobreMetasAntigas,
  type ReadingBookData, type ReadingEntity, type ReadingGoalRecordData, type ReadingSessionData,
} from '../reading/types'

const service = new ReadingService(); const timestamp = () => new Date().toISOString(); const today = localDateKey
const emptyBook = (): ReadingBookData => ({ title: '', author: '', category: 'theology', totalPages: null, pagesRead: 0, startDate: today(), completedDate: null, status: 'want_to_read', notes: '', createdAt: timestamp(), updatedAt: timestamp() })
type ReadingView = 'all' | 'want_to_read' | 'reading' | 'completed'
const VIEW_LABELS: Record<ReadingView, string> = { all: 'Todos os livros', want_to_read: 'Quero ler', reading: 'Lendo', completed: 'Concluídos' }

const numero = (valor: number) => new Intl.NumberFormat('pt-BR').format(valor)
const rotuloDoMes = (mes: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${mes}-15T12:00:00`))
const nomeDoMes = (mes: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(`${mes}-15T12:00:00`))
const dataCurta = (data: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(`${data}T12:00:00`))
/** Campo vazio é "sem meta" naquele item. */
const campoDeMeta = (texto: string) => texto.trim() === '' ? null : Number(texto)

function ResultadoContraMeta({ nome, unidade, progresso }: { nome: string; unidade: string; progresso: ProgressoDaMeta }) {
  const { feito, meta, percentual, faltam, superadaEm } = progresso
  return <div className="leitura-meta">
    <small>{nome}</small>
    <strong>{meta ? `${numero(feito)} de ${numero(meta)} ${unidade}${superadaEm ? ` — meta superada em ${numero(superadaEm)}` : ''}` : `${numero(feito)} ${unidade}`}</strong>
    {meta && <>
      <progress max={100} value={Math.min(100, percentual ?? 0)} aria-label={`${nome}: ${percentual ?? 0}% da meta`} />
      <span>{superadaEm ? `${percentual ?? 0}%` : `${percentual ?? 0}% · faltam ${numero(faltam ?? 0)}`}</span>
    </>}
  </div>
}

export function ReadingPage() {
  const { account, masterKey } = useAuthVault()
  const mesAtual = readingMonth(new Date()); const anoAtual = mesAtual.slice(0, 4)
  const [books, setBooks] = useState<ReadingEntity<ReadingBookData>[]>([]); const [sessions, setSessions] = useState<ReadingEntity<ReadingSessionData>[]>([]); const [goals, setGoals] = useState<ReadingEntity<ReadingGoalRecordData>[]>([])
  const [view, setView] = useState<ReadingView>('all'); const [bookDraft, setBookDraft] = useState<ReadingBookData | null>(null); const [bookId, setBookId] = useState(''); const [openBookId, setOpenBookId] = useState(''); const formRef = useRef<HTMLDivElement>(null); const sessionRef = useRef<HTMLDivElement>(null)
  const [sessionOpen, setSessionOpen] = useState(false); const [editingSessionId, setEditingSessionId] = useState(''); const [sessionBookId, setSessionBookId] = useState(''); const [sessionDate, setSessionDate] = useState(today()); const [sessionPages, setSessionPages] = useState(0); const [sessionMinutes, setSessionMinutes] = useState(0); const [sessionNotes, setSessionNotes] = useState('')
  const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [minutosDoLivro, setMinutosDoLivro] = useState(0)
  const [ano, setAno] = useState(anoAtual); const [mes, setMes] = useState(mesAtual)
  const [metaAberta, setMetaAberta] = useState(false); const [metaLivros, setMetaLivros] = useState(''); const [metaPaginas, setMetaPaginas] = useState('')
  const [revisaoLivros, setRevisaoLivros] = useState(''); const [revisaoPaginas, setRevisaoPaginas] = useState('')

  const load = useCallback(async () => { if (!account || !masterKey) return; const [nextBooks, nextSessions, nextGoals] = await Promise.all([service.books(account.id, masterKey), service.sessions(account.id, masterKey), service.goals(account.id, masterKey)]); setBooks(nextBooks); setSessions(nextSessions); setGoals(nextGoals) }, [account, masterKey])
  useReloadOnSync(load)
  // Abrir o cadastro leva a tela até ele e deixa o cursor no primeiro campo.
  const formOpen = bookDraft !== null
  useEffect(() => {
    if (!formOpen) return
    formRef.current?.scrollIntoView({ block: 'start' })
    document.getElementById('reading-title')?.focus({ preventScroll: true })
  }, [formOpen])
  // Registrar leitura abria o formulário no fim da página e deixava a tela onde estava.
  useEffect(() => {
    if (!sessionOpen) return
    sessionRef.current?.scrollIntoView({ block: 'start' })
  }, [sessionOpen])

  const meta = metaDoAno(goals, ano)
  const metaAnterior = metaDoAno(goals, String(Number(ano) - 1))
  const resumo = resumoAnual(books, sessions, ano, meta)
  const relatorio = relatorioMensal(books, sessions, mes)
  const acumulado = acumuladoAteOMes(books, sessions, mes)
  const metaDoMesEscolhido = metaDoAno(goals, mes.slice(0, 4))
  const pendente = revisaoPendente(goals); const antigas = metasMensaisAntigas(goals); const proposta = propostaDeSoma(goals)
  const visibleBooks = useMemo(() => view === 'all' ? books : books.filter(({ status }) => status === view), [books, view])
  const bookName = (id: string) => books.find((book) => book.id === id)?.title ?? 'Livro removido'

  async function agir(acao: () => Promise<unknown>, mensagem: string, falha: string) {
    if (!account || !masterKey) return
    setBusy(true); setError('')
    try { await acao(); setNotice(mensagem); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : falha) } finally { setBusy(false) }
  }

  /**
   * Salva o livro e, quando ele já foi lido, a leitura que aconteceu.
   *
   * Páginas e minutos dos totais vêm só das sessões. Um livro registrado depois
   * — lido em fevereiro, cadastrado em setembro — abre a sessão na data certa.
   */
  async function saveBook(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey || !bookDraft) return
    if (!datasCoerentes(bookDraft.startDate, bookDraft.completedDate)) { setError('A data de conclusão não pode ser antes da data de início.'); return }
    setBusy(true); setError('')
    try {
      const salvo = await service.saveBook(account.id, masterKey, bookDraft, bookId || undefined)
      const sessao = bookId ? null : sessaoDoRegistroRetroativo(bookDraft, minutosDoLivro, salvo.id)
      if (sessao) await service.addSession(account.id, masterKey, sessao)
      setBookDraft(null); setBookId(''); setOpenBookId(''); setMinutosDoLivro(0)
      setNotice(sessao ? 'Livro e leitura registrados.' : 'Livro salvo.')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o livro.')
    } finally { setBusy(false) }
  }
  function fecharSessao() { setSessionOpen(false); setEditingSessionId(''); setSessionBookId(''); setSessionDate(today()); setSessionPages(0); setSessionMinutes(0); setSessionNotes('') }
  function editarSessao(sessao: ReadingEntity<ReadingSessionData>) { setEditingSessionId(sessao.id); setSessionBookId(sessao.bookId); setSessionDate(sessao.date); setSessionPages(sessao.pages); setSessionMinutes(sessao.minutes); setSessionNotes(sessao.notes); setSessionOpen(true) }
  async function saveSession(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey) return
    const dados = { date: sessionDate, pages: sessionPages, minutes: sessionMinutes, notes: sessionNotes }
    await agir(async () => {
      if (editingSessionId) await service.updateSession(account.id, masterKey, editingSessionId, dados)
      else await service.addSession(account.id, masterKey, { bookId: sessionBookId, ...dados })
      fecharSessao()
    }, editingSessionId ? 'Leitura atualizada.' : 'Leitura registrada.', 'Não foi possível registrar a leitura.')
  }
  async function excluirSessao(sessao: ReadingEntity<ReadingSessionData>) { if (!account || !masterKey || !window.confirm('Deseja excluir esta leitura?')) return; await agir(() => service.removeSession(account.id, masterKey, sessao.id), 'Leitura excluída.', 'Não foi possível excluir a leitura.') }
  async function complete(book: ReadingEntity<ReadingBookData>) { if (!account || !masterKey) return; await agir(async () => { await service.completeBook(account.id, masterKey, book, today()); setOpenBookId('') }, 'Livro marcado como concluído.', 'Não foi possível concluir o livro.') }
  async function reler(book: ReadingEntity<ReadingBookData>) { if (!account || !masterKey || !window.confirm(`Começar uma nova leitura de ${book.title}? Ela conta de novo só quando for concluída.`)) return; await agir(async () => { await service.rereadBook(account.id, masterKey, book, today()); setOpenBookId('') }, 'Nova leitura iniciada.', 'Não foi possível iniciar a nova leitura.') }
  async function remove(book: ReadingEntity<ReadingBookData>) { if (!account || !masterKey || !window.confirm('Deseja excluir este livro e seu histórico de leituras?')) return; await agir(async () => { await service.removeBook(account.id, masterKey, book.id); setOpenBookId('') }, 'Livro excluído.', 'Não foi possível excluir o livro.') }

  function abrirMeta() { setMetaLivros(meta?.books ? String(meta.books) : ''); setMetaPaginas(meta?.pages ? String(meta.pages) : ''); setMetaAberta(true) }
  async function salvarMeta(event: FormEvent) { event.preventDefault(); if (!account || !masterKey) return; await agir(async () => { await service.saveAnnualGoal(account.id, masterKey, ano, { books: campoDeMeta(metaLivros), pages: campoDeMeta(metaPaginas) }); setMetaAberta(false) }, `Meta anual de ${ano} salva.`, 'Não foi possível salvar a meta.') }
  async function usarMetaAnterior() {
    if (!account || !masterKey || !metaAnterior) return
    const descricao = [metaAnterior.books ? `${metaAnterior.books} livros` : '', metaAnterior.pages ? `${numero(metaAnterior.pages)} páginas` : ''].filter(Boolean).join(' e ')
    if (!window.confirm(`Usar em ${ano} a mesma meta de ${Number(ano) - 1}: ${descricao}?`)) return
    await agir(() => service.saveAnnualGoal(account.id, masterKey, ano, { books: metaAnterior.books, pages: metaAnterior.pages }), `Meta anual de ${ano} salva.`, 'Não foi possível salvar a meta.')
  }
  async function concluirRevisao(decisao: DecisaoSobreMetasAntigas) {
    if (!account || !masterKey) return
    const pergunta = decisao === 'somar' ? 'Criar a meta anual somando as metas mensais antigas?' : decisao === 'ignorar' ? 'Ignorar as metas mensais antigas e começar só com a meta anual?' : `Salvar a meta anual de ${anoAtual}?`
    if (!window.confirm(`${pergunta} As metas antigas continuam guardadas.`)) return
    await agir(() => service.concludeGoalReview(account.id, masterKey, decisao, decisao === 'nova' ? { year: anoAtual, books: campoDeMeta(revisaoLivros), pages: campoDeMeta(revisaoPaginas) } : undefined), 'Revisão das metas antigas concluída.', 'Não foi possível concluir a revisão.')
  }

  return <div className="page-stack reading-page"><header className="page-hero"><div><p className="eyebrow">Área pessoal</p><h1>Leitura</h1></div><div className="page-actions"><Button variant="secondary" icon={<Clock3 />} onClick={() => { fecharSessao(); setSessionOpen(true) }}>Registrar leitura</Button><Button icon={<Plus />} onClick={() => { setBookId(''); setBookDraft(emptyBook()) }}>Adicionar livro</Button></div></header>
    {notice && <div className="alert alert--success" role="status">{notice}</div>}{error && <div className="alert alert--error" role="alert">{error}</div>}

    {pendente && <Card title="Revisar metas antigas" eyebrow={`${antigas.length} meta(s) mensal(is) guardada(s)`}>
      <div className="form-grid">
        <Field label={`Livros em ${anoAtual}`} name="reading-review-books" type="number" min={0} value={revisaoLivros} onChange={(event) => setRevisaoLivros(event.target.value)} />
        <Field label={`Páginas em ${anoAtual}`} name="reading-review-pages" type="number" min={0} value={revisaoPaginas} onChange={(event) => setRevisaoPaginas(event.target.value)} />
      </div>
      {proposta.length > 0 && <p className="field__hint">Somando as mensais: {proposta.map((item) => `${item.year}: ${item.books ?? 0} livros e ${numero(item.pages ?? 0)} páginas`).join(' · ')}.</p>}
      <div className="form-actions">
        <Button disabled={busy} icon={<Goal />} onClick={() => concluirRevisao('nova')}>Salvar nova meta anual</Button>
        {proposta.length > 0 && <Button variant="secondary" disabled={busy} onClick={() => concluirRevisao('somar')}>Somar as metas mensais</Button>}
        <Button variant="quiet" disabled={busy} onClick={() => concluirRevisao('ignorar')}>Ignorar e começar a meta anual</Button>
      </div>
    </Card>}

    <Card title={`Meta anual de ${ano}`} eyebrow="Livros e páginas" action={<div className="leitura-ano"><Button variant="quiet" icon={<ChevronLeft />} aria-label="Ano anterior" onClick={() => { setAno(String(Number(ano) - 1)); setMetaAberta(false) }} /><Button variant="quiet" icon={<ChevronRight />} aria-label="Próximo ano" onClick={() => { setAno(String(Number(ano) + 1)); setMetaAberta(false) }} /></div>}>
      <div className="leitura-metas">
        <ResultadoContraMeta nome="Livros" unidade="livros" progresso={resumo.livros} />
        <ResultadoContraMeta nome="Páginas" unidade="páginas" progresso={resumo.paginas} />
        <div className="leitura-meta"><small>Tempo</small><strong>{formatarTempo(resumo.minutos)} de leitura no ano</strong></div>
      </div>
      {metaAberta
        ? <form onSubmit={salvarMeta}><div className="form-grid">
            <Field label="Livros que desejo concluir" name="reading-annual-books" type="number" min={0} value={metaLivros} onChange={(event) => setMetaLivros(event.target.value)} />
            <Field label="Páginas que desejo ler" name="reading-annual-pages" type="number" min={0} value={metaPaginas} onChange={(event) => setMetaPaginas(event.target.value)} />
          </div><div className="form-actions"><Button type="submit" disabled={busy} icon={<Goal />}>Salvar meta anual</Button><Button type="button" variant="secondary" onClick={() => setMetaAberta(false)}>Cancelar</Button></div></form>
        : <div className="form-actions reading-goal-actions">
            {!meta && <p className="field__hint">Defina a meta anual de livros e páginas de {ano}.</p>}
            <Button variant="secondary" icon={<Goal />} onClick={abrirMeta}>{meta ? 'Editar meta anual' : 'Definir meta anual'}</Button>
            {!meta && metaAnterior && <Button variant="quiet" onClick={usarMetaAnterior}>Usar a mesma meta do ano anterior</Button>}
          </div>}
    </Card>

    {sessionOpen && <div ref={sessionRef}><Card title={editingSessionId ? 'Editar leitura' : 'Registrar leitura'}><form onSubmit={saveSession}><div className="form-grid"><label className="field"><span className="field__label">Livro</span><select className="field__input" value={sessionBookId} disabled={Boolean(editingSessionId)} onChange={(event) => setSessionBookId(event.target.value)} required><option value="">Selecione o livro</option>{books.filter(({ id, status }) => status !== 'completed' || id === sessionBookId).map((book) => <option value={book.id} key={book.id}>{book.title}</option>)}</select></label><Field label="Data" name="reading-session-date" type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} required /><Field label="Páginas lidas" name="reading-session-pages" type="number" min={0} value={sessionPages || ''} onChange={(event) => setSessionPages(Number(event.target.value))} /><Field label="Tempo de leitura (minutos)" name="reading-session-minutes" type="number" min={0} value={sessionMinutes || ''} onChange={(event) => setSessionMinutes(Number(event.target.value))} /></div><label className="field"><span className="field__label">Observação (opcional)</span><textarea className="field__input" rows={3} value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} /></label><div className="form-actions"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar leitura'}</Button><Button type="button" variant="secondary" onClick={fecharSessao}>Cancelar</Button></div></form></Card></div>}

    <Card title="Relatório mensal" eyebrow={rotuloDoMes(mes)}>
      <label className="field" htmlFor="reading-report-month"><span className="field__label">Mês</span><input id="reading-report-month" className="field__input" type="month" value={mes} onChange={(evento) => { if (evento.target.value) setMes(evento.target.value) }} /></label>
      <section className="reading-metrics" aria-label={`Resultado de ${rotuloDoMes(mes)}`}>
        <div><span>Livros concluídos</span><strong>{relatorio.livrosConcluidos.length}</strong></div>
        <div><span>Páginas lidas</span><strong>{numero(relatorio.paginas)}</strong></div>
        <div><span>Tempo de leitura</span><strong>{formatarTempo(relatorio.minutos)}</strong></div>
        <div><span>Sessões</span><strong>{relatorio.sessoes}</strong></div>
        <div><span>Dias com leitura</span><strong>{relatorio.dias}</strong></div>
      </section>
      <p className="field__hint">Progresso anual acumulado até {nomeDoMes(mes)}: {acumulado.livros}{metaDoMesEscolhido?.books ? ` de ${metaDoMesEscolhido.books}` : ''} livro(s) · {numero(acumulado.paginas)}{metaDoMesEscolhido?.pages ? ` de ${numero(metaDoMesEscolhido.pages)}` : ''} páginas · {formatarTempo(acumulado.minutos)} de leitura</p>
      <h3>Livros lidos no mês</h3>
      {relatorio.livrosLidos.length ? <ul className="lista-simples">{relatorio.livrosLidos.map((livro) => <li key={livro.id}>{livro.title}{relatorio.livrosConcluidos.some(({ id }) => id === livro.id) ? ' · concluído' : ''}</li>)}</ul> : <p className="muted">Nenhum livro lido neste mês.</p>}
      <h3>Histórico das sessões</h3>
      {!relatorio.historico.length ? <div className="empty-state"><Clock3 /><strong>Nenhuma leitura registrada neste mês</strong></div> : <div className="reading-history">{relatorio.historico.map((session) => <article key={session.id}><span><strong>{bookName(session.bookId)}</strong><small>{dataCurta(session.date)}</small></span><span>{session.pages} página(s) · {formatarTempo(session.minutes)}</span>{session.notes && <p>{session.notes}</p>}<div className="form-actions"><Button variant="quiet" icon={<Pencil />} aria-label={`Editar leitura de ${dataCurta(session.date)}`} onClick={() => editarSessao(session)} /><Button variant="quiet" icon={<Trash2 />} aria-label={`Excluir leitura de ${dataCurta(session.date)}`} onClick={() => excluirSessao(session)} /></div></article>)}</div>}
    </Card>

    <Card title="Leitura mês a mês" eyebrow={ano}>
      <LeituraMesAMes livros={books} sessoes={sessions} ano={ano} mesSelecionado={mes} onEscolherMes={setMes} />
    </Card>

    <nav className="reading-nav" aria-label="Filtros de leitura">{(Object.keys(VIEW_LABELS) as ReadingView[]).map((item) => <button key={item} className={view === item ? 'active' : ''} aria-pressed={view === item} onClick={() => setView(item)}>{VIEW_LABELS[item]}</button>)}</nav>
    {bookDraft && <div ref={formRef}><Card title={bookId ? 'Editar livro' : 'Adicionar livro'}><form onSubmit={saveBook}><div className="form-grid"><Field label="Título" name="reading-title" value={bookDraft.title} onChange={(event) => setBookDraft({ ...bookDraft, title: event.target.value })} required /><Field label="Autor" name="reading-author" value={bookDraft.author} onChange={(event) => setBookDraft({ ...bookDraft, author: event.target.value })} required /><label className="field"><span className="field__label">Categoria</span><select className="field__input" value={bookDraft.category} onChange={(event) => setBookDraft({ ...bookDraft, category: event.target.value as BookCategory })}>{BOOK_CATEGORIES.map((category) => <option key={category} value={category}>{BOOK_CATEGORY_LABELS[category]}</option>)}</select></label><Field label="Total de páginas (opcional)" name="reading-total-pages" type="number" min={1} value={bookDraft.totalPages ?? ''} onChange={(event) => setBookDraft({ ...bookDraft, totalPages: event.target.value ? Number(event.target.value) : null })} /><Field label="Data de início" name="reading-start" type="date" value={bookDraft.startDate} onChange={(event) => setBookDraft({ ...bookDraft, startDate: event.target.value })} /><label className="field"><span className="field__label">Situação</span><select className="field__input" value={bookDraft.status} onChange={(event) => setBookDraft({ ...bookDraft, status: event.target.value as BookStatus })}>{BOOK_STATUSES.map((status) => <option key={status} value={status}>{BOOK_STATUS_LABELS[status]}</option>)}</select></label><Field label="Data de conclusão" name="reading-completed" type="date" value={bookDraft.completedDate ?? ''} onChange={(event) => setBookDraft({ ...bookDraft, completedDate: event.target.value || null, status: event.target.value ? 'completed' : bookDraft.status })} /><Field label="Páginas lidas" name="reading-pages-read" type="number" min={0} value={bookDraft.pagesRead || ''} onChange={(event) => setBookDraft({ ...bookDraft, pagesRead: Number(event.target.value) })} />{!bookId && <Field label="Tempo de leitura (minutos)" name="reading-book-minutes" type="number" min={0} value={minutosDoLivro || ''} onChange={(event) => setMinutosDoLivro(Number(event.target.value))} />}</div><label className="field"><span className="field__label">Observação pessoal (opcional)</span><textarea className="field__input" rows={3} value={bookDraft.notes} onChange={(event) => setBookDraft({ ...bookDraft, notes: event.target.value })} /></label><div className="form-actions"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar livro'}</Button><Button type="button" variant="secondary" onClick={() => setBookDraft(null)}>Cancelar</Button></div></form></Card></div>}
    <Card title={VIEW_LABELS[view]}>{!visibleBooks.length
      ? <div className="empty-state"><BookOpen /><strong>Nenhum livro nesta lista</strong><Button icon={<Plus />} onClick={() => { setBookId(''); setBookDraft(emptyBook()) }}>Adicionar livro</Button></div>
      : <div className="entity-list reading-list">{visibleBooks.map((book) => { const progress = bookProgress(book); const aberto = openBookId === book.id; return <div key={book.id}>
        <button type="button" className="entity-row entity-row--link" aria-expanded={aberto} onClick={() => setOpenBookId(aberto ? '' : book.id)}>
          <BookOpen aria-hidden="true" />
          <span><strong>{book.title}</strong><small>{book.author} · {BOOK_STATUS_LABELS[book.status]}{book.completedDate ? ` em ${dataCurta(book.completedDate)}` : ''}</small></span>
          <span>{aberto ? 'Fechar' : 'Abrir'}</span>
        </button>
        {aberto && <div className="reading-detail">
          <div className="reading-progress"><strong>{book.pagesRead} página(s) lida(s){book.totalPages ? ` de ${book.totalPages}` : ''}</strong>{progress !== null && <><progress max={100} value={progress} /><small>{progress}% concluído</small></>}</div>
          <p className="muted">{BOOK_CATEGORY_LABELS[book.category]}</p>
          {book.notes && <p>{book.notes}</p>}
          <div className="form-actions">
            {book.status !== 'completed' && <Button variant="secondary" icon={<BookCheck />} onClick={() => complete(book)}>Concluir</Button>}
            {book.status === 'completed' && <Button variant="secondary" icon={<RotateCcw />} onClick={() => reler(book)}>Ler novamente</Button>}
            <Button variant="secondary" icon={<Pencil />} onClick={() => { const { id, ...data } = book; setBookId(id); setBookDraft(data) }}>Editar</Button>
            <Button variant="danger" icon={<Trash2 />} aria-label={`Excluir livro ${book.title}`} onClick={() => remove(book)} />
          </div>
        </div>}
      </div> })}</div>}</Card>
  </div>
}
